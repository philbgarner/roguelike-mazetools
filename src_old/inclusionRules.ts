// src/inclusionRules.ts
//
// Milestone 6, Phase 4 — Exclusion / Inclusion Rules
//
// Post-generation validation: checks that required patterns succeeded
// and required content types are present.
// Pre-generation exclusion (excludePatterns) is enforced in mazeGen.ts.

import type { InclusionRules } from "./configTypes";

export type InclusionViolation = {
  kind: "requiredPatternMissing" | "requiredContentMissing";
  name: string;
  detail?: string;
};

export type InclusionResult = {
  pass: boolean;
  violations: InclusionViolation[];
};

type InclusionMeta = {
  [key: string]: unknown[] | undefined;
};

type PatternDiag = {
  name: string;
  ok: boolean;
};

export function validateInclusionRules(
  meta: InclusionMeta,
  rules: InclusionRules | null,
  patternDiagnostics: PatternDiag[],
): InclusionResult {
  if (!rules) {
    return { pass: true, violations: [] };
  }

  const violations: InclusionViolation[] = [];

  // Check required patterns: at least one diagnostic entry with matching name
  // must have ok === true.
  if (rules.requirePatterns) {
    for (const name of rules.requirePatterns) {
      const matching = patternDiagnostics.filter((d) => d.name === name);
      const anyOk = matching.some((d) => d.ok);
      if (!anyOk) {
        const reason =
          matching.length === 0
            ? `pattern "${name}" was not attempted`
            : `pattern "${name}" attempted but failed`;
        violations.push({
          kind: "requiredPatternMissing",
          name,
          detail: reason,
        });
      }
    }
  }

  // Check required content types: meta array must exist and be non-empty.
  if (rules.requireContentTypes) {
    for (const name of rules.requireContentTypes) {
      const arr = meta[name];
      if (!Array.isArray(arr) || arr.length === 0) {
        violations.push({
          kind: "requiredContentMissing",
          name,
          detail: `content type "${name}" is empty or missing`,
        });
      }
    }
  }

  return {
    pass: violations.length === 0,
    violations,
  };
}
