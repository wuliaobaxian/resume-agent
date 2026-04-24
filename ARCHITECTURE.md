# Architecture

This document complements [README.md](README.md) with the implementation-level detail of how Resume Agent is put together: file layout, request lifecycle, prompt design rationale, and the trade-offs chosen along the way.

## Project structure

```
resumeagent/
├── README.md                      # Product-facing overview
├── ARCHITECTURE.md                # This file
├── LICENSE                        # MIT
├── .env.local.example             # Template; real key goes in .env.local (gitignored)
├── .gitignore                     # Excludes .env*, .next/, node_modules, etc.
├── next.config.ts                 # Turbopack; serverExternalPackages for pdf-parse
├── package.json
├── tsconfig.json
├── samples/                       # Demo-ready input fixtures
│   ├── jd-product-manager.txt
│   ├── jd-ml-engineer.txt
│   └── resume-pm-3yr.txt
├── scripts/
│   ├── test-agent.js              # End-to-end smoke test over the SSE API
│   ├── test-zhipu-direct.js       # Isolated Zhipu-API sanity check
│   └── test-zhipu-nothink.js      # Thinking-disabled latency experiment
└── src/
    ├── app/
    │   ├── page.tsx               # Landing page
    │   ├── analyze/
    │   │   ├── page.tsx           # JD + resume input screen
    │   │   └── result/page.tsx    # Live progress + match report
    │   ├── api/
    │   │   ├── analyze/route.ts   # SSE orchestrator (extract → match → suggest)
    │   │   ├── parse-resume/route.ts  # PDF / DOCX / TXT → plaintext
    │   │   └── validate-jd/route.ts   # Length and sanity checks
    │   ├── layout.tsx
    │   └── globals.css
    ├── components/                # UI pieces (Nav, Footer, MatchScore, GapCard,
    │                              #  SuggestionCard, shadcn primitives)
    └── lib/
        ├── zhipu.ts               # Thin wrapper over the Zhipu chat API
        ├── mock-data.ts           # Used when /analyze/result?mock=true
        ├── parse-utils.ts         # File-parsing helpers
        └── agent/
            ├── prompts.ts         # Three system prompts (extract / match / suggest)
            ├── schemas.ts         # TypeScript types for every stage
            ├── validator.ts       # Deterministic anti-hallucination check
            └── workflow.ts        # Per-step runners + local orchestrator
```

## Data flow

### End-to-end request lifecycle

```
 Browser (analyze/page.tsx)
    │ 1. User pastes JD, uploads or pastes resume
    │ 2. POST /api/parse-resume (file)  ──► returns plaintext + warnings
    │ 3. POST /api/validate-jd (text)   ──► length + character-sanity check
    │ 4. sessionStorage.setItem("analysisInput", { jd, resume })
    │ 5. router.push("/analyze/result")
    ▼
 Browser (analyze/result/page.tsx)
    │ 6. Reads sessionStorage, POST /api/analyze (SSE)
    ▼
 Server (app/api/analyze/route.ts)
    │   Opens a ReadableStream<Uint8Array>, writes SSE frames
    │   as each step completes.
    │
    │ 7.  emit progress {step: "extract", status: "start"}
    │ 8.  callZhipu(EXTRACTION_PROMPT, userPrompt)   ── Zhipu API ──►
    │     JSON.parse(content) → ExtractionResult
    │     emit progress {step: "extract", status: "done"}
    │
    │ 9.  emit progress {step: "match", status: "start"}
    │ 10. callZhipu(MATCHING_PROMPT, JSON.stringify(extraction))
    │     JSON.parse(content) → MatchingResult
    │     emit progress {step: "match", status: "done"}
    │
    │ 11. emit progress {step: "suggest", status: "start"}
    │ 12. callZhipu(SUGGESTION_PROMPT, matching + resume + jd)
    │     JSON.parse(content) → SuggestionResult
    │     validator.validateSuggestions(...) → ValidationResult
    │     emit progress {step: "suggest", status: "done"}
    │
    │ 13. emit result { extraction, matching, suggestions,
    │                   validation, metadata }
    │     — OR on suggest failure —
    │     emit partial { extraction, matching, failedStep: "suggest" }
    ▼
 Browser parses SSE frames, renders LoadingView then ResultsView.
```

### Step contracts

All three steps use the same wrapper (`callStep` in `workflow.ts`):

1. Call the Zhipu chat completion API with `response_format: "json_object"` and `thinking: { type: "disabled" }`.
2. Parse the raw content as JSON. Strip `` ``` json ... ``` `` fences if present.
3. On any failure (network, bad JSON, schema mismatch), **retry exactly once** at `temperature + 0.1` (capped at 0.9). If the retry fails too, propagate the error up — the outer SSE handler turns it into an `error` or `partial` frame.

### SSE event types

| Event | Payload | Meaning |
|---|---|---|
| `progress` | `{ step, status }` | Step boundary marker |
| `result` | Full `AgentResult` | All three steps succeeded |
| `partial` | `{ extraction, matching, failedStep, message }` | Steps 1–2 succeeded, step 3 failed (graceful degrade) |
| `error` | `{ message, step, detail? }` | Fatal failure at step 1 or 2, or global timeout |

## Key abstractions

### `src/lib/zhipu.ts`

Thin wrapper over Zhipu's OpenAI-compatible `chat/completions` endpoint. Notable choices:

- **Retries only on network-level errors**, not on 4xx. A 4xx means our request is broken and retrying won't help; surface it fast.
- **Thinking disabled by default** (`thinking: { type: "disabled" }`). GLM-4.5+ models emit long reasoning traces in thinking mode that eat the `max_tokens` budget and wildly inflate latency for structured-output tasks.
- Returns `{ content, usage }` so callers can parse JSON themselves and track token spend per step.

### `src/lib/agent/workflow.ts`

Exposes three step runners and one local full-run orchestrator:

- `runExtract(jdText, resumeText)` → `{ data: ExtractionResult, usage, durationMs }`
- `runMatch(extraction)` → `{ data: MatchingResult, usage, durationMs }`
- `runSuggest(matching, resumeText, jdText)` → `{ data: SuggestionResult, usage, durationMs }`
- `runAnalysisWorkflow(jd, resume, onProgress?)` → `AgentResult` (all three in sequence; used by the SSE route and by test scripts)

The file also exposes `sumTokens(usages)` for aggregating `total_tokens` across steps for metadata display.

### `src/lib/agent/prompts.ts`

Three `SYSTEM` prompts, treated as immutable after design. Each prompt does four things consistently:

1. States the role in one sentence.
2. Lists 3–5 numbered rules, written as constraints (e.g., `"Never infer or assume"`, `"Every gap must include a confidence level"`).
3. Embeds the full output JSON schema as inline documentation.
4. Ends with a reinforcing reminder of the most critical rule.

Design choices worth calling out:

- **Extract is instructed not to evaluate.** The prompt opens with `"You do NOT evaluate, judge, or recommend."` This keeps step 1 cheap and predictable — and prevents premature optimization that would otherwise leak into step 2's scoring.
- **Match is instructed to expose uncertainty.** The rule `"Flag any dimension where evidence is weak — mark confidence as 'low' rather than guessing"` is what makes the confidence labels meaningful rather than decorative.
- **Suggest is instructed to refuse rather than fabricate.** The prompt tells the LLM that if no grounded rewrite is possible, it should set `should_proceed: false` and propose alternative roles. That's what turns the agent from a flatterer into an adviser.

### `src/lib/agent/schemas.ts`

TypeScript types for every stage (`ExtractionResult`, `MatchingResult`, `SuggestionResult`, `ValidationResult`, `AgentResult`). These are the *only* place the shape is defined — the prompts quote them, the workflow casts to them, and the UI consumes them. One source of truth.

### `src/lib/agent/validator.ts`

Deterministic post-hoc check. For each suggestion:

- **Rule 1.** For `rewrite` / `remove` types, `original_text` must fuzzy-contain in the resume. Exact substring passes; otherwise the needle is shingled into 5-word windows and at least 90% must appear in the source.
- **Rule 2.** `jd_basis` must fuzzy-contain in the JD using the same rule.
- **Rule 3.** If `adds_new_facts === true` and `requires_user_input === false`, emit an `error` — the LLM is trying to introduce facts without flagging them for user review.
- **Rule 4.** Any numeric token (`42%`, `8 engineers`, `2M MAU`) present in `suggested_text` but absent from both the original resume and JD → emit a `warning`.

The validator never calls an LLM and can't be bypassed by a clever prompt — it's pure string inspection.

## Prompt design rationale

The three prompts evolved together; a few specific lines deserve call-outs.

**Extraction, rule 2:**
> "If something is not mentioned, use empty array [] or null — never fabricate."

This is the bedrock. If extraction fabricates, everything downstream is unsound. The "empty array or null" phrasing is explicit because early iterations had the model emit plausible-looking inferences when a JD didn't mention, say, `required_years`.

**Matching, rule 3:**
> "Flag any dimension where evidence is weak — mark confidence as 'low' rather than guessing."

Without this line, the model defaults to emitting "high" confidence on everything, which defeats the point of having a confidence field. The explicit permission to mark things "low" is what makes the field honest.

**Suggestion, overarching rule:**
> "NEVER fabricate facts. Every suggestion must reference text actually in the resume or JD."

Backed up by the schema itself (`original_text`, `jd_basis`) and then re-checked by the validator. Defense in depth.

**Suggestion, honesty-check branch:**
> "If the candidate does not meet the core requirements, set `should_proceed: false` and explain why in `message_to_user`. Suggest alternative_suggestions — roles that would actually fit."

This is the single clause that turns the tool into an adviser. Without it, the model gamely generates polish even for hopeless fits.

## Trade-offs explicitly made

### Accuracy over speed

Three serial LLM calls. Each takes ~15–30 seconds on GLM-4.6, so the full run is ~60–75 seconds. A single-prompt merged architecture would be faster (and would fit inside a Vercel Hobby 10-second function timeout). We chose the slower, cleaner design because:

- Debuggability is worth more than latency during development.
- Per-step degradation is worth more than atomicity during use — if step 3 times out, the user still sees a match report.
- Load times of ~1 minute are acceptable for a once-per-session workflow; they would not be for a chat UI.

### Source-anchored rewrites over creative rewrites

A "rewrite this resume in the JD's voice" feature would be popular and easy to ship. We didn't ship it because the failure mode is fabrication, and fabrication is exactly what the product is trying to push back on. The line-level, source-attributed suggestion model is more constrained but keeps us honest.

### Post-hoc deterministic validation over LLM self-review

A second LLM call could be used to double-check the first. We went with a deterministic string-based validator instead because:

- It can't be fooled by clever prompting.
- It's free and instant.
- Its failure modes are well-defined (false positives on heavily rephrased quotes are the main one, handled by the 90% shingle threshold).

### SSE over polling

Streaming step-level progress over SSE is richer than polling and simpler than WebSockets. The downside is that SSE doesn't work cleanly behind certain reverse proxies — for local dev and Vercel (Node runtime) it's fine; for other hosts the frontend would need to fall back to chunked JSON.

### GLM-4.6 over cheaper alternatives

We evaluated lighter models (GLM-4.5-Air, GLM-Flash tier). Air is ~2× faster per call but produced noticeably weaker gap analysis and hallucinated numeric details more often. For a product whose entire differentiation is anti-fabrication, the cost-per-run trade wasn't worth it. GLM-4.6 with `thinking: "disabled"` is the sweet spot.
