import { NextRequest } from "next/server";
import { runSuggestion } from "@/lib/agent/workflow";
import { validateSuggestions } from "@/lib/agent/validator";
import type { MatchingResult } from "@/lib/agent/schemas";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let body: {
    matching?: MatchingResult;
    resumeText?: string;
    jdText?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: { code: "BAD_JSON", message: "Invalid JSON body." } },
      { status: 400 }
    );
  }

  const resumeText = (body.resumeText ?? "").trim();
  const jdText = (body.jdText ?? "").trim();
  if (!body.matching || !resumeText || !jdText) {
    return Response.json(
      {
        success: false,
        error: {
          code: "MISSING_INPUT",
          message:
            "Missing `matching`, `resumeText`, or `jdText`. All three are required.",
        },
      },
      { status: 422 }
    );
  }

  try {
    const { result, metadata } = await runSuggestion(
      body.matching,
      resumeText,
      jdText
    );
    const validation = validateSuggestions(result, resumeText, jdText);
    return Response.json({
      success: true,
      data: { suggestions: result, validation },
      metadata,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        success: false,
        error: {
          code: "SUGGEST_FAILED",
          message:
            "Suggestions generation failed. You can still see the match analysis above. Retry to generate suggestions.",
          detail: message,
        },
      },
      { status: 500 }
    );
  }
}
