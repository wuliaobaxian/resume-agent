// Shared type definitions for input parsing / validation.

export type ParseErrorCode =
  | "SCANNED_PDF"
  | "UNSUPPORTED_FORMAT"
  | "FILE_TOO_LARGE"
  | "PARSE_FAILED"
  | "TOO_SHORT";

export interface ParseSuccess {
  success: true;
  text: string;
  metadata: {
    fileName?: string;
    fileType?: "pdf" | "docx" | "txt";
    charCount: number;
    wordCount: number;
    warnings?: string[];
  };
}

export interface ParseError {
  success: false;
  error: {
    code: ParseErrorCode;
    message: string;
    suggestion?: string;
  };
}

export type ParseResult = ParseSuccess | ParseError;
