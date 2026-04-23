import { NextRequest, NextResponse } from "next/server";
import type { ParseError, ParseResult } from "@/lib/types";
import { cleanText, countWords } from "@/lib/parse-utils";

export const runtime = "nodejs";

const MIN_CHARS = 200;
const WARN_CHARS = 500;
const MAX_CHARS = 15000;

function fail(
  status: number,
  code: ParseError["error"]["code"],
  message: string,
  suggestion?: string
) {
  const body: ParseError = {
    success: false,
    error: { code, message, suggestion },
  };
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return fail(400, "PARSE_FAILED", "Invalid JSON body.");
  }

  const raw =
    typeof payload === "object" &&
    payload !== null &&
    "text" in payload &&
    typeof (payload as { text: unknown }).text === "string"
      ? (payload as { text: string }).text
      : "";

  let text = cleanText(raw);
  const warnings: string[] = [];

  if (text.length < MIN_CHARS) {
    return fail(
      422,
      "TOO_SHORT",
      "Your JD is too short for reliable analysis. Paste the full job description including responsibilities and requirements.",
      `Current length: ${text.length} chars. Aim for 500+ for best results.`
    );
  }

  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    warnings.push(
      `JD was truncated to ${MAX_CHARS} characters; analysis will focus on the earlier portion.`
    );
  }

  if (text.length < WARN_CHARS) {
    warnings.push("JD seems short, analysis quality may be limited.");
  }

  const body: ParseResult = {
    success: true,
    text,
    metadata: {
      charCount: text.length,
      wordCount: countWords(text),
      warnings: warnings.length ? warnings : undefined,
    },
  };
  return NextResponse.json(body);
}
