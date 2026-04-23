import { NextRequest } from "next/server";
import { runExtraction } from "@/lib/agent/workflow";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let body: { jdText?: string; resumeText?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: { code: "BAD_JSON", message: "Invalid JSON body." } },
      { status: 400 }
    );
  }

  const jdText = (body.jdText ?? "").trim();
  const resumeText = (body.resumeText ?? "").trim();
  if (jdText.length < 200 || resumeText.length < 200) {
    return Response.json(
      {
        success: false,
        error: {
          code: "INPUT_TOO_SHORT",
          message:
            "Both JD and resume must be at least 200 characters.",
        },
      },
      { status: 422 }
    );
  }

  try {
    const { result, metadata } = await runExtraction(jdText, resumeText);
    return Response.json({ success: true, data: result, metadata });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        success: false,
        error: {
          code: "EXTRACT_FAILED",
          message:
            "Failed to extract information from your JD/resume. Please retry.",
          detail: message,
        },
      },
      { status: 500 }
    );
  }
}
