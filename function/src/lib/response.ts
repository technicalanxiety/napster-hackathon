/**
 * Response Module — builds the structured Policy Function response envelope.
 *
 * `buildResponse` shapes a set of (already filtered) findings into the
 * `PolicyCheckResponse` returned to the Napster platform. It derives the
 * per-category breakdown (with an explicit zero for categories that have no
 * findings), sets `summary.totalNonCompliant` to the number of findings, and
 * stamps an ISO-8601 UTC timestamp with the `Z` zone designator.
 *
 * The construction guarantees the counting invariants asserted by Correctness
 * Property 8: each category count equals the number of findings in that
 * category, the per-category counts sum to `totalNonCompliant`, and
 * `totalNonCompliant` equals `findings.length`.
 *
 * (Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8)
 */

import {
  CategoryBreakdown,
  Finding,
  PolicyCheckResponse,
  Summary,
} from "./types";

/**
 * Build a zeroed per-category breakdown with one entry for each of the five
 * governance categories. Starting from zero guarantees that a category with no
 * findings is reported as zero rather than omitted. (Requirements 7.2, 7.7)
 */
function emptyBreakdown(): CategoryBreakdown {
  return {
    networking: 0,
    storage: 0,
    identity: 0,
    compute: 0,
    logging: 0,
  };
}

/**
 * Derive the per-category breakdown by counting findings per category. Because
 * every Finding carries a `category` constrained to the five governance
 * domains, the counts necessarily sum to `findings.length`. (Requirements 7.2,
 * 7.7, 7.8)
 */
function breakdownFor(findings: Finding[]): CategoryBreakdown {
  const breakdown = emptyBreakdown();
  for (const finding of findings) {
    breakdown[finding.category] += 1;
  }
  return breakdown;
}

/**
 * Construct the structured compliance response envelope.
 *
 * @param subscriptionId - The target subscription identifier echoed back to the caller.
 * @param findings - The findings to summarize (already filtered upstream). May be empty.
 * @returns A `PolicyCheckResponse` whose summary counts are consistent with `findings`.
 */
export function buildResponse(
  subscriptionId: string,
  findings: Finding[],
): PolicyCheckResponse {
  const byCategory = breakdownFor(findings);

  const summary: Summary = {
    totalNonCompliant: findings.length,
    byCategory,
  };

  return {
    subscriptionId,
    // ISO-8601 in UTC; toISOString always emits the trailing `Z`. (Requirement 7.6)
    assessmentTimestamp: new Date().toISOString(),
    summary,
    findings,
  };
}
