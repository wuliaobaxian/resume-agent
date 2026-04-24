import { callZhipu } from "@/lib/zhipu";
import {
  EXTRACTION_PROMPT,
  MATCHING_PROMPT,
  SUGGESTION_PROMPT,
} from "./prompts";
import type {
  AgentResult,
  AgentStep,
  AgentStepStatus,
  ExtractionResult,
  MatchingResult,
  SuggestionResult,
} from "./schemas";
import { validateSuggestions } from "./validator";

const DEV = process.env.NODE_ENV !== "production";

function logStep(step: string, payload: Record<string, unknown>) {
  if (!DEV) return;
  // eslint-disable-next-line no-console
  console.log(`[agent:${step}]`, payload);
}

function stripCodeFence(raw: string): string {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : raw.trim();
}

export interface StepRunResult<T> {
  data: T;
  usage: unknown;
  durationMs: number;
}

async function callStep<T>(
  step: AgentStep,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<StepRunResult<T>> {
  const start = Date.now();
  const tryOnce = (t: number) =>
    callZhipu({
      systemPrompt,
      userPrompt,
      responseFormat: "json_object",
      temperature: t,
      maxTokens: 4000,
    });

  let content = "";
  let usage: unknown;
  try {
    const res = await tryOnce(temperature);
    content = res.content;
    usage = res.usage;
    const data = JSON.parse(stripCodeFence(content)) as T;
    const durationMs = Date.now() - start;
    logStep(step, {
      durationMs,
      usage,
      preview: JSON.stringify(data).slice(0, 500),
    });
    return { data, usage, durationMs };
  } catch (firstErr) {
    logStep(step, {
      firstAttemptFailed:
        firstErr instanceof Error ? firstErr.message : String(firstErr),
      rawPreview: content.slice(0, 300),
    });
    try {
      const res = await tryOnce(Math.min(temperature + 0.1, 0.9));
      content = res.content;
      usage = res.usage;
      const data = JSON.parse(stripCodeFence(content)) as T;
      const durationMs = Date.now() - start;
      logStep(step, { retrySucceeded: true, durationMs, usage });
      return { data, usage, durationMs };
    } catch (retryErr) {
      const msg =
        retryErr instanceof Error ? retryErr.message : String(retryErr);
      throw new Error(`Step "${step}" failed: ${msg}`);
    }
  }
}

export function sumTokens(usages: unknown[]): number {
  let total = 0;
  for (const u of usages) {
    if (u && typeof u === "object") {
      const asRec = u as Record<string, unknown>;
      const t = asRec.total_tokens;
      if (typeof t === "number") total += t;
    }
  }
  return total;
}

export async function runExtract(
  jdText: string,
  resumeText: string
): Promise<StepRunResult<ExtractionResult>> {
  const userPrompt = `=== JOB DESCRIPTION ===
${jdText}

=== RESUME ===
${resumeText}

Extract the structured information as specified. Output JSON only.`;
  return callStep<ExtractionResult>("extract", EXTRACTION_PROMPT, userPrompt, 0.1);
}

export async function runMatch(
  extraction: ExtractionResult
): Promise<StepRunResult<MatchingResult>> {
  const userPrompt = `Based on the following extracted data, analyze the match.

=== EXTRACTED DATA ===
${JSON.stringify(extraction, null, 2)}

Output the match analysis JSON as specified.`;
  return callStep<MatchingResult>("match", MATCHING_PROMPT, userPrompt, 0.3);
}

export async function runSuggest(
  matching: MatchingResult,
  resumeText: string,
  jdText: string
): Promise<StepRunResult<SuggestionResult>> {
  const userPrompt = `Based on the match analysis below and the original texts, generate specific suggestions.

=== MATCH ANALYSIS ===
${JSON.stringify(matching, null, 2)}

=== ORIGINAL RESUME (for reference — use this to quote original_text) ===
${resumeText}

=== ORIGINAL JD (for reference — use this to quote jd_basis) ===
${jdText}

Output suggestions JSON as specified. Remember: NEVER fabricate facts.`;
  return callStep<SuggestionResult>("suggest", SUGGESTION_PROMPT, userPrompt, 0.4);
}

// Convenience orchestrator — used for non-streaming calls or tests.
export async function runAnalysisWorkflow(
  jdText: string,
  resumeText: string,
  onProgress?: (step: AgentStep, status: AgentStepStatus) => void
): Promise<AgentResult> {
  const globalStart = Date.now();
  const usages: unknown[] = [];
  const modelUsed = process.env.ZHIPU_MODEL || "glm-4.6";

  onProgress?.("extract", "start");
  const ex = await runExtract(jdText, resumeText);
  usages.push(ex.usage);
  onProgress?.("extract", "done");

  onProgress?.("match", "start");
  const mt = await runMatch(ex.data);
  usages.push(mt.usage);
  onProgress?.("match", "done");

  onProgress?.("suggest", "start");
  const sg = await runSuggest(mt.data, resumeText, jdText);
  usages.push(sg.usage);
  onProgress?.("suggest", "done");

  const validation = validateSuggestions(sg.data, resumeText, jdText);
  const result: AgentResult = {
    extraction: ex.data,
    matching: mt.data,
    suggestions: sg.data,
    validation,
    metadata: {
      totalTokens: sumTokens(usages),
      durationMs: Date.now() - globalStart,
      modelUsed,
    },
  };
  logStep("workflow:done", {
    totalMs: result.metadata.durationMs,
    totalTokens: result.metadata.totalTokens,
    validationIssues: validation.issues.length,
  });
  return result;
}
