/**
 * Property-based tests for the Response Module.
 *
 * Feature: azure-governance-advisor, Property 8: Response structure and
 * counting invariants
 *
 * For any set of findings, the built response contains a subscriptionId, an
 * ISO-8601 UTC `Z` assessmentTimestamp, a summary, and a findings array;
 * byCategory has a count for each of the five categories; each category count
 * equals the number of findings in that category (zero when none);
 * totalNonCompliant equals findings.length; per-category counts sum to
 * totalNonCompliant; and every finding carries a valid category enum,
 * policyName, resourceId, resourceType, and valid severity enum.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildResponse } from "./response";
import {
  FINDING_CATEGORY_VALUES,
  SEVERITY_LEVEL_VALUES,
  type Finding,
  type FindingCategory,
  type Severity,
} from "./types";

const CATEGORY_SET: ReadonlySet<FindingCategory> = new Set(
  FINDING_CATEGORY_VALUES,
);
const SEVERITY_SET: ReadonlySet<Severity> = new Set(SEVERITY_LEVEL_VALUES);

/** ISO-8601 UTC timestamp with the trailing `Z` zone designator. */
const ISO_UTC_Z =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Generates a single arbitrary Finding across the full input space. */
const findingArb: fc.Arbitrary<Finding> = fc.record({
  category: fc.constantFrom(...FINDING_CATEGORY_VALUES),
  policyName: fc.string(),
  policyDisplayName: fc.string(),
  resourceId: fc.string(),
  resourceType: fc.string(),
  resourceGroup: fc.string(),
  severity: fc.constantFrom(...SEVERITY_LEVEL_VALUES),
});

/** Arbitrary arrays of findings, including the empty array. */
const findingsArb: fc.Arbitrary<Finding[]> = fc.array(findingArb, {
  maxLength: 50,
});

const subscriptionIdArb: fc.Arbitrary<string> = fc.string();

describe("buildResponse — Property 8", () => {
  it("produces a response with the required top-level structure", () => {
    fc.assert(
      fc.property(subscriptionIdArb, findingsArb, (subscriptionId, findings) => {
        const response = buildResponse(subscriptionId, findings);

        // subscriptionId echoed back. (Requirement 7.1)
        expect(response.subscriptionId).toBe(subscriptionId);
        // ISO-8601 UTC timestamp with `Z`. (Requirement 7.6)
        expect(typeof response.assessmentTimestamp).toBe("string");
        expect(response.assessmentTimestamp).toMatch(ISO_UTC_Z);
        // summary present and findings is an array. (Requirement 7.1)
        expect(response.summary).toBeDefined();
        expect(Array.isArray(response.findings)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("byCategory has a count for each of the five categories equal to that category's finding count", () => {
    fc.assert(
      fc.property(subscriptionIdArb, findingsArb, (subscriptionId, findings) => {
        const { byCategory } = buildResponse(subscriptionId, findings).summary;

        // Exactly the five governance categories are present as keys.
        // (Requirements 7.2, 7.7)
        expect(Object.keys(byCategory).sort()).toEqual(
          [...FINDING_CATEGORY_VALUES].sort(),
        );

        for (const category of FINDING_CATEGORY_VALUES) {
          const expected = findings.filter(
            (f) => f.category === category,
          ).length;
          // Each count equals the number of findings in that category, zero
          // when none. (Requirements 7.2, 7.7)
          expect(byCategory[category]).toBe(expected);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("totalNonCompliant equals findings.length and per-category counts sum to it", () => {
    fc.assert(
      fc.property(subscriptionIdArb, findingsArb, (subscriptionId, findings) => {
        const { summary, findings: outFindings } = buildResponse(
          subscriptionId,
          findings,
        );

        // total == findings.length. (Requirement 7.4)
        expect(summary.totalNonCompliant).toBe(findings.length);
        expect(outFindings.length).toBe(findings.length);

        // per-category counts sum to total. (Requirement 7.8)
        const sum = FINDING_CATEGORY_VALUES.reduce(
          (acc, category) => acc + summary.byCategory[category],
          0,
        );
        expect(sum).toBe(summary.totalNonCompliant);
      }),
      { numRuns: 200 },
    );
  });

  it("every finding carries a valid category enum, policyName, resourceId, resourceType, and valid severity enum", () => {
    fc.assert(
      fc.property(subscriptionIdArb, findingsArb, (subscriptionId, findings) => {
        const response = buildResponse(subscriptionId, findings);

        for (const finding of response.findings) {
          // valid category enum. (Requirement 7.3)
          expect(CATEGORY_SET.has(finding.category)).toBe(true);
          // valid severity enum. (Requirement 7.3)
          expect(SEVERITY_SET.has(finding.severity)).toBe(true);
          // required string fields present. (Requirement 7.3)
          expect(typeof finding.policyName).toBe("string");
          expect(typeof finding.resourceId).toBe("string");
          expect(typeof finding.resourceType).toBe("string");
        }
      }),
      { numRuns: 200 },
    );
  });
});
