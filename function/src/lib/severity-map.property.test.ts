/**
 * Property-based tests for the Severity_Mapper.
 *
 * Feature: azure-governance-advisor, Property 7: Severity assignment is total,
 * defaulted, and deterministic
 *
 * For any policy name, severityFor returns exactly one value in
 * {high, medium, low}; the same policy name always yields the same severity
 * across repeated and independent calls; and any policy name absent from the
 * lookup table (and matching no severity keyword) yields low.
 *
 * Validates: Requirements 6.1, 6.5, 6.6
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { severityFor } from "./severity-map";
import { SEVERITY_LEVEL_VALUES, type Severity } from "./types";

const SEVERITY_SET: ReadonlySet<Severity> = new Set(SEVERITY_LEVEL_VALUES);

/**
 * Known built-in policy definition GUIDs present in the lookup table, used as
 * generator seeds so the property exercises real table entries alongside
 * arbitrary unknown strings.
 */
const KNOWN_POLICY_NAMES: readonly string[] = [
  "22730e10-96f6-4aac-ad84-9383d35b5917",
  "e372f825-a257-4fb8-9175-797a8a8627d6",
  "404c3081-a854-4457-ae30-26a93ef643f9",
  "0b60c0b2-2dc2-4e1c-b5c9-abbed971de53",
  "b7ddfbdc-1260-477d-91fd-98bd9be789a6",
  "7f89b1eb-583c-429a-8828-af049802c1d9",
  "871b6d14-10aa-478d-b590-94f262ecfa99",
];

/**
 * All keyword substrings that trigger a non-default tier. Used to filter
 * generated strings down to genuinely unknown names for the defaulting check.
 */
const ALL_KEYWORDS: readonly string[] = [
  // high
  "0.0.0.0",
  "rdp",
  "management port",
  "internet",
  "secure transfer",
  "encryption",
  "encrypt",
  "purge protection",
  // medium
  "diagnostic setting",
  "soft delete",
  "tag",
  "audit",
  // low keywords still default to low, so they need not be excluded
];

/** True when a name is genuinely absent from every classification rule. */
function isUnknown(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (KNOWN_POLICY_NAMES.includes(normalized)) {
    return false;
  }
  return !ALL_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/** Generates arbitrary strings plus the known table entries. */
const policyNameArb = fc.oneof(
  fc.string(),
  fc.constantFrom(...KNOWN_POLICY_NAMES),
);

describe("severityFor — Property 7", () => {
  it("is total: always returns exactly one of {high, medium, low}", () => {
    fc.assert(
      fc.property(policyNameArb, (policyName) => {
        const result = severityFor(policyName);
        expect(SEVERITY_SET.has(result)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("is deterministic: repeated and independent calls yield the same severity", () => {
    fc.assert(
      fc.property(policyNameArb, (policyName) => {
        const first = severityFor(policyName);
        const second = severityFor(policyName);
        const third = severityFor(`${policyName}`.slice(0)); // independent string instance
        expect(second).toBe(first);
        expect(third).toBe(first);
      }),
      { numRuns: 200 },
    );
  });

  it("defaults unknown policy names to low", () => {
    fc.assert(
      fc.property(
        fc.string().filter(isUnknown),
        (policyName) => {
          expect(severityFor(policyName)).toBe("low");
        },
      ),
      { numRuns: 200 },
    );
  });
});
