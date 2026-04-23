// One-shot E2E test: POST to /api/analyze and parse the SSE stream.
// Usage: node scripts/test-agent.js [url]

const url = process.argv[2] || "http://localhost:3000/api/analyze";

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

(async () => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jdText, resumeText }),
  });

  if (!res.ok) {
    console.error("HTTP", res.status, await res.text());
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;

  const started = Date.now();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      let dataLine = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      let data;
      try {
        data = JSON.parse(dataLine);
      } catch {
        data = dataLine;
      }
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      if (event === "progress") {
        console.log(`[${elapsed}s] progress: ${data.step}/${data.status}`);
      } else if (event === "result") {
        finalResult = data;
        console.log(`[${elapsed}s] result received`);
      } else if (event === "partial") {
        console.log(`[${elapsed}s] PARTIAL (degraded):`, data.message);
      } else if (event === "error") {
        console.log(`[${elapsed}s] ERROR:`, data);
      }
    }
  }

  if (finalResult) {
    console.log("\n=== AGENT RESULT ===");
    console.log(JSON.stringify(finalResult, null, 2));
  }
})();
