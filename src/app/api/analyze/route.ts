import { NextRequest } from "next/server";
import { runFullWorkflowLocal } from "@/lib/agent/workflow";

// Compat entry point. Runs the full three-step workflow in a single request.
// NOT used in production — total runtime (~30–60s) exceeds the Vercel Hobby
// 10s function timeout. Retained for local E2E tests and mock/debug flows.
// Production clients call /api/analyze/extract, /match, /suggest independently.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { jdText?: string; resumeText?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jdText = (body.jdText ?? "").trim();
  const resumeText = (body.resumeText ?? "").trim();
  if (jdText.length < 200 || resumeText.length < 200) {
    return Response.json(
      { error: "Both JD and resume must be at least 200 characters." },
      { status: 422 }
    );
  }

  try {
    const result = await runFullWorkflowLocal(jdText, resumeText);
    return Response.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
