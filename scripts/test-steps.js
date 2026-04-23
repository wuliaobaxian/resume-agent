// Per-step timing test: calls /api/analyze/extract, /match, /suggest in sequence.
// Usage: node scripts/test-steps.js [base-url]
// Exits non-zero if any step exceeds 10s.

const base = process.argv[2] || "http://localhost:3000";

const jdText = `Senior Product Manager — B2B SaaS Platform

We are hiring a Senior Product Manager to lead our enterprise analytics platform. You will own the product strategy for a suite of B2B SaaS tools used by Fortune 500 customers.

Responsibilities:
- Own the product roadmap for our core analytics platform
- Define and prioritize features based on customer research and data analysis
- Partner closely with engineering, design, and go-to-market teams
- Run customer discovery interviews with enterprise buyers and users
- Translate enterprise requirements into shippable specs
- Define success metrics and drive measurable business impact
- Present product updates to executives and customers

Requirements:
- 5+ years of product management experience
- 3+ years in B2B SaaS, ideally with enterprise customers
- Strong SQL and data-analysis skills — you should be comfortable querying production data to answer your own questions
- Experience shipping features that drive measurable revenue or retention impact
- Excellent written communication; you can write a crisp one-pager without help
- Bachelor's degree or equivalent experience

Nice to have:
- Experience with Amplitude or similar analytics tools
- Background in Figma for lightweight mocking
- Prior experience with Jira for agile delivery
`;

const resumeText = `Jane Doe
Product Manager

Summary
Product manager with 5 years of experience building consumer mobile apps. Led features across onboarding, notifications, and growth surfaces for a social app with 2M MAU.

Experience

Product Manager — Acme Social (2021–2025)
- Led product development for mobile app onboarding, growing new-user activation from 42% to 61% over 6 months
- Coordinated 8 engineers and 2 designers on the notifications rewrite, shipping the project one sprint ahead of plan
- Ran weekly user interviews with 6-8 consumers; used insights to kill two planned features that did not resonate
- Defined and tracked activation, retention, and engagement metrics in Amplitude

Associate Product Manager — Acme Social (2020–2021)
- Owned small growth experiments on the invite flow, including an A/B test that increased invite conversion by 12%
- Partnered with data analysts to pull behavioral data for weekly product reviews

Skills
Product strategy, roadmapping, user interviews, A/B testing, Amplitude, Figma, Jira, cross-functional collaboration, written communication

Education
B.S. Computer Science, State University, 2020
`;

async function call(path, body) {
  const t0 = Date.now();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const clientMs = Date.now() - t0;
  const json = await res.json();
  return { json, clientMs, status: res.status };
}

(async () => {
  let failed = false;

  console.log(`[1/3] POST /api/analyze/extract`);
  const ex = await call("/api/analyze/extract", { jdText, resumeText });
  if (!ex.json.success) {
    console.error("  extract FAILED:", ex.json.error);
    process.exit(1);
  }
  console.log(
    `  ok — server ${ex.json.metadata.durationMs}ms, client ${ex.clientMs}ms, tokens ${ex.json.metadata.tokens.total}`
  );
  if (ex.json.metadata.durationMs > 10_000) {
    console.error("  !!! EXTRACT exceeded 10s");
    failed = true;
  }

  console.log(`[2/3] POST /api/analyze/match`);
  const mt = await call("/api/analyze/match", { extraction: ex.json.data });
  if (!mt.json.success) {
    console.error("  match FAILED:", mt.json.error);
    process.exit(1);
  }
  console.log(
    `  ok — server ${mt.json.metadata.durationMs}ms, client ${mt.clientMs}ms, tokens ${mt.json.metadata.tokens.total}`
  );
  if (mt.json.metadata.durationMs > 10_000) {
    console.error("  !!! MATCH exceeded 10s");
    failed = true;
  }

  console.log(`[3/3] POST /api/analyze/suggest`);
  const sg = await call("/api/analyze/suggest", {
    matching: mt.json.data,
    resumeText,
    jdText,
  });
  if (!sg.json.success) {
    console.error("  suggest FAILED:", sg.json.error);
    process.exit(1);
  }
  console.log(
    `  ok — server ${sg.json.metadata.durationMs}ms, client ${sg.clientMs}ms, tokens ${sg.json.metadata.tokens.total}`
  );
  if (sg.json.metadata.durationMs > 10_000) {
    console.error("  !!! SUGGEST exceeded 10s");
    failed = true;
  }

  const total =
    ex.json.metadata.durationMs +
    mt.json.metadata.durationMs +
    sg.json.metadata.durationMs;
  const totalTokens =
    ex.json.metadata.tokens.total +
    mt.json.metadata.tokens.total +
    sg.json.metadata.tokens.total;
  console.log(
    `\nTotal server time: ${(total / 1000).toFixed(1)}s, tokens: ${totalTokens}`
  );
  console.log(
    `Honesty: proceed=${sg.json.data.suggestions.honesty_check.should_proceed}`
  );
  console.log(
    `Validation: ${sg.json.data.validation.issues.length} issue(s), valid=${sg.json.data.validation.valid}`
  );
  console.log(`Strengths: ${(mt.json.data.strengths ?? []).length}`);

  if (failed) {
    console.error("\nFAIL: at least one step exceeded 10s");
    process.exit(2);
  }
  console.log("\nPASS: every step under 10s");
})();
