/**
 * Shared type definitions for the Policy Function.
 *
 * These types model the request input (after normalization), the internal
 * Finding representation extracted from Azure Resource Graph, and the structured
 * response envelope returned to the Napster platform. They are the single source
 * of truth for the accepted `category`/`severity` value sets used across input
 * validation, severity mapping, filtering, and response shaping.
 */

// ---------------------------------------------------------------------------
// Accepted value sets (canonical lowercase constants)
// ---------------------------------------------------------------------------

/**
 * Canonical lowercase `category` filter values accepted on a request.
 * Includes the `all` sentinel plus the five governance categories.
 * (Requirements 4.1, 4.4)
 */
export const CATEGORY_VALUES = [
  "all",
  "networking",
  "storage",
  "identity",
  "compute",
  "logging",
] as const;

/**
 * Canonical lowercase `severity` filter values accepted on a request.
 * Includes the `all` sentinel plus the three severity ratings.
 * (Requirements 4.1, 4.5)
 */
export const SEVERITY_VALUES = ["all", "high", "medium", "low"] as const;

/**
 * The five governance categories a Finding can belong to (excludes `all`).
 * (Requirement 7.3)
 */
export const FINDING_CATEGORY_VALUES = [
  "networking",
  "storage",
  "identity",
  "compute",
  "logging",
] as const;

/**
 * The three severity ratings a Finding can be assigned (excludes `all`).
 * (Requirement 7.3)
 */
export const SEVERITY_LEVEL_VALUES = ["high", "medium", "low"] as const;

// ---------------------------------------------------------------------------
// NormalizedInput (Policy Function internal)
// ---------------------------------------------------------------------------

/** A `category` filter value in canonical lowercase form. */
export type Category = (typeof CATEGORY_VALUES)[number];

/** A `severity` filter value in canonical lowercase form. */
export type SeverityFilter = (typeof SEVERITY_VALUES)[number];

/**
 * The request input after parsing, defaulting, and normalization. Both fields
 * are lowercase canonical values, defaulted to `all` when absent or empty.
 */
export interface NormalizedInput {
  category: Category;
  severity: SeverityFilter;
}

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

/** The governance category a Finding belongs to (one of the five domains). */
export type FindingCategory = (typeof FINDING_CATEGORY_VALUES)[number];

/** The severity rating assigned to a Finding by the Severity_Mapper. */
export type Severity = (typeof SEVERITY_LEVEL_VALUES)[number];

/**
 * A single non-compliant resource-policy pair extracted from Azure Resource
 * Graph. Optional source fields (`policyDisplayName`, `category`,
 * `resourceGroup`) are populated with empty strings rather than dropped when
 * absent in the source row. (Requirements 5.3, 5.4)
 */
export interface Finding {
  category: FindingCategory;
  policyName: string;
  policyDisplayName: string;
  resourceId: string;
  resourceType: string;
  resourceGroup: string;
  severity: Severity;
}

// ---------------------------------------------------------------------------
// PolicyCheckResponse
// ---------------------------------------------------------------------------

/** Per-category count of non-compliant findings; one entry per category. */
export interface CategoryBreakdown {
  networking: number;
  storage: number;
  identity: number;
  compute: number;
  logging: number;
}

/** Summary block: total non-compliant count plus the per-category breakdown. */
export interface Summary {
  /** Equal to the length of the findings array. */
  totalNonCompliant: number;
  /** Per-category counts that sum to `totalNonCompliant`. */
  byCategory: CategoryBreakdown;
}

/** The structured success response envelope. (Requirement 7.1) */
export interface PolicyCheckResponse {
  subscriptionId: string;
  /** ISO-8601 timestamp expressed in UTC with the `Z` zone designator. */
  assessmentTimestamp: string;
  summary: Summary;
  findings: Finding[];
}

// ---------------------------------------------------------------------------
// ErrorResponse
// ---------------------------------------------------------------------------

/** The error response body returned on 4xx/5xx outcomes. */
export interface ErrorResponse {
  /** Human-readable error message. */
  error: string;
  /** Present for 400 field-validation errors; lists the accepted values. */
  acceptedValues?: string[];
}
