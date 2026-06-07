/**
 * Property-based tests for Resource Graph finding extraction.
 *
 * Feature: azure-governance-advisor, Property 6: Finding extraction is total
 * with empty-string fill
 *
 * For any set of raw Resource Graph rows, every row is retained as a Finding
 * (no row is discarded), each Finding carries the resource identifier, resource
 * type, policy name, policy display name, category, and resource group, and any
 * optional source field (policy display name, category, resource group) that is
 * absent is populated with an empty string rather than the row being dropped.
 *
 * Validates: Requirements 5.3, 5.4
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  queryNonCompliantFindings,
  type QueryExecutor,
  type ResourceGraphRow,
} from "./resource-graph";

/** The six fields the extractor projects onto every Finding. */
const FINDING_FIELDS = [
  "resourceId",
  "resourceType",
  "policyName",
  "policyDisplayName",
  "category",
  "resourceGroup",
] as const;

/**
 * Generates a single raw Resource Graph row. Every field is independently
 * present-or-absent (so optional fields are frequently missing), and present
 * values may be an arbitrary string or an explicit null — both of which the
 * extractor must coerce to an empty string when no value is available.
 */
const rowArb: fc.Arbitrary<ResourceGraphRow> = fc.record(
  {
    resourceId: fc.oneof(fc.string(), fc.constant(null)),
    resourceType: fc.oneof(fc.string(), fc.constant(null)),
    policyName: fc.oneof(fc.string(), fc.constant(null)),
    policyDisplayName: fc.oneof(fc.string(), fc.constant(null)),
    category: fc.oneof(fc.string(), fc.constant(null)),
    resourceGroup: fc.oneof(fc.string(), fc.constant(null)),
  },
  // Each key is optional, so a row may omit any subset of fields entirely.
  { requiredKeys: [] },
);

/** Generates arbitrary arrays of rows, including the empty array. */
const rowsArb: fc.Arbitrary<ResourceGraphRow[]> = fc.array(rowArb, {
  maxLength: 25,
});

/**
 * The expected extracted string for a source value: an absent (missing key) or
 * null value becomes "", any other string is retained verbatim.
 */
function expectedValue(
  row: ResourceGraphRow,
  field: (typeof FINDING_FIELDS)[number],
): string {
  const value = row[field];
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

describe("queryNonCompliantFindings — Property 6", () => {
  it("retains every row and fills absent optional fields with empty strings", async () => {
    await fc.assert(
      fc.asyncProperty(rowsArb, async (rows) => {
        // Mock the executor so no real Azure call is made; it returns the
        // generated rows verbatim.
        const executor: QueryExecutor = async () => rows;

        const findings = await queryNonCompliantFindings("sub-id", executor);

        // Totality: no row is discarded, order preserved one-to-one.
        expect(findings).toHaveLength(rows.length);

        findings.forEach((finding, index) => {
          const row = rows[index];

          for (const field of FINDING_FIELDS) {
            // Every Finding carries each field as a string (never undefined).
            expect(typeof finding[field]).toBe("string");
            // Present values are retained; absent/null values become "".
            expect(finding[field]).toBe(expectedValue(row, field));
          }
        });
      }),
      { numRuns: 200 },
    );
  });
});
