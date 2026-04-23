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
  StepMetadata,
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

function extractTokens(usage: unknown): StepMetadata["tokens"] {
  if (usage && typeof usage === "object") {
    const u = usage as Record<string, unknown>;
    const input = typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
    const output =
      typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
    const total =
      typeof u.total_tokens === "number" ? u.total_tokens : input + output;
    return { input, output, total };
  }
  return { input: 0, output: 0, total: 0 };
}

export interface StepRun<T> {
  result: T;
  metadata: StepMetadata;
}

async function callStep<T>(
  step: AgentStep,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<StepRun<T>> {
  const start = Date.now();
  const modelUsed = process.env.ZHIPU_MODEL || "glm-4.5-air";
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
    const metadata: StepMetadata = {
      durationMs,
      tokens: extractTokens(usage),
      modelUsed,
    };
    logStep(step, { durationMs, usage });
    return { result: data, metadata };
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
      const metadata: StepMetadata = {
        durationMs,
        tokens: extractTokens(usage),
        modelUsed,
      };
      logStep(step, { retrySucceeded: true, durationMs });
      return { result: data, metadata };
    } catch (retryErr) {
      const msg =
        retryErr instanceof Error ? retryErr.message : String(retryErr);
      throw new Error(`Step "${step}" failed: ${msg}`);
    }
  }
}

export function sumTokens(metadatas: StepMetadata[]): number {
  return metadatas.reduce((acc, m) => acc + m.tokens.total, 0);
}

export async function runExtraction(
  jdText: string,
  resumeText: string
): Promise<StepRun<ExtractionResult>> {
  const userPrompt = `=== JOB DESCRIPTION ===
${jdText}

=== RESUME ===
${resumeText}

Extract the structured information as specified. Output JSON only.`;
  return callStep<ExtractionResult>(
    "extract",
    EXTRACTION_PROMPT,
    userPrompt,
    0.1
  );
}

export async function runMatching(
  extraction: ExtractionResult
): Promise<StepRun<MatchingResult>> {
  const userPrompt = `Based on the following extracted data, analyze the match.

=== EXTRACTED DATA ===
${JSON.stringify(extraction, null, 2)}

Output the match analysis JSON as specified.`;
  return callStep<MatchingResult>("match", MATCHING_PROMPT, userPrompt, 0.3);
}

export async function runSuggestion(
  matching: MatchingResult,
  resumeText: string,
  jdText: string
): Promise<StepRun<SuggestionResult>> {
  const userPrompt = `Based on the match analysis below and the original texts, generate specific suggestions.

=== MATCH ANALYSIS ===
${JSON.stringify(matching, null, 2)}

=== ORIGINAL RESUME (for reference — use this to quote original_text) ===
${resumeText}

=== ORIGINAL JD (for reference — use this to quote jd_basis) ===
${jdText}

Output suggestions JSON as specified. Remember: NEVER fabricate facts.`;
  return callStep<SuggestionResult>(
    "suggest",
    SUGGESTION_PROMPT,
    userPrompt,
    0.4
  );
}

// Local-only full-run orchestrator. Do NOT use on Vercel — the combined runtime
// exceeds the Hobby 10s function timeout. Client orchestrates the three
// independent routes (/extract, /match, /suggest) in production.
export async function runFullWorkflowLocal(
  jdText: string,
  resumeText: string,
  onProgress?: (step: AgentStep, status: AgentStepStatus) => void
): Promise<AgentResult> {
  const globalStart = Date.now();
  const modelUsed = process.env.ZHIPU_MODEL || "glm-4.5-air";
  const metas: StepMetadata[] = [];

  onProgress?.("extract", "start");
  const ex = await runExtraction(jdText, resumeText);
  metas.push(ex.metadata);
  onProgress?.("extract", "done");

  onProgress?.("match", "start");
  const mt = await runMatching(ex.result);
  metas.push(mt.metadata);
  onProgress?.("match", "done");

  onProgress?.("suggest", "start");
  const sg = await runSuggestion(mt.result, resumeText, jdText);
  metas.push(sg.metadata);
  onProgress?.("suggest", "done");

  const validation = validateSuggestions(sg.result, resumeText, jdText);
  const result: AgentResult = {
    extraction: ex.result,
    matching: mt.result,
    suggestions: sg.result,
    validation,
    metadata: {
      totalTokens: sumTokens(metas),
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
