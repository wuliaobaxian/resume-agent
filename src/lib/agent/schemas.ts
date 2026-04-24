export interface ExtractionResult {
  jd: {
    role_title: string | null;
    seniority_level: "junior" | "mid" | "senior" | "lead" | "unspecified";
    required_years: number | null;
    industry: string | null;
    hard_skills: string[];
    soft_skills: string[];
    domain_experience: string[];
    core_responsibilities: string[];
    nice_to_haves: string[];
  };
  resume: {
    current_title: string | null;
    total_years_experience: number | null;
    industries_worked_in: string[];
    hard_skills_claimed: string[];
    soft_skills_demonstrated: string[];
    domains_experienced: string[];
    key_achievements: string[];
    work_history_summary: Array<{
      role: string;
      company_type: string | null;
      years: number | null;
      key_points: string[];
    }>;
  };
}

export interface MatchingResult {
  overall_match: {
    score: number;
    verdict: string;
    summary: string;
  };
  dimensions: Array<{
    name: string;
    score: number;
    confidence: "high" | "medium" | "low";
    note: string;
    evidence_from_resume: string[];
    evidence_from_jd: string[];
  }>;
  gaps: Array<{
    area: string;
    severity: "high" | "medium" | "low";
    confidence: "high" | "medium" | "low";
    description: string;
    jd_requirement: string;
    resume_state: string;
    is_addressable_by_rewrite: boolean;
    honest_note: string;
  }>;
  strengths: Array<{
    area: string;
    evidence: string;
    jd_relevance: string;
  }>;
}

export interface SuggestionResult {
  suggestions: Array<{
    id: string;
    type: "rewrite" | "add" | "remove" | "reorder";
    priority: "high" | "medium" | "low";
    target_section: string;
    original_text: string | null;
    suggested_text: string;
    jd_basis: string;
    reasoning: string;
    requires_user_input: boolean;
    adds_new_facts: boolean;
  }>;
  honesty_check: {
    should_proceed: boolean;
    reasoning: string;
    message_to_user: string;
    alternative_suggestions: string[];
  };
}

export interface ValidationIssue {
  suggestionId: string;
  issue: string;
  severity: "warning" | "error";
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface AgentResult {
  extraction: ExtractionResult;
  matching: MatchingResult;
  suggestions: SuggestionResult;
  validation: ValidationResult;
  metadata: {
    totalTokens: number;
    durationMs: number;
    modelUsed: string;
  };
}

export type AgentStep = "extract" | "match" | "suggest";
export type AgentStepStatus = "start" | "done";
