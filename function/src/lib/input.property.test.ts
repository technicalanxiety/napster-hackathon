/**
 * Property-based tests for the Policy Function input module.
 *
 * Feature: azure-governance-advisor, Property 1: Field defaulting to "all"
 *
 * For any request input in which the `category` (or `severity`) field is absent
 * or present as an empty string, the normalized value of that field is `all`.
 *
 * Validates: Requirements 4.2, 4.3
 */

import { describe, expect, test } from "vitest";
import fc from "fast-check";

import { parseAndValidate } from "./input";
import { CATEGORY_VALUES, SEVERITY_VALUES } from "./types";

const MIN_RUNS = 100;

/**
 * A field is generated in one of three states:
 *  - "absent": the key is omitted from the request body entirely.
 *  - "empty": the key is present with an empty-string value.
 *  - "value": the key is present with a valid canonical value.
 *
 * Property 1 concerns only the first two states (absent / empty), but we mix in
 * the "value" state for the other field so defaulting is exercised even when the
 * sibling field carries a real value.
 */
type FieldState =
  | { kind: "absent" }
  | { kind: "empty" }
  | { kind: "value"; value: string };

function fieldStateArb(acceptedValues: readonly string[]): fc.Arbitrary<FieldState> {
  return fc.oneof(
    fc.constant<FieldState>({ kind: "absent" }),
    fc.constant<FieldState>({ kind: "empty" }),
    fc
      .constantFrom(...acceptedValues)
      .map<FieldState>((value) => ({ kind: "value", value })),
  );
}

/** Assemble a raw request body string from the two field states. */
function buildBody(category: FieldState, severity: FieldState): string {
  const obj: Record<string, string> = {};
  if (category.kind === "empty") obj.category = "";
  if (category.kind === "value") obj.category = category.value;
  if (severity.kind === "empty") obj.severity = "";
  if (severity.kind === "value") obj.severity = severity.value;
  return JSON.stringify(obj);
}

describe("Property 1: Field defaulting to \"all\"", () => {
  test("absent or empty category/severity normalize to \"all\"", () => {
    fc.assert(
      fc.property(
        fieldStateArb(CATEGORY_VALUES),
        fieldStateArb(SEVERITY_VALUES),
        (categoryState, severityState) => {
          const result = parseAndValidate(buildBody(categoryState, severityState));

          // All generated bodies are valid, so parsing must succeed.
          expect(result.ok).toBe(true);
          if (!result.ok) return;

          // The core of Property 1: an absent or empty field defaults to "all".
          if (categoryState.kind === "absent" || categoryState.kind === "empty") {
            expect(result.value.category).toBe("all");
          }
          if (severityState.kind === "absent" || severityState.kind === "empty") {
            expect(result.value.severity).toBe("all");
          }
        },
      ),
      { numRuns: MIN_RUNS },
    );
  });

  test("an absent body (undefined/null/empty) defaults both fields to \"all\"", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<string | null | undefined>(undefined, null, ""),
        (rawBody) => {
          const result = parseAndValidate(rawBody);

          expect(result.ok).toBe(true);
          if (!result.ok) return;

          expect(result.value.category).toBe("all");
          expect(result.value.severity).toBe("all");
        },
      ),
      { numRuns: MIN_RUNS },
    );
  });
});
