import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import type { ParseError, ParseResult } from "@/lib/types";
import { cleanText, countWords } from "@/lib/parse-utils";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const MIN_CHARS = 200;
const SCANNED_PDF_THRESHOLD = 100;

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

function detectFileType(
  name: string,
  mime: string
): "pdf" | "docx" | "txt" | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (
    lower.endsWith(".docx") ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (lower.endsWith(".txt") || mime.startsWith("text/")) return "txt";
  return null;
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail(
      400,
      "PARSE_FAILED",
      "Invalid upload. Expected multipart/form-data with a 'file' field.",
      "Retry the upload."
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return fail(
      400,
      "PARSE_FAILED",
      "No file received.",
      "Select a file and try again."
    );
  }

  if (file.size > MAX_BYTES) {
    return fail(
      413,
      "FILE_TOO_LARGE",
      `File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max allowed is 5 MB.`,
      "Compress the file or paste your resume text directly."
    );
  }

  const fileType = detectFileType(file.name, file.type);
  if (!fileType) {
    return fail(
      415,
      "UNSUPPORTED_FORMAT",
      `Unsupported file type: ${file.type || file.name}. We accept PDF, DOCX, and TXT.`,
      "Export your resume as PDF or DOCX, or paste the text directly."
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rawText = "";

  try {
    if (fileType === "pdf") {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        rawText = result.text || "";
      } finally {
        await parser.destroy().catch(() => {});
      }
      if (rawText.trim().length < SCANNED_PDF_THRESHOLD) {
        return fail(
          422,
          "SCANNED_PDF",
          "This looks like a scanned or image-based PDF. We can't reliably read text from it. Please paste your resume text directly, or export a text-based version from Word/Google Docs.",
          "Switch to the 'Paste Text' tab and paste your resume content."
        );
      }
    } else if (fileType === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value || "";
    } else {
      rawText = buffer.toString("utf8");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(
      422,
      "PARSE_FAILED",
      `We couldn't parse this file. ${msg.slice(0, 140)}`,
      "Try a different export, or paste the text directly."
    );
  }

  const text = cleanText(rawText);
  if (text.length < MIN_CHARS) {
    return fail(
      422,
      "TOO_SHORT",
      `Parsed resume is only ${text.length} characters — too short for reliable analysis.`,
      "Make sure the file contains your full resume, or paste it as text."
    );
  }

  const body: ParseResult = {
    success: true,
    text,
    metadata: {
      fileName: file.name,
      fileType,
      charCount: text.length,
      wordCount: countWords(text),
    },
  };
  return NextResponse.json(body);
}
