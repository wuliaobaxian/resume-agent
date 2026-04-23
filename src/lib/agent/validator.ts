import type { SuggestionResult, ValidationIssue, ValidationResult } from "./schemas";

// Normalize whitespace for fuzzy containment checks.
function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

// Fuzzy-ish containment: returns true if `needle` overlaps `haystack` substantially.
// Exact substring (after normalization) passes; otherwise we shingle the needle into
// 5-word windows and require 90% of them to appear in the haystack.
function fuzzyContains(haystack: string, needle: string): boolean {
  const h = normalize(haystack);
  const n = normalize(needle);
  if (!n) return true;
  if (h.includes(n)) return true;

  const words = n.split(" ");
  if (words.length < 5) return false;

  const windowSize = 5;
  const windows: string[] = [];
  for (let i = 0; i <= words.length - windowSize; i++) {
    windows.push(words.slice(i, i + windowSize).join(" "));
  }
  if (windows.length === 0) return false;
  const hits = windows.filter((w) => h.includes(w)).length;
  return hits / windows.length >= 0.9;
}

// Extract standalone numeric tokens (integers, decimals, percentages, "Nk", etc.).
function extractNumbers(s: string): string[] {
  const matches = s.match(/\b\d+(?:[.,]\d+)?%?k?\b/gi);
  return matches ? matches.map((m) => m.toLowerCase()) : [];
}

export function validateSuggestions(
  suggestions: SuggestionResult,
  originalResume: string,
  originalJD: string
): ValidationResult {
  const issues: ValidationIssue[] = [];

  for (const s of suggestions.suggestions) {
    // Rule 1: original_text must appear in resume (for rewrite/remove).
    if (
      (s.type === "rewrite" || s.type === "remove") &&
      s.original_text &&
      s.original_text.trim().length > 0 &&
      !fuzzyContains(originalResume, s.original_text)
    ) {
      issues.push({
        suggestionId: s.id,
        issue: "Original text not found in resume — may be fabricated.",
        severity: "warning",
      });
    }

    // Rule 2: jd_basis should appear in the JD.
    if (
      s.jd_basis &&
      s.jd_basis.trim().length > 0 &&
      !fuzzyContains(originalJD, s.jd_basis)
    ) {
      issues.push({
        suggestionId: s.id,
        issue: "JD basis not found in the provided job description.",
        severity: "warning",
      });
    }

    // Rule 3: adds_new_facts without requires_user_input is a contract violation.
    if (s.adds_new_facts && !s.requires_user_input) {
      issues.push({
        suggestionId: s.id,
        issue:
          "Suggestion adds new facts without requiring user input — likely fabricated.",
        severity: "error",
      });
    }

    // Rule 4: numbers in suggested_text that don't exist in original_text or resume.
    const suggestedNums = extractNumbers(s.suggested_text);
    if (suggestedNums.length > 0) {
      const sourceNums = new Set([
        ...extractNumbers(s.original_text ?? ""),
        ...extractNumbers(originalResume),
      ]);
      const invented = suggestedNums.filter((n) => !sourceNums.has(n));
      if (invented.length > 0) {
        issues.push({
          suggestionId: s.id,
          issue: `Suggested text contains numbers not present in source (${invented.join(", ")}).`,
          severity: "warning",
        });
      }
    }
  }

  const valid = issues.every((i) => i.severity !== "error");
  return { valid, issues };
}
