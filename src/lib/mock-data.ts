// Mock analysis result used by the result page while the AI agent is not yet wired up.
// Shape mirrors what the real agent will eventually return.

export type Severity = "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";
export type SuggestionType = "rewrite" | "add" | "remove";

export interface AnalysisResult {
  overallMatch: {
    score: number;
    verdict: string;
    summary: string;
  };
  dimensions: Array<{
    name: string;
    score: number;
    note: string;
  }>;
  gaps: Array<{
    area: string;
    severity: Severity;
    confidence: Confidence;
    description: string;
    honestNote: string;
  }>;
  suggestions: Array<{
    id: string;
    type: SuggestionType;
    targetSection: string;
    originalText: string | null;
    suggestedText: string;
    reasoning: string;
    requiresUserInput: boolean;
  }>;
  honestyCheck: {
    shouldProceed: boolean;
    message: string;
  };
}

export const mockResult: AnalysisResult = {
  overallMatch: {
    score: 68,
    verdict: "Moderate fit with addressable gaps",
    summary:
      "Your background in product management aligns well with the core responsibilities, but the JD's emphasis on B2B SaaS and data-driven decision making reveals some gaps worth addressing.",
  },
  dimensions: [
    {
      name: "Core Skills",
      score: 75,
      note: "Strong overlap in product strategy and cross-functional collaboration.",
    },
    {
      name: "Industry Experience",
      score: 55,
      note: "Your experience is primarily in consumer products; this role is B2B SaaS.",
    },
    {
      name: "Seniority Level",
      score: 80,
      note: "Your 5 years of PM experience matches the mid-senior requirement.",
    },
    {
      name: "Technical Depth",
      score: 60,
      note: "JD expects SQL and data analysis fluency; your resume doesn't emphasize this.",
    },
  ],
  gaps: [
    {
      area: "B2B SaaS Experience",
      severity: "high",
      confidence: "high",
      description:
        "The JD requires 3+ years in B2B SaaS. Your resume shows primarily consumer product experience.",
      honestNote:
        "This is a real gap, not one you can rewrite your way out of. Consider highlighting any enterprise-facing features or B2B-adjacent work you've done.",
    },
    {
      area: "SQL / Data Analysis",
      severity: "medium",
      confidence: "medium",
      description:
        "The JD mentions SQL proficiency as a core skill. Your resume doesn't mention SQL.",
      honestNote:
        "If you actually have this skill, add it. If not, don't fake it — it will come up in technical screens.",
    },
    {
      area: "Metrics-driven storytelling",
      severity: "low",
      confidence: "high",
      description:
        "Your resume describes responsibilities but lacks quantified outcomes in several roles.",
      honestNote:
        "This is fixable. We've suggested specific rewrites below based on your existing bullets.",
    },
  ],
  suggestions: [
    {
      id: "sug-1",
      type: "rewrite",
      targetSection: "Work Experience — Product Manager at XYZ",
      originalText: "Led product development for mobile app feature.",
      suggestedText:
        "Led product development for [specific feature], coordinating [team size] engineers and designers across [timeframe]. [Add: specific outcome or metric if you have one].",
      reasoning:
        "The original is too vague. The JD specifically asks for 'ownership' and 'measurable impact' — your rewrite should show both.",
      requiresUserInput: true,
    },
    {
      id: "sug-2",
      type: "add",
      targetSection: "Skills section",
      originalText: null,
      suggestedText:
        "Consider adding a 'Tools & Methods' line that lists concrete tools you've used (e.g., Amplitude, Figma, Jira). The JD explicitly lists these.",
      reasoning:
        "The JD lists several specific tools in the requirements. Your resume doesn't have a tools section.",
      requiresUserInput: false,
    },
  ],
  honestyCheck: {
    shouldProceed: true,
    message:
      "Your match is moderate. With the suggested rewrites, this is worth submitting — but temper expectations and keep applying elsewhere.",
  },
};
