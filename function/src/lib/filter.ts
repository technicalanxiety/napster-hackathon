/**
 * Category/severity filtering for Policy Function findings.
 *
 * The filter restricts a set of findings along two independent dimensions —
 * `category` and `severity`. The sentinel value `all` on a dimension imposes no
 * restriction on that dimension; any other value restricts the result to
 * findings whose corresponding field equals it. When both dimensions hold a
 * value other than `all`, the restrictions combine as a conjunction (AND).
 * (Requirements 4.9, 4.10, 4.11)
 */

import type { Category, Finding, SeverityFilter } from "./types";

/**
 * Restrict `findings` to those matching the requested `category` and `severity`
 * filters.
 *
 * - `category` other than `all` → keep only findings whose category equals it
 *   (Requirement 4.9).
 * - `severity` other than `all` → keep only findings whose severity equals it
 *   (Requirement 4.10).
 * - Both other than `all` → keep only findings matching both (Requirement 4.11).
 * - `all` on a dimension → no restriction on that dimension.
 *
 * @param findings The findings to filter.
 * @param category The requested category filter (canonical lowercase or `all`).
 * @param severity The requested severity filter (canonical lowercase or `all`).
 * @returns A new array containing only the findings that match every non-`all`
 *   dimension. Relative order is preserved.
 */
export function applyFilters(
  findings: Finding[],
  category: Category,
  severity: SeverityFilter,
): Finding[] {
  return findings.filter(
    (finding) =>
      (category === "all" || finding.category === category) &&
      (severity === "all" || finding.severity === severity),
  );
}
