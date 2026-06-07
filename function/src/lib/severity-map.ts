/**
 * Severity Mapper (Policy Function internal).
 *
 * Pure, deterministic mapping from a policy definition name to a {@link Severity}
 * rating. The mapper backs Requirement 6: every Finding receives exactly one of
 * `high`, `medium`, or `low`; the same policy name always yields the same
 * severity (Requirement 6.6); unknown policy names default to `low`
 * (Requirement 6.5); and when a name could match more than one tier the
 * precedence order `high > medium > low` resolves it (Requirement 6.7).
 *
 * Matching strategy: Azure Resource Graph exposes `policyDefinitionName` as a
 * built-in policy definition GUID, while `policyDefinitionDisplayName` is the
 * human-readable form. To stay robust the table is keyed by both the known
 * built-in GUIDs that fire against the demo resources and by descriptive
 * keywords that appear in the display names. The keyword tiers are evaluated in
 * precedence order so a multi-tier match always resolves to the highest tier.
 */

import type { Severity } from "./types";

/**
 * Exact lookup keyed by the built-in Azure policy definition names (GUIDs) that
 * fire against the demo resources. Keys are matched case-insensitively against
 * the trimmed policy name. (Requirement 6.1)
 */
const POLICY_NAME_SEVERITY: ReadonlyMap<string, Severity> = new Map([
  // --- high: open network access to 0.0.0.0/0 (Requirement 6.2) ---
  // Management ports should be closed on your virtual machines
  ["22730e10-96f6-4aac-ad84-9383d35b5917", "high"],
  // RDP access from the Internet should be blocked
  ["e372f825-a257-4fb8-9175-797a8a8627d6", "high"],

  // --- high: missing encryption / secure transfer (Requirement 6.2) ---
  // Secure transfer to storage accounts should be enabled
  ["404c3081-a854-4457-ae30-26a93ef643f9", "high"],

  // --- high: missing Key Vault purge protection (Requirement 6.2) ---
  // Key vaults should have purge protection enabled
  ["0b60c0b2-2dc2-4e1c-b5c9-abbed971de53", "high"],

  // --- medium: disabled soft delete (Requirement 6.3) ---
  // Storage accounts should have blob soft delete enabled
  ["b7ddfbdc-1260-477d-91fd-98bd9be789a6", "medium"],

  // --- medium: missing diagnostic settings (Requirement 6.3) ---
  // Audit diagnostic setting for selected resource types
  ["7f89b1eb-583c-429a-8828-af049802c1d9", "medium"],

  // --- medium: missing tags (Requirement 6.3) ---
  // Require a tag on resources
  ["871b6d14-10aa-478d-b590-94f262ecfa99", "medium"],
]);

/**
 * Keyword patterns per severity tier, evaluated in precedence order
 * `high > medium > low` (Requirement 6.7). Each pattern is matched against the
 * lower-cased policy name, providing a robust fallback when the name arrives as
 * a display name rather than a known GUID.
 */
const HIGH_KEYWORDS: readonly string[] = [
  "0.0.0.0",
  "rdp",
  "management port",
  "internet",
  "secure transfer",
  "encryption",
  "encrypt",
  "purge protection",
];

const MEDIUM_KEYWORDS: readonly string[] = [
  "diagnostic setting",
  "soft delete",
  "tag",
  "audit", // SQL/database auditing is a logging/diagnostic control
];

const LOW_KEYWORDS: readonly string[] = [
  "naming",
  "informational",
];

/**
 * Returns true when any keyword appears as a substring of the normalized name.
 */
function matchesAny(name: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => name.includes(keyword));
}

/**
 * Assigns a {@link Severity} to a Finding's policy name.
 *
 * Pure and deterministic: the same input always returns the same output
 * (Requirement 6.6). Resolution order:
 *   1. Exact match against the known built-in policy definition GUIDs.
 *   2. Keyword match in precedence order high > medium > low (Requirement 6.7).
 *   3. Default to `low` for any unrecognized name (Requirement 6.5).
 *
 * @param policyName The policy definition name (GUID or display name) of a Finding.
 * @returns Exactly one of `high`, `medium`, or `low`.
 */
export function severityFor(policyName: string): Severity {
  const normalized = policyName.trim().toLowerCase();

  // 1. Exact GUID/name table lookup.
  const exact = POLICY_NAME_SEVERITY.get(normalized);
  if (exact !== undefined) {
    return exact;
  }

  // 2. Keyword fallback in precedence order high > medium > low.
  if (matchesAny(normalized, HIGH_KEYWORDS)) {
    return "high";
  }
  if (matchesAny(normalized, MEDIUM_KEYWORDS)) {
    return "medium";
  }
  if (matchesAny(normalized, LOW_KEYWORDS)) {
    return "low";
  }

  // 3. Default for unknown policy names.
  return "low";
}
