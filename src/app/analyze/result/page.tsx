"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { MatchScore } from "@/components/MatchScore";
import { GapCard } from "@/components/GapCard";
import { SuggestionCard } from "@/components/SuggestionCard";
import { mockResult } from "@/lib/mock-data";
import type {
  ExtractionResult,
  MatchingResult,
  StepMetadata,
  SuggestionResult,
  ValidationResult,
} from "@/lib/agent/schemas";

type Phase = "init" | "mock" | "empty" | "running" | "done" | "partial" | "error";
type StepKey = "extract" | "match" | "suggest";
type StepState = "pending" | "running" | "done" | "failed";

interface StepInfo {
  state: StepState;
  error?: string;
  metadata?: StepMetadata;
}

type StepsMap = Record<StepKey, StepInfo>;

const initialSteps: StepsMap = {
  extract: { state: "pending" },
  match: { state: "pending" },
  suggest: { state: "pending" },
};

interface ApiOk<T> {
  success: true;
  data: T;
  metadata: StepMetadata;
}
interface ApiErr {
  success: false;
  error: { code: string; message: string; detail?: string };
}
type ApiResp<T> = ApiOk<T> | ApiErr;

async function postJson<T>(url: string, body: unknown): Promise<ApiResp<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as ApiResp<T> | null;
    if (!json) {
      return {
        success: false,
        error: { code: "BAD_RESPONSE", message: `HTTP ${res.status}` },
      };
    }
    return json;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: { code: "NETWORK", message: `Network error: ${msg}` },
    };
  }
}

function ResultContent() {
  const searchParams = useSearchParams();
  const isMock = searchParams.get("mock") === "true";

  const [phase, setPhase] = useState<Phase>("init");
  const [steps, setSteps] = useState<StepsMap>(initialSteps);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [matching, setMatching] = useState<MatchingResult | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionResult | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [topError, setTopError] = useState<{ step: StepKey; message: string } | null>(
    null
  );
  const startedRef = useRef(false);

  const readInput = useCallback((): { jd: string; resume: string } | null => {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem("analysisInput");
    } catch {
      return null;
    }
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored) as { jd?: string; resume?: string };
      if (!parsed.jd || !parsed.resume) return null;
      return { jd: parsed.jd, resume: parsed.resume };
    } catch {
      return null;
    }
  }, []);

  const updateStep = useCallback(
    (key: StepKey, patch: Partial<StepInfo>) => {
      setSteps((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    },
    []
  );

  // Individual step runners — each returns true on success, false on failure.
  const doExtract = useCallback(async (): Promise<ExtractionResult | null> => {
    const input = readInput();
    if (!input) {
      setPhase("empty");
      return null;
    }
    updateStep("extract", { state: "running", error: undefined });
    const t0 = performance.now();
    const resp = await postJson<ExtractionResult>("/api/analyze/extract", {
      jdText: input.jd,
      resumeText: input.resume,
    });
    if (!resp.success) {
      updateStep("extract", { state: "failed", error: resp.error.message });
      setTopError({ step: "extract", message: resp.error.message });
      setPhase("error");
      return null;
    }
    console.log(
      `[client] extract done in ${(performance.now() - t0).toFixed(0)}ms, server=${resp.metadata.durationMs}ms`
    );
    setExtraction(resp.data);
    updateStep("extract", { state: "done", metadata: resp.metadata });
    return resp.data;
  }, [readInput, updateStep]);

  const doMatch = useCallback(
    async (ex: ExtractionResult): Promise<MatchingResult | null> => {
      updateStep("match", { state: "running", error: undefined });
      const t0 = performance.now();
      const resp = await postJson<MatchingResult>("/api/analyze/match", {
        extraction: ex,
      });
      if (!resp.success) {
        updateStep("match", { state: "failed", error: resp.error.message });
        setTopError({ step: "match", message: resp.error.message });
        setPhase("error");
        return null;
      }
      console.log(
        `[client] match done in ${(performance.now() - t0).toFixed(0)}ms, server=${resp.metadata.durationMs}ms`
      );
      setMatching(resp.data);
      updateStep("match", { state: "done", metadata: resp.metadata });
      return resp.data;
    },
    [updateStep]
  );

  const doSuggest = useCallback(
    async (mt: MatchingResult): Promise<boolean> => {
      const input = readInput();
      if (!input) return false;
      updateStep("suggest", { state: "running", error: undefined });
      const t0 = performance.now();
      const resp = await postJson<{
        suggestions: SuggestionResult;
        validation: ValidationResult;
      }>("/api/analyze/suggest", {
        matching: mt,
        resumeText: input.resume,
        jdText: input.jd,
      });
      if (!resp.success) {
        updateStep("suggest", { state: "failed", error: resp.error.message });
        return false;
      }
      console.log(
        `[client] suggest done in ${(performance.now() - t0).toFixed(0)}ms, server=${resp.metadata.durationMs}ms`
      );
      setSuggestions(resp.data.suggestions);
      setValidation(resp.data.validation);
      updateStep("suggest", { state: "done", metadata: resp.metadata });
      return true;
    },
    [readInput, updateStep]
  );

  const runAll = useCallback(async () => {
    setPhase("running");
    setSteps(initialSteps);
    setExtraction(null);
    setMatching(null);
    setSuggestions(null);
    setValidation(null);
    setTopError(null);

    const ex = await doExtract();
    if (!ex) return;
    const mt = await doMatch(ex);
    if (!mt) return;
    const ok = await doSuggest(mt);
    setPhase(ok ? "done" : "partial");
  }, [doExtract, doMatch, doSuggest]);

  // Per-step retry handlers.
  const retryExtract = useCallback(async () => {
    setTopError(null);
    setPhase("running");
    const ex = await doExtract();
    if (!ex) return;
    const mt = await doMatch(ex);
    if (!mt) return;
    const ok = await doSuggest(mt);
    setPhase(ok ? "done" : "partial");
  }, [doExtract, doMatch, doSuggest]);

  const retryMatch = useCallback(async () => {
    if (!extraction) return retryExtract();
    setTopError(null);
    setPhase("running");
    const mt = await doMatch(extraction);
    if (!mt) return;
    const ok = await doSuggest(mt);
    setPhase(ok ? "done" : "partial");
  }, [extraction, doMatch, doSuggest, retryExtract]);

  const retrySuggest = useCallback(async () => {
    if (!matching) return retryMatch();
    setTopError(null);
    setPhase("running");
    const ok = await doSuggest(matching);
    setPhase(ok ? "done" : "partial");
  }, [matching, doSuggest, retryMatch]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (isMock) {
      setPhase("mock");
      return;
    }
    runAll();
  }, [isMock, runAll]);

  // --- Render ---

  if (phase === "init" || (phase === "running" && !matching)) {
    return <LoadingView steps={steps} />;
  }

  if (phase === "empty") {
    return (
      <main className="flex-1 bg-zinc-50/60 text-zinc-900">
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">No analysis data</h1>
          <p className="mt-3 text-zinc-600">
            Start a new analysis to see results here.
          </p>
          <Link
            href="/analyze"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Start a new analysis
          </Link>
        </div>
      </main>
    );
  }

  if (phase === "error") {
    const step = topError?.step ?? "extract";
    const retry =
      step === "extract"
        ? retryExtract
        : step === "match"
          ? retryMatch
          : retrySuggest;
    return (
      <main className="flex-1 bg-zinc-50/60 text-zinc-900">
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-red-800">
            Analysis failed
          </h1>
          <p className="mt-3 text-zinc-700">
            {topError?.message ?? "Something went wrong."}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Failed at step: {step}</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Retry this step
            </button>
            <Link
              href="/analyze"
              className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              New analysis
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "mock") {
    return (
      <ResultsView
        banner={null}
        overall={{
          score: mockResult.overallMatch.score,
          verdict: mockResult.overallMatch.verdict,
          summary: mockResult.overallMatch.summary,
        }}
        dimensions={mockResult.dimensions.map((d) => ({
          name: d.name,
          score: d.score,
          note: d.note,
        }))}
        strengths={[]}
        gaps={mockResult.gaps.map((g) => ({
          area: g.area,
          severity: g.severity,
          confidence: g.confidence,
          description: g.description,
          honestNote: g.honestNote,
        }))}
        suggestions={mockResult.suggestions.map((s) => ({
          id: s.id,
          type: s.type,
          targetSection: s.targetSection,
          originalText: s.originalText,
          suggestedText: s.suggestedText,
          reasoning: s.reasoning,
          requiresUserInput: s.requiresUserInput,
        }))}
        honesty={{
          shouldProceed: mockResult.honestyCheck.shouldProceed,
          message: mockResult.honestyCheck.message,
          alternatives: [],
        }}
        validation={null}
        metadata={null}
      />
    );
  }

  // done | partial — matching is non-null here.
  const totalTokens =
    (steps.extract.metadata?.tokens.total ?? 0) +
    (steps.match.metadata?.tokens.total ?? 0) +
    (steps.suggest.metadata?.tokens.total ?? 0);
  const totalDuration =
    (steps.extract.metadata?.durationMs ?? 0) +
    (steps.match.metadata?.durationMs ?? 0) +
    (steps.suggest.metadata?.durationMs ?? 0);
  const modelUsed =
    steps.extract.metadata?.modelUsed ??
    steps.match.metadata?.modelUsed ??
    steps.suggest.metadata?.modelUsed ??
    "";

  return (
    <ResultsView
      banner={
        phase === "partial"
          ? {
              tone: "amber",
              message:
                steps.suggest.error ??
                "Suggestions step failed. Showing match analysis only.",
              action: { label: "Retry suggestions", onClick: retrySuggest },
            }
          : null
      }
      overall={{
        score: matching!.overall_match.score,
        verdict: matching!.overall_match.verdict,
        summary: matching!.overall_match.summary,
      }}
      dimensions={matching!.dimensions.map((d) => ({
        name: d.name,
        score: d.score,
        note: d.note,
        confidence: d.confidence,
      }))}
      strengths={matching!.strengths ?? []}
      gaps={matching!.gaps.map((g) => ({
        area: g.area,
        severity: g.severity,
        confidence: g.confidence,
        description: g.description,
        honestNote: g.honest_note,
      }))}
      suggestions={
        phase === "done" && suggestions ? mapSuggestions(suggestions) : []
      }
      honesty={
        phase === "done" && suggestions
          ? {
              shouldProceed: suggestions.honesty_check.should_proceed,
              message: suggestions.honesty_check.message_to_user,
              alternatives:
                suggestions.honesty_check.alternative_suggestions ?? [],
            }
          : null
      }
      validation={phase === "done" ? validation : null}
      metadata={
        phase === "done"
          ? {
              totalTokens,
              durationMs: totalDuration,
              modelUsed,
            }
          : null
      }
    />
  );
}

function mapSuggestions(s: SuggestionResult) {
  return s.suggestions.map((x) => ({
    id: x.id,
    type: x.type === "reorder" ? "rewrite" : x.type,
    targetSection: x.target_section,
    originalText: x.original_text,
    suggestedText: x.suggested_text,
    reasoning: `${x.reasoning}${x.jd_basis ? ` (JD basis: "${x.jd_basis}")` : ""}`,
    requiresUserInput: x.requires_user_input,
  }));
}

// --- Sub-components ---

function LoadingView({ steps }: { steps: StepsMap }) {
  const items: Array<{ key: StepKey; label: string; desc: string }> = [
    {
      key: "extract",
      label: "Extracting information",
      desc: "Parsing your JD and resume into structured data.",
    },
    {
      key: "match",
      label: "Analyzing match",
      desc: "Scoring dimensions and identifying gaps.",
    },
    {
      key: "suggest",
      label: "Generating suggestions",
      desc: "Writing resume changes grounded in your content.",
    },
  ];
  return (
    <main className="flex-1 bg-zinc-50/60 text-zinc-900">
      <div className="mx-auto max-w-xl px-6 py-20">
        <h1 className="text-2xl font-semibold tracking-tight">Running analysis</h1>
        <p className="mt-2 text-zinc-600">
          This takes about 10–25 seconds. Please stay on this page.
        </p>
        <ol className="mt-8 space-y-4">
          {items.map((it, idx) => {
            const st = steps[it.key].state;
            const dur = steps[it.key].metadata?.durationMs;
            return (
              <li key={it.key} className="flex gap-4">
                <StepIcon state={st} n={idx + 1} />
                <div className="flex-1">
                  <p
                    className={`font-medium ${
                      st === "pending" ? "text-zinc-500" : "text-zinc-900"
                    }`}
                  >
                    {it.label}
                    {st === "running" && (
                      <span className="ml-2 text-xs text-zinc-500">…</span>
                    )}
                    {st === "done" && dur != null && (
                      <span className="ml-2 text-xs text-zinc-500">
                        {(dur / 1000).toFixed(1)}s
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-zinc-500">{it.desc}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </main>
  );
}

function StepIcon({ state, n }: { state: StepState; n: number }) {
  if (state === "done") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
        ✓
      </div>
    );
  }
  if (state === "running") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-zinc-900">
        <span className="h-3 w-3 animate-pulse rounded-full bg-zinc-900" />
      </div>
    );
  }
  if (state === "failed") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-300 bg-red-50 text-red-700">
        ✗
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-sm text-zinc-400">
      {n}
    </div>
  );
}

interface ResultsViewProps {
  banner: {
    tone: "amber" | "zinc";
    message: string;
    action?: { label: string; onClick: () => void };
  } | null;
  overall: { score: number; verdict: string; summary: string };
  dimensions: Array<{
    name: string;
    score: number;
    note: string;
    confidence?: "high" | "medium" | "low";
  }>;
  strengths: Array<{ area: string; evidence: string; jd_relevance: string }>;
  gaps: Array<{
    area: string;
    severity: "high" | "medium" | "low";
    confidence: "high" | "medium" | "low";
    description: string;
    honestNote: string;
  }>;
  suggestions: Array<{
    id: string;
    type: "rewrite" | "add" | "remove";
    targetSection: string;
    originalText: string | null;
    suggestedText: string;
    reasoning: string;
    requiresUserInput: boolean;
  }>;
  honesty: { shouldProceed: boolean; message: string; alternatives: string[] } | null;
  validation: ValidationResult | null;
  metadata: { totalTokens: number; durationMs: number; modelUsed: string } | null;
}

function ResultsView({
  banner,
  overall,
  dimensions,
  strengths,
  gaps,
  suggestions,
  honesty,
  validation,
  metadata,
}: ResultsViewProps) {
  return (
    <main className="flex-1 bg-zinc-50/60 text-zinc-900">
      <div className="mx-auto max-w-4xl space-y-10 px-6 py-12 sm:py-16">
        {banner && (
          <div
            className={`flex flex-col items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm sm:flex-row sm:items-center ${
              banner.tone === "amber"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-zinc-300 bg-zinc-50 text-zinc-800"
            }`}
          >
            <span>{banner.message}</span>
            {banner.action && (
              <button
                type="button"
                onClick={banner.action.onClick}
                className="inline-flex h-8 items-center rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                {banner.action.label}
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Analysis Result
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Match report
            </h1>
          </div>
          <Link
            href="/analyze"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
          >
            ← New analysis
          </Link>
        </div>

        <MatchScore
          score={overall.score}
          verdict={overall.verdict}
          summary={overall.summary}
        />

        <section>
          <h2 className="text-2xl font-semibold tracking-tight">
            Where you match, where you don&apos;t
          </h2>
          <Card className="mt-4 border-zinc-200 bg-white shadow-sm">
            <CardContent className="divide-y divide-zinc-100 p-0">
              {dimensions.map((d) => (
                <div
                  key={d.name}
                  className="grid gap-3 px-6 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
                >
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-zinc-900">
                        {d.name}
                        {d.confidence && (
                          <span className="ml-2 text-xs font-normal text-zinc-500">
                            ({d.confidence} confidence)
                          </span>
                        )}
                      </p>
                      <span className="font-mono text-sm tabular-nums text-zinc-700 sm:hidden">
                        {d.score}%
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 leading-relaxed">
                      {d.note}
                    </p>
                    <Progress value={d.score} className="mt-3 h-1.5" />
                  </div>
                  <span className="hidden font-mono text-lg tabular-nums text-zinc-700 sm:block">
                    {d.score}%
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {strengths.length > 0 && (
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              What&apos;s working in your favor
            </h2>
            <p className="mt-1 text-zinc-600">
              These are real signals from your resume that match what the JD asks for.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {strengths.map((s, i) => (
                <Card
                  key={`${s.area}-${i}`}
                  className="border-zinc-200 bg-white shadow-sm"
                >
                  <CardContent className="p-5">
                    <p className="font-semibold text-zinc-900">{s.area}</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          From your resume
                        </p>
                        <p className="mt-1 text-zinc-800 leading-relaxed">
                          {s.evidence}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Why it matters here
                        </p>
                        <p className="mt-1 text-zinc-700 leading-relaxed">
                          {s.jd_relevance}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-2xl font-semibold tracking-tight">
            Gaps we identified
          </h2>
          <p className="mt-1 text-zinc-600">
            Honest — not polished. Read these before you submit.
          </p>
          <div className="mt-4 space-y-4">
            {gaps.length === 0 ? (
              <p className="text-sm text-zinc-500">No gaps identified.</p>
            ) : (
              gaps.map((g) => <GapCard key={g.area} {...g} />)
            )}
          </div>
        </section>

        {suggestions.length > 0 && (
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              Specific changes to make
            </h2>
            <p className="mt-1 text-zinc-600">
              Every suggestion is tied to your actual resume. Nothing is fabricated.
            </p>
            <div className="mt-4 space-y-4">
              {suggestions.map((s) => (
                <SuggestionCard key={s.id} {...s} />
              ))}
            </div>
          </section>
        )}

        {honesty && (
          <HonestyCheck
            shouldProceed={honesty.shouldProceed}
            message={honesty.message}
            alternatives={honesty.alternatives}
          />
        )}

        {validation && <ValidationReport validation={validation} />}

        {metadata && (
          <p className="text-center text-xs text-zinc-400">
            {metadata.modelUsed} · {metadata.totalTokens} tokens ·{" "}
            {(metadata.durationMs / 1000).toFixed(1)}s
          </p>
        )}

        <div className="flex flex-col items-center gap-3 pt-4 sm:flex-row sm:justify-center">
          <Link
            href="/analyze"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 sm:w-auto"
          >
            Start a new analysis
          </Link>
          <button
            type="button"
            onClick={() => alert("Coming soon")}
            className="inline-flex h-11 w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 sm:w-auto"
          >
            Export as PDF
          </button>
        </div>
      </div>
    </main>
  );
}

function HonestyCheck({
  shouldProceed,
  message,
  alternatives,
}: {
  shouldProceed: boolean;
  message: string;
  alternatives: string[];
}) {
  if (shouldProceed) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/60 shadow-sm">
        <CardContent className="p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">
            Honest conclusion
          </p>
          <p className="mt-2 text-emerald-900 leading-relaxed">{message}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-2 border-zinc-900 bg-white shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white"
          >
            !
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-900">
              Honest conclusion — reconsider before applying
            </p>
            <p className="mt-2 text-zinc-800 leading-relaxed">{message}</p>
            {alternatives.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  What might fit better
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                  {alternatives.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ValidationReport({ validation }: { validation: ValidationResult }) {
  const [open, setOpen] = useState(false);
  const count = validation.issues.length;
  const hasErrors = validation.issues.some((i) => i.severity === "error");

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-4 py-3 text-left text-sm shadow-sm transition-colors hover:bg-zinc-50"
      >
        <span className="flex items-center gap-2 font-medium">
          {count === 0 ? (
            <>
              <span aria-hidden className="text-emerald-700">
                ✓
              </span>
              All suggestions verified against source material
            </>
          ) : hasErrors ? (
            <>
              <span aria-hidden className="text-red-700">
                ✗
              </span>
              Validation flagged {count} issue{count === 1 ? "" : "s"} ({validation.issues.filter((i) => i.severity === "error").length} error)
            </>
          ) : (
            <>
              <span aria-hidden className="text-amber-700">
                ⚠
              </span>
              {count} validation warning{count === 1 ? "" : "s"}
            </>
          )}
        </span>
        <span className="text-xs text-zinc-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open && count > 0 && (
        <ul className="mt-2 space-y-2 rounded-md border border-zinc-200 bg-white p-4 text-sm shadow-sm">
          {validation.issues.map((issue, i) => (
            <li key={i} className="flex gap-3">
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                  issue.severity === "error"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {issue.severity}
              </span>
              <div>
                <p className="font-mono text-xs text-zinc-500">{issue.suggestionId}</p>
                <p className="text-zinc-800">{issue.issue}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ResultPage() {
  return (
    <>
      <Nav />
      <Suspense fallback={<div className="flex-1" />}>
        <ResultContent />
      </Suspense>
      <Footer />
    </>
  );
}
