/**
 * Input parsing, defaulting, and validation for the Policy Function.
 *
 * `parseAndValidate` is a pure function that turns a raw HTTP request body into
 * a `NormalizedInput` (canonical lowercase `category`/`severity`, defaulted to
 * `all`) or a `ValidationError` describing why the body was rejected. It never
 * touches Azure — the HTTP trigger uses its result to decide whether to proceed
 * to the Resource Graph query (Requirements 4.1–4.8).
 */

import {
  CATEGORY_VALUES,
  SEVERITY_VALUES,
  type Category,
  type NormalizedInput,
  type SeverityFilter,
} from "./types";

// ---------------------------------------------------------------------------
// Result + error types
// ---------------------------------------------------------------------------

/** A discriminated success/failure result. */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Why a request body was rejected. */
export type ValidationErrorKind = "parse" | "field";

/**
 * A validation failure. `parse` errors indicate the body was present but not
 * valid JSON; `field` errors identify the offending field and list the accepted
 * values so the caller can build a 400 response. (Requirements 4.6, 4.7, 4.8)
 */
export interface ValidationError {
  kind: ValidationErrorKind;
  /** The offending field, present only for `field` errors. */
  field?: "category" | "severity";
  /** Human-readable error message. */
  message: string;
  /** The accepted value set, present only for `field` errors. */
  acceptedValues?: string[];
}

// ---------------------------------------------------------------------------
// parseAndValidate
// ---------------------------------------------------------------------------

/**
 * Parse, default, and validate a raw request body.
 *
 * Steps (Requirements 4.1–4.8):
 * 1. A present-but-unparseable body yields a `parse` error. An absent or empty
 *    body is treated as an empty object so defaults apply.
 * 2. Optional `category`/`severity` are read.
 * 3. Absent or empty-string fields default to `all` (Requirements 4.2, 4.3).
 * 4. Values are lowercased and checked for set membership (case-insensitive),
 *    rejecting out-of-set values with a field-specific error (Requirements 4.4–4.7).
 * 5. Accepted values are returned in canonical lowercase form.
 *
 * @param rawBody the raw request body string (or `undefined`/`null` when absent)
 */
export function parseAndValidate(
  rawBody: string | null | undefined,
): Result<NormalizedInput, ValidationError> {
  const parsed = parseBody(rawBody);
  if (!parsed.ok) {
    return parsed;
  }

  const categoryResult = normalizeField(
    "category",
    parsed.value.category,
    CATEGORY_VALUES,
  );
  if (!categoryResult.ok) {
    return categoryResult;
  }

  const severityResult = normalizeField(
    "severity",
    parsed.value.severity,
    SEVERITY_VALUES,
  );
  if (!severityResult.ok) {
    return severityResult;
  }

  return {
    ok: true,
    value: {
      category: categoryResult.value as Category,
      severity: severityResult.value as SeverityFilter,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** The shape we read off the parsed body; both fields are optional. */
interface RawBody {
  category?: unknown;
  severity?: unknown;
}

/**
 * Turn the raw body string into an object. Absent/empty bodies become an empty
 * object (defaults apply); a present-but-unparseable body is a `parse` error
 * (Requirement 4.8).
 */
function parseBody(
  rawBody: string | null | undefined,
): Result<RawBody, ValidationError> {
  if (rawBody === null || rawBody === undefined || rawBody.length === 0) {
    return { ok: true, value: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      error: {
        kind: "parse",
        message: "Request body could not be parsed as JSON.",
      },
    };
  }

  // A JSON value that is not an object (e.g. `42`, `"text"`, `null`, an array)
  // carries no `category`/`severity` fields, so defaults apply.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: true, value: {} };
  }

  return { ok: true, value: parsed as RawBody };
}

/**
 * Default, lowercase, and membership-check a single field.
 * Absent (`undefined`/`null`) or empty-string values default to `all`
 * (Requirements 4.2, 4.3). String values are lowercased and checked
 * case-insensitively (Requirements 4.4, 4.5). Anything else, or an out-of-set
 * value, is a field error (Requirements 4.6, 4.7).
 */
function normalizeField(
  field: "category" | "severity",
  value: unknown,
  acceptedValues: readonly string[],
): Result<string, ValidationError> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: "all" };
  }

  if (typeof value !== "string") {
    return { ok: false, error: fieldError(field, acceptedValues) };
  }

  const normalized = value.toLowerCase();
  if (acceptedValues.includes(normalized)) {
    return { ok: true, value: normalized };
  }

  return { ok: false, error: fieldError(field, acceptedValues) };
}

/** Build a field-specific 400 validation error listing the accepted values. */
function fieldError(
  field: "category" | "severity",
  acceptedValues: readonly string[],
): ValidationError {
  return {
    kind: "field",
    field,
    message: `Invalid ${field} value. Accepted values: ${acceptedValues.join(", ")}.`,
    acceptedValues: [...acceptedValues],
  };
}
