"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import type { ParseResult } from "@/lib/types";

type UploadState =
  | { status: "idle" }
  | { status: "parsing"; fileName: string }
  | {
      status: "success";
      fileName: string;
      fileType: "pdf" | "docx" | "txt";
      text: string;
      charCount: number;
      wordCount: number;
    }
  | {
      status: "error";
      fileName: string;
      code: string;
      message: string;
      suggestion?: string;
    };

function jdHint(len: number) {
  if (len === 0) return { tone: "text-zinc-500", msg: "Min. 200 characters" };
  if (len < 200)
    return { tone: "text-zinc-500", msg: `${len} / 200 chars minimum` };
  if (len < 500)
    return {
      tone: "text-amber-700",
      msg: "Consider pasting more details for better analysis",
    };
  return { tone: "text-emerald-700", msg: "✓ Looks good" };
}

function resumeTextHint(len: number) {
  if (len === 0) return { tone: "text-zinc-500", msg: "Min. 200 characters" };
  if (len < 200)
    return { tone: "text-zinc-500", msg: `${len} / 200 chars minimum` };
  if (len < 500)
    return { tone: "text-amber-700", msg: "Short, but usable" };
  return { tone: "text-emerald-700", msg: "✓ Looks good" };
}

export default function AnalyzePage() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [resumeMode, setResumeMode] = useState<"text" | "file">("text");
  const [resumeText, setResumeText] = useState("");
  const [upload, setUpload] = useState<UploadState>({ status: "idle" });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resumeReady =
    (resumeMode === "text" && resumeText.trim().length >= 200) ||
    (resumeMode === "file" && upload.status === "success");
  const jdReady = jd.trim().length >= 200;
  const canSubmit = jdReady && resumeReady && !submitting && upload.status !== "parsing";

  const handleFile = async (file: File) => {
    setUpload({ status: "parsing", fileName: file.name });
    setPreviewOpen(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-resume", { method: "POST", body: fd });
      const data = (await res.json()) as ParseResult;
      if (!data.success) {
        setUpload({
          status: "error",
          fileName: file.name,
          code: data.error.code,
          message: data.error.message,
          suggestion: data.error.suggestion,
        });
        return;
      }
      setUpload({
        status: "success",
        fileName: data.metadata.fileName ?? file.name,
        fileType: data.metadata.fileType ?? "txt",
        text: data.text,
        charCount: data.metadata.charCount,
        wordCount: data.metadata.wordCount,
      });
    } catch (err) {
      setUpload({
        status: "error",
        fileName: file.name,
        code: "PARSE_FAILED",
        message:
          err instanceof Error
            ? `Network error: ${err.message}`
            : "Network error while uploading.",
        suggestion: "Check your connection and try again.",
      });
    }
  };

  const clearFile = () => {
    setUpload({ status: "idle" });
    setPreviewOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/validate-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: jd }),
      });
      const data = (await res.json()) as ParseResult;
      if (!data.success) {
        setSubmitError(data.error.message);
        setSubmitting(false);
        return;
      }
      const resumeFinal =
        resumeMode === "text"
          ? resumeText
          : upload.status === "success"
            ? upload.text
            : "";
      sessionStorage.setItem(
        "analysisInput",
        JSON.stringify({
          jd: data.text,
          resume: resumeFinal,
          jdWarnings: data.metadata.warnings ?? [],
          createdAt: Date.now(),
        })
      );
      router.push("/analyze/result");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Unexpected error submitting."
      );
      setSubmitting(false);
    }
  };

  const jh = jdHint(jd.length);
  const rh = resumeTextHint(resumeText.length);

  return (
    <>
      <Nav />
      <main className="flex-1 bg-white text-zinc-900">
        <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                New Analysis
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                Analyze a job match
              </h1>
            </div>
            <Link
              href="/"
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
            >
              ← Back home
            </Link>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {/* JD */}
            <Card className="border-zinc-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Job Description</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the full job description here..."
                  className="min-h-64 resize-y"
                />
                <p className={`mt-2 text-xs ${jh.tone}`}>
                  {jd.length} chars · {jh.msg}
                </p>
              </CardContent>
            </Card>

            {/* Resume */}
            <Card className="border-zinc-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Your Resume</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={resumeMode}
                  onValueChange={(v) => setResumeMode(v as "text" | "file")}
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="text">Paste Text</TabsTrigger>
                    <TabsTrigger value="file">Upload File</TabsTrigger>
                  </TabsList>

                  <TabsContent value="text">
                    <Textarea
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                      placeholder="Paste your resume as plain text..."
                      className="min-h-64 resize-y"
                    />
                    <p className={`mt-2 text-xs ${rh.tone}`}>
                      {resumeText.length} chars · {rh.msg}
                    </p>
                  </TabsContent>

                  <TabsContent value="file">
                    {upload.status === "idle" && (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragging(false);
                          const f = e.dataTransfer.files?.[0];
                          if (f) handleFile(f);
                        }}
                        className={`rounded-md border-2 border-dashed bg-zinc-50/60 transition-colors ${
                          dragging
                            ? "border-zinc-900 bg-zinc-100"
                            : "border-zinc-200 hover:border-zinc-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex min-h-64 w-full flex-col items-center justify-center gap-2 px-6 py-8 text-center"
                        >
                          <svg
                            className="h-8 w-8 text-zinc-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                            aria-hidden
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 5.625 5.625 0 0 1 1.917 11.091z"
                            />
                          </svg>
                          <p className="text-sm font-medium text-zinc-900">
                            Click to upload or drag & drop
                          </p>
                          <p className="text-xs text-zinc-500">
                            PDF, DOCX, or TXT · up to 5 MB
                          </p>
                        </button>
                      </div>
                    )}

                    {upload.status === "parsing" && (
                      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-md border border-zinc-200 bg-zinc-50/60 px-6 py-8 text-center">
                        <span
                          aria-hidden
                          className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900"
                        />
                        <p className="text-sm text-zinc-700">
                          Parsing {upload.fileName}…
                        </p>
                      </div>
                    )}

                    {upload.status === "success" && (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                              <span aria-hidden className="text-emerald-700">
                                ✓
                              </span>
                              <span className="truncate">{upload.fileName}</span>
                              <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs font-normal uppercase text-white">
                                {upload.fileType}
                              </span>
                            </p>
                            <p className="mt-1 text-xs text-zinc-600">
                              {upload.charCount} chars · {upload.wordCount} words
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewOpen((v) => !v)}
                              className="text-xs font-medium text-zinc-700 underline-offset-4 hover:underline"
                            >
                              {previewOpen ? "Hide" : "Preview"}
                            </button>
                            <button
                              type="button"
                              onClick={clearFile}
                              className="text-xs font-medium text-zinc-500 underline-offset-4 hover:text-red-700 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        {previewOpen && (
                          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-xs text-zinc-700 ring-1 ring-zinc-200">
                            {upload.text}
                          </pre>
                        )}
                      </div>
                    )}

                    {upload.status === "error" && (
                      <div className="space-y-3">
                        <Alert
                          variant="destructive"
                          className="border-red-200 bg-red-50/60"
                        >
                          <AlertTitle>Couldn&apos;t parse {upload.fileName}</AlertTitle>
                          <AlertDescription>
                            <span className="block">{upload.message}</span>
                            {upload.suggestion && (
                              <span className="mt-1 block text-xs text-red-900/80">
                                {upload.suggestion}
                              </span>
                            )}
                          </AlertDescription>
                        </Alert>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setUpload({ status: "idle" });
                              setResumeMode("text");
                            }}
                            className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                          >
                            Try pasting text instead
                          </button>
                          <button
                            type="button"
                            onClick={clearFile}
                            className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-700 hover:bg-zinc-50"
                          >
                            Choose another file
                          </button>
                        </div>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {submitError && (
            <Alert variant="destructive" className="mt-6 border-red-200 bg-red-50/60">
              <AlertTitle>Couldn&apos;t start analysis</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div className="mt-10 flex flex-col items-center gap-2">
            <Button
              size="lg"
              disabled={!canSubmit}
              onClick={onSubmit}
              className="w-full rounded-md bg-zinc-900 py-6 text-base text-white hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 sm:w-auto sm:px-12"
            >
              {submitting ? "Preparing…" : "Analyze Match"}
            </Button>
            <p className="text-sm text-zinc-500">
              {canSubmit
                ? "This will take about 10-20 seconds"
                : upload.status === "parsing"
                  ? "Waiting for file to finish parsing…"
                  : "Provide a JD (≥200 chars) and a resume to continue"}
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
