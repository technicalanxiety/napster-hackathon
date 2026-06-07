/**
 * Property-based test for the Policy Function input module.
 *
 * Feature: azure-governance-advisor, Property 2: Case-insensitive acceptance and canonical normalization
 *
 * For any accepted `category` or `severity` value in any letter casing,
 * validation accepts the input and normalizes the value to its canonical
 * lowercase form.
 *
 * Validates: Requirements 4.1, 4.4, 4.5
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseAndValidate } from "./input";
import { CATEGORY_VALUES, SEVERITY_VALUES } from "./types";

const NUM_RUNS = 200;

/**
 * Produce an arbitrary letter-casing variant of a canonical lowercase value.
 * Each character is independently upper- or lower-cased so the generated input
 * spans the full casing space (all-lower, all-upper, and mixed forms).
 */
function arbitraryCasing(canonical: string): fc.Arbitrary<string> {
  return fc
    .array(fc.boolean(), { minLength: canonical.length, maxLength: canonical.length })
    .map((flags) =>
      canonical
        .split("")
        .map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase()))
        .join(""),
    );
}

/** An accepted category in some arbitrary casing, paired with its canonical form. */
const categoryCasing = fc
  .constantFrom(...CATEGORY_VALUES)
  .chain((canonical) =>
    arbitraryCasing(canonical).map((cased) => ({ canonical, cased })),
  );

/** An accepted severity in some arbitrary casing, paired with its canonical form. */
const severityCasing = fc
  .constantFrom(...SEVERITY_VALUES)
  .chain((canonical) =>
    arbitraryCasing(canonical).map((cased) => ({ canonical, cased })),
  );

describe("Property 2: Case-insensitive acceptance and canonical normalization", () => {
  it("accepts category in any casing and normalizes to canonical lowercase", () => {
    fc.assert(
      fc.property(categoryCasing, severityCasing, (cat, sev) => {
        const body = JSON.stringify({ category: cat.cased, severity: sev.cased });
        const result = parseAndValidate(body);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.category).toBe(cat.canonical);
          expect(result.value.severity).toBe(sev.canonical);
          // The normalized value is always lowercase canonical form.
          expect(result.value.category).toBe(result.value.category.toLowerCase());
          expect(result.value.severity).toBe(result.value.severity.toLowerCase());
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("accepts an accepted category alone (severity defaulting) in any casing", () => {
    fc.assert(
      fc.property(categoryCasing, (cat) => {
        const result = parseAndValidate(JSON.stringify({ category: cat.cased }));

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.category).toBe(cat.canonical);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("accepts an accepted severity alone (category defaulting) in any casing", () => {
    fc.assert(
      fc.property(severityCasing, (sev) => {
        const result = parseAndValidate(JSON.stringify({ severity: sev.cased }));

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.severity).toBe(sev.canonical);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
