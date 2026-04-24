# Resume Agent

> An AI agent that analyzes your resume against any job description — and tells you honestly where the gaps are.

## What it does

Paste in a job description and a resume. Resume Agent returns a structured match report: overall fit score, dimension-level breakdown with confidence levels, identified gaps, concrete resume suggestions tied back to your actual experience, and — when the fit is genuinely poor — an honest recommendation to reconsider the application. Every suggestion is anchored to a quoted line from your resume and a quoted requirement from the JD, so the agent can't quietly invent experience you don't have.

## Why I built this

Job-hunting is high-frequency, high-stakes, and already saturated with AI tooling. But the existing tools share a common failure mode: they optimize for making every application look good. They polish, they pad, and — with LLMs in the loop — they sometimes fabricate experience outright. That's a bad trade for the user: it lowers the signal-to-noise ratio employers receive and burns the candidate's time on roles they can't land.

This project is an attempt to invert the default. I wanted to test a product hypothesis: **candidates are better served by an honest adviser than by a flattering tool.** If the agent has to invent something to make you look qualified for a role, it shouldn't suggest applying at all — it should tell you to look at a different role instead.

## Demo

Screenshots (to be added):

- **Input page** — JD textarea + resume file upload / paste
- **Progress page** — 3-step agent pipeline with live status
- **Good-match result** — full match report with suggestions
- **Reconsider result** — the honesty check refusing to polish a bad fit and suggesting alternative roles (this one's the differentiator)
- **Anti-hallucination warning** — the validator flagging a suggestion that drifted from source material

> Demo video: _link to be added_

## Architecture

### Three-step agent workflow

```
           User Input (JD + Resume)
                     │
                     ▼
           ┌──────────────────┐
           │ Step 1: Extract  │  Pure information extraction.
           │                  │  No judgment, just structure.
           └──────────────────┘
                     │
                     ▼
           ┌──────────────────┐
           │ Step 2: Match    │  Dimension scoring, gap
           │                  │  identification, confidence
           │                  │  labels.
           └──────────────────┘
                     │
                     ▼
           ┌──────────────────┐
           │ Step 3: Suggest  │  Specific rewrites + honesty
           │                  │  check + source attribution.
           └──────────────────┘
                     │
                     ▼
           ┌──────────────────┐
           │    Validator     │  Programmatic anti-hallucination
           │                  │  check on every suggestion.
           └──────────────────┘
                     │
                     ▼
                Final Result
```

- **Step 1 — Extract** is deliberately free of opinion. It produces structured JSON describing what the JD wants (required skills, seniority, responsibilities, nice-to-haves) and what the resume claims (experience, achievements, skills). This gives later steps a clean, typed input to reason about.
- **Step 2 — Match** compares the two structured objects. For each dimension (experience match, technical skills, domain, responsibilities, seniority, soft signals) it emits a score plus a `confidence` level (`high` / `medium` / `low`) reflecting how sure it is. It also surfaces real strengths and honest gaps.
- **Step 3 — Suggest** writes concrete resume edits. Every suggestion must quote the `original_text` from the resume and the `jd_basis` from the JD, so edits stay grounded. This step also produces an `honesty_check` that can decide the application shouldn't proceed at all and propose better-fit alternative roles.
- **Validator** is a post-hoc, deterministic safety net in TypeScript. It re-checks every suggestion against the raw source text using fuzzy containment and numeric-token diffing, and flags anything that looks fabricated even if the LLM thought it was fine.

### Tech stack

- Next.js 16 (App Router, Turbopack)
- React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- Server-Sent Events (SSE) for streaming step-level progress to the browser
- Zhipu **GLM-4.6** via the OpenAI-compatible chat completions API
- `pdf-parse` + `mammoth` for server-side resume parsing (PDF / DOCX / TXT)

## Design decisions

### 1. Three steps, not one prompt

A single mega-prompt asking for "analysis + suggestions + match score" sounded tempting and would be one API call instead of three. I picked the split anyway because:

- **Single responsibility.** Each step has one job. Prompts stay focused, outputs stay well-shaped.
- **Debuggability.** When something looks wrong, I know which step produced it. If step 2 scores a skill gap as "high" but step 3 suggests a resume polish that ignores it, the bug is localized.
- **Per-step degradation.** If step 3 fails (bad JSON, rate limit, timeout), the user still gets step 2's match analysis. The architecture returns a `partial` state rather than a total failure.

### 2. Structured output with source attribution

Every suggestion in the JSON schema carries an `original_text` (from the resume) and a `jd_basis` (from the JD). This isn't cosmetic — it's a forcing function. Asking the LLM to always quote a real line makes it much harder to drift into fabrication, because the anchor points are grounded in text the user provided. The validator then checks those anchors really do exist in the source.

### 3. Explicit confidence levels

Every dimension score and every gap carries `confidence: "high" | "medium" | "low"`. Most tools hide uncertainty behind a single number. This one surfaces it. A "75% match with low confidence on domain experience" is more useful than "75%" alone — it tells the user which parts of the report deserve scrutiny.

### 4. Honest enough to walk away

This is the product's signature feature. Step 3 produces an `honesty_check.should_proceed` boolean. When the fit is genuinely bad — say, a consumer-mobile PM applying to a senior B2B-SaaS role that requires years of enterprise experience — the agent refuses to suggest rewrites that misrepresent the candidate and instead proposes `alternative_suggestions`: roles that actually match the resume.

> **If the agent has to invent something to make you look qualified, it won't.**

A flattery tool keeps suggesting edits no matter the gap. This one says: save your time, try a different role.

### 5. Post-hoc validator as safety net

The LLM is instructed at length not to fabricate. It still can, because LLMs hallucinate. So `src/lib/agent/validator.ts` runs after every suggestion and checks — deterministically, without another LLM call — that every `original_text` really appears in the resume (fuzzy match, 90% shingle containment), every `jd_basis` really appears in the JD, and that `suggested_text` doesn't introduce new numeric claims (percentages, years, dollar figures) that weren't in the source. Any suggestion that fails is flagged to the user in the UI.

### 6. Why GLM-4.6 with thinking disabled

GLM-4.6 produces high-quality structured JSON. It also has a reasoning / "thinking" mode that emits long internal reasoning before producing output — useful for open-ended problems, but for structured-output tasks where the prompt already specifies the schema, the thinking traces consumed most of our `max_tokens` budget and stretched each step to 60+ seconds. Disabling thinking (`thinking: { type: "disabled" }` on the API request) cut step latency dramatically with no measurable quality loss on our test cases.

## Failure modes and mitigations

Being explicit about what can go wrong matters more than pretending nothing does.

| Failure mode | Mitigation |
|---|---|
| Scanned / image-only PDF | Detected at parse time (text length < 100 chars); user is asked to paste text instead |
| JD too short (<200 chars) | Blocked at input with a clear inline message |
| Resume or JD too long (>15 k chars JD) | Blocked at input; long documents also degrade LLM quality |
| LLM returns invalid JSON | Automatic single retry at a slightly higher temperature |
| Step 3 (suggestions) fails outright | Match results from steps 1–2 are still shown; user can retry just step 3 |
| LLM fabricates content despite prompt | Validator flags suggestions whose `original_text` / `jd_basis` don't appear in source |
| Severe match mismatch | Honesty check refuses to generate dishonest rewrites; suggests alternative roles |

## What's NOT in scope (and why)

Picking what to leave out is part of the design.

- **No resume rewriting in the user's "voice".** Full rewrites amplify fabrication risk — once the LLM is generating paragraphs instead of line-level edits, it's too easy to drift. Targeted, source-anchored suggestions are a better fit for the honesty positioning.
- **No HR outreach / cold-message generation.** A natural adjacent feature, but evaluated and deferred to v2. First: deliver match analysis really well.
- **No application tracking.** Out of scope. Many tools already do this.
- **No ATS keyword stuffing.** Fundamentally at odds with the honesty positioning. Adding unused keywords to pass filters is exactly the kind of behavior this project exists to push back on.

## Local setup

```bash
# 1. Clone
git clone https://github.com/yourusername/resume-agent.git
cd resume-agent

# 2. Install
npm install

# 3. Environment
cp .env.local.example .env.local
# Edit .env.local and add your ZHIPU_API_KEY.
# Get a key at https://open.bigmodel.cn/

# 4. Run
npm run dev
```

Open http://localhost:3000 in your browser.

Sample inputs for quick testing are in [`samples/`](samples/).

## Roadmap

- HR outreach message generator (multi-tone variants, same honesty rails)
- Resume rewriting with stricter source-tied guarantees
- Multi-language support (Chinese resume / English JD and vice versa)
- ATS-format export (PDF / DOCX)

## Author

**Your Name** — _contact / website to be added_

---

## License

MIT — see [LICENSE](LICENSE).
