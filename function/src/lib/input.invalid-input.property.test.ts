/**
 * Property-based tests for invalid-input rejection in the Policy Function's
 * input module.
 *
 * Feature: azure-governance-advisor, Property 3: Invalid field values are
 * rejected before any query
 *
 * For any string supplied for `category` or `severity` outside its accepted
 * set, `parseAndValidate` returns a field validation error identifying the
 * offending field and listing the accepted values; and for any non-empty body
 * that is not valid JSON it returns a parse error. Because `parseAndValidate`
 * is a pure function that returns the failure result before any Azure call, a
 * rejected result structurally guarantees the Resource Graph query is never
 * executed (the HTTP trigger only proceeds to the query on `ok: true`).
 *
 * Validates: Requirements 4.6, 4.7, 4.8
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseAndValidate } from "./input";
import { CATEGORY_VALUES, SEVERITY_VALUES } from "./types";

// 100-case minimum per the design's PBT strategy.
const RUN_CONFIG = { numRuns: 200 } as const;

/**
 * An arbitrary non-empty string whose lowercase form is NOT in `accepted`.
 * Empty strings are excluded because they default to `all` (a valid input),
 * so they are not "outside the accepted set".
 */
function outOfSetString(accepted: readonly string[]): fc.Arbitrary<string> {
  return fc
    .string()
    .filter((s) => s.length > 0 && !accepted.includes(s.toLowerCase()));
}

/**
 * An arbitrary non-empty string that is NOT valid JSON. Empty strings are
 * excluded because an absent/empty body is treated as `{}` (defaults apply),
 * not a parse error.
 */
function malformedJsonString(): fc.Arbitrary<string> {
  return fc.string().filter((s) => {
    if (s.length === 0) {
      return false;
    }
    try {
      JSON.parse(s);
      return false;
    } catch {
      return true;
    }
  });
}

describe("Property 3: invalid field values are rejected before any query", () => {
  it("rejects any out-of-set category with a field error naming category", () => {
    fc.assert(
      fc.property(outOfSetString(CATEGORY_VALUES), (badCategory) => {
        const body = JSON.stringify({ category: badCategory });
        const result = parseAndValidate(body);

        expect(result.ok).toBe(false);
        if (result.ok) {
          return;
        }
        expect(result.error.kind).toBe("field");
        expect(result.error.field).toBe("category");
        expect(result.error.acceptedValues).toEqual([...CATEGORY_VALUES]);
      }),
      RUN_CONFIG,
    );
  });

  it("rejects any out-of-set severity with a field error naming severity", () => {
    fc.assert(
      fc.property(outOfSetString(SEVERITY_VALUES), (badSeverity) => {
        // category is left absent so it defaults to `all`, isolating the
        // severity failure (validation checks category before severity).
        const body = JSON.stringify({ severity: badSeverity });
        const result = parseAndValidate(body);

        expect(result.ok).toBe(false);
        if (result.ok) {
          return;
        }
        expect(result.error.kind).toBe("field");
        expect(result.error.field).toBe("severity");
        expect(result.error.acceptedValues).toEqual([...SEVERITY_VALUES]);
      }),
      RUN_CONFIG,
    );
  });

  it("rejects an out-of-set category even when severity is also invalid (category checked first)", () => {
    fc.assert(
      fc.property(
        outOfSetString(CATEGORY_VALUES),
        outOfSetString(SEVERITY_VALUES),
        (badCategory, badSeverity) => {
          const body = JSON.stringify({
            category: badCategory,
            severity: badSeverity,
          });
          const result = parseAndValidate(body);

          expect(result.ok).toBe(false);
          if (result.ok) {
            return;
          }
          expect(result.error.kind).toBe("field");
          expect(result.error.field).toBe("category");
          expect(result.error.acceptedValues).toEqual([...CATEGORY_VALUES]);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("rejects any non-empty body that is not valid JSON with a parse error", () => {
    fc.assert(
      fc.property(malformedJsonString(), (badBody) => {
        const result = parseAndValidate(badBody);

        expect(result.ok).toBe(false);
        if (result.ok) {
          return;
        }
        expect(result.error.kind).toBe("parse");
        // A parse error carries no field/acceptedValues (no query is reached).
        expect(result.error.field).toBeUndefined();
        expect(result.error.acceptedValues).toBeUndefined();
      }),
      RUN_CONFIG,
    );
  });
});
