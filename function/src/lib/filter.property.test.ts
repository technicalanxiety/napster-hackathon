/**
 * Property-based tests for category/severity filtering.
 *
 * Feature: azure-governance-advisor, Property 5: Filtering restricts results to
 * matching dimensions
 *
 * For any set of findings and any (category, severity) filter pair, every
 * finding in the returned result matches the filter on each dimension whose
 * value is not `all`; when both dimensions are not `all`, every returned
 * finding matches both; when a dimension is `all`, it imposes no restriction on
 * that dimension. Additionally, no finding that matches the filter is dropped.
 *
 * Validates: Requirements 4.9, 4.10, 4.11
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyFilters } from "./filter";
import {
  CATEGORY_VALUES,
  FINDING_CATEGORY_VALUES,
  SEVERITY_LEVEL_VALUES,
  SEVERITY_VALUES,
  type Category,
  type Finding,
  type SeverityFilter,
} from "./types";

/** Generates a single Finding with arbitrary category, severity, and fields. */
const findingArb: fc.Arbitrary<Finding> = fc.record({
  category: fc.constantFrom(...FINDING_CATEGORY_VALUES),
  policyName: fc.string(),
  policyDisplayName: fc.string(),
  resourceId: fc.string(),
  resourceType: fc.string(),
  resourceGroup: fc.string(),
  severity: fc.constantFrom(...SEVERITY_LEVEL_VALUES),
});

/** Arbitrary array of findings, including the empty set. */
const findingsArb: fc.Arbitrary<Finding[]> = fc.array(findingArb, {
  maxLength: 30,
});

/** Arbitrary category filter value (includes the `all` sentinel). */
const categoryArb: fc.Arbitrary<Category> = fc.constantFrom(...CATEGORY_VALUES);

/** Arbitrary severity filter value (includes the `all` sentinel). */
const severityArb: fc.Arbitrary<SeverityFilter> = fc.constantFrom(
  ...SEVERITY_VALUES,
);

/** A finding matches a filter pair iff it satisfies each non-`all` dimension. */
function matchesFilter(
  finding: Finding,
  category: Category,
  severity: SeverityFilter,
): boolean {
  return (
    (category === "all" || finding.category === category) &&
    (severity === "all" || finding.severity === severity)
  );
}

describe("applyFilters — Property 5", () => {
  it("every returned finding matches each non-`all` dimension", () => {
    fc.assert(
      fc.property(
        findingsArb,
        categoryArb,
        severityArb,
        (findings, category, severity) => {
          const result = applyFilters(findings, category, severity);
          for (const finding of result) {
            if (category !== "all") {
              expect(finding.category).toBe(category);
            }
            if (severity !== "all") {
              expect(finding.severity).toBe(severity);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("when both dimensions are not `all`, every returned finding matches both", () => {
    fc.assert(
      fc.property(
        findingsArb,
        fc.constantFrom(...FINDING_CATEGORY_VALUES),
        fc.constantFrom(...SEVERITY_LEVEL_VALUES),
        (findings, category, severity) => {
          const result = applyFilters(findings, category, severity);
          for (const finding of result) {
            expect(finding.category).toBe(category);
            expect(finding.severity).toBe(severity);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("does not drop any finding that matches the filter (no over-filtering)", () => {
    fc.assert(
      fc.property(
        findingsArb,
        categoryArb,
        severityArb,
        (findings, category, severity) => {
          const result = applyFilters(findings, category, severity);
          const expected = findings.filter((f) =>
            matchesFilter(f, category, severity),
          );
          // Result is exactly the set of matching findings, order preserved.
          expect(result).toEqual(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("a dimension set to `all` imposes no restriction on that dimension", () => {
    fc.assert(
      fc.property(findingsArb, (findings) => {
        // Both `all`: every finding is retained.
        expect(applyFilters(findings, "all", "all")).toEqual(findings);
      }),
      { numRuns: 200 },
    );
  });
});
