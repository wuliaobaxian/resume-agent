import { NextRequest } from "next/server";
import { runMatching } from "@/lib/agent/workflow";
import type { ExtractionResult } from "@/lib/agent/schemas";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let body: { extraction?: ExtractionResult } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: { code: "BAD_JSON", message: "Invalid JSON body." } },
      { status: 400 }
    );
  }

  if (!body.extraction || typeof body.extraction !== "object") {
    return Response.json(
      {
        success: false,
        error: {
          code: "MISSING_EXTRACTION",
          message: "Missing `extraction` payload from the extract step.",
        },
      },
      { status: 422 }
    );
  }

  try {
    const { result, metadata } = await runMatching(body.extraction);
    return Response.json({ success: true, data: result, metadata });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        success: false,
        error: {
          code: "MATCH_FAILED",
          message: "Failed to analyze the match. Please retry.",
          detail: message,
        },
      },
      { status: 500 }
    );
  }
}
