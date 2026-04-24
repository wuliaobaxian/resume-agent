import { NextRequest } from "next/server";
import {
  runExtract,
  runMatch,
  runSuggest,
  sumTokens,
} from "@/lib/agent/workflow";
import { validateSuggestions } from "@/lib/agent/validator";

export const runtime = "nodejs";
export const maxDuration = 300;

// GLM-4.6 is high-quality but slow — extract alone can take ~60s for rich documents.
// 240s total covers the three-step chain with headroom.
const TIMEOUT_MS = 240_000;

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  let body: { jdText?: string; resumeText?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const jdText = (body.jdText ?? "").trim();
  const resumeText = (body.resumeText ?? "").trim();

  if (jdText.length < 200 || resumeText.length < 200) {
    return new Response(
      JSON.stringify({
        error:
          "Both JD and resume must be at least 200 characters. Go back and paste fuller content.",
      }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  const modelUsed = process.env.ZHIPU_MODEL || "glm-4.6";
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(sseLine(event, data)));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const startedAt = Date.now();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        send("error", {
          message:
            "Analysis took too long. This usually happens with very long documents. Please try shortening or retry.",
          step: "timeout",
        });
        close();
      }, TIMEOUT_MS);

      const usages: unknown[] = [];

      // Step 1 — Extract
      send("progress", { step: "extract", status: "start" });
      let extraction;
      try {
        const ex = await runExtract(jdText, resumeText);
        if (timedOut) return;
        usages.push(ex.usage);
        extraction = ex.data;
        send("progress", { step: "extract", status: "done" });
      } catch (err) {
        if (timedOut) return;
        clearTimeout(timeout);
        send("error", {
          message:
            "Failed to extract information from your JD/resume. Please check the format and try again.",
          step: "extract",
          detail: err instanceof Error ? err.message : String(err),
        });
        return close();
      }

      // Step 2 — Match
      send("progress", { step: "match", status: "start" });
      let matching;
      try {
        const mt = await runMatch(extraction);
        if (timedOut) return;
        usages.push(mt.usage);
        matching = mt.data;
        send("progress", { step: "match", status: "done" });
      } catch (err) {
        if (timedOut) return;
        clearTimeout(timeout);
        send("error", {
          message: `Failed to analyze the match. ${
            err instanceof Error ? err.message : String(err)
          }. Please retry.`,
          step: "match",
        });
        return close();
      }

      // Step 3 — Suggest (degradable)
      send("progress", { step: "suggest", status: "start" });
      try {
        const sg = await runSuggest(matching, resumeText, jdText);
        if (timedOut) return;
        usages.push(sg.usage);
        const validation = validateSuggestions(sg.data, resumeText, jdText);
        send("progress", { step: "suggest", status: "done" });
        send("result", {
          extraction,
          matching,
          suggestions: sg.data,
          validation,
          metadata: {
            totalTokens: sumTokens(usages),
            durationMs: Date.now() - startedAt,
            modelUsed,
          },
        });
        clearTimeout(timeout);
        return close();
      } catch (err) {
        if (timedOut) return;
        clearTimeout(timeout);
        // Graceful degrade: return matching without suggestions.
        send("partial", {
          extraction,
          matching,
          metadata: {
            totalTokens: sumTokens(usages),
            durationMs: Date.now() - startedAt,
            modelUsed,
          },
          failedStep: "suggest",
          message:
            "Suggestions generation failed. You can still see the match analysis above. Retry to generate suggestions.",
          detail: err instanceof Error ? err.message : String(err),
        });
        return close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
