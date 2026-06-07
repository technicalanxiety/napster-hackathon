/**
 * Resource Graph module for the Policy Function.
 *
 * Builds the Kusto query that retrieves non-compliant policy state from Azure
 * Resource Graph (always filtering `complianceState == "NonCompliant"`),
 * executes it via `@azure/arm-resourcegraph`, and extracts each returned row
 * into a {@link Finding}.
 *
 * Extraction is total: every row is retained as a Finding (no row is dropped),
 * and any optional source field (`policyDisplayName`, `category`,
 * `resourceGroup`) that is absent is populated with an empty string rather than
 * discarding the row (Requirement 5.4). The query is bounded by a 30-second
 * timeout; a query failure or timeout surfaces as a {@link ResourceGraphQueryError}
 * with no partial results returned (Requirement 5.5).
 *
 * The query executor is injected so tests can mock the Resource Graph client
 * without making real Azure calls.
 */

import type { Finding, FindingCategory } from "./types";
import { severityFor } from "./severity-map";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The Kusto query executed against Azure Resource Graph. It always restricts
 * results to resources whose compliance state equals `NonCompliant`
 * (Requirement 5.2) and projects the fields needed to build a Finding
 * (Requirement 5.3).
 */
export const RESOURCE_GRAPH_QUERY = `policyresources
| where type == "microsoft.policyinsights/policystates"
| where properties.complianceState == "NonCompliant"
| extend resourceId = properties.resourceId,
         resourceType = properties.resourceType,
         policyName = properties.policyDefinitionName,
         policyDisplayName = properties.policyDefinitionDisplayName,
         category = properties.policyDefinitionCategory,
         resourceGroup = properties.resourceGroup
| project resourceId, resourceType, policyName, policyDisplayName, category, resourceGroup`;

/** Maximum time allowed for the Resource Graph query before it fails (Requirement 5.1, 5.5). */
export const QUERY_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single raw row returned by Azure Resource Graph, keyed by projected column name. */
export type ResourceGraphRow = Record<string, unknown>;

/**
 * Executes a Kusto query against a subscription and returns the raw rows.
 * Injected so the underlying Resource Graph client can be mocked in tests.
 */
export type QueryExecutor = (
  query: string,
  subscriptionId: string,
) => Promise<ResourceGraphRow[]>;

/**
 * Minimal structural shape of `@azure/arm-resourcegraph`'s `ResourceGraphClient`
 * used by {@link createClientExecutor}. The real client satisfies this shape.
 */
export interface ResourceGraphClientLike {
  resources(query: {
    subscriptions?: string[];
    query: string;
    options?: { resultFormat?: string };
  }): Promise<{ data: unknown }>;
}

/** Options controlling a {@link queryNonCompliantFindings} invocation. */
export interface QueryOptions {
  /** Overrides the default {@link QUERY_TIMEOUT_MS} timeout (primarily for tests). */
  timeoutMs?: number;
}

/**
 * Raised when the Resource Graph query fails or exceeds its timeout. The caller
 * maps this to an HTTP 500 with no partial findings (Requirement 5.5).
 */
export class ResourceGraphQueryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ResourceGraphQueryError";
    if (options?.cause !== undefined) {
      // Preserve the original cause where the runtime supports it.
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Coerces an arbitrary Resource Graph cell value to a string, mapping
 * `null`/`undefined` (an absent value) to an empty string. (Requirement 5.4)
 */
function toStringOrEmpty(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

/**
 * Extracts a single {@link Finding} from a raw Resource Graph row. Every row
 * yields a Finding; absent optional fields become empty strings, and the
 * severity is assigned from the policy name via the Severity_Mapper.
 * (Requirements 5.3, 5.4)
 */
export function extractFinding(row: ResourceGraphRow): Finding {
  const policyName = toStringOrEmpty(row.policyName);
  return {
    resourceId: toStringOrEmpty(row.resourceId),
    resourceType: toStringOrEmpty(row.resourceType),
    policyName,
    policyDisplayName: toStringOrEmpty(row.policyDisplayName),
    // The source category is retained verbatim (empty string when absent);
    // it is classified into a canonical category during response shaping.
    category: toStringOrEmpty(row.category) as FindingCategory,
    resourceGroup: toStringOrEmpty(row.resourceGroup),
    severity: severityFor(policyName),
  };
}

// ---------------------------------------------------------------------------
// Query execution
// ---------------------------------------------------------------------------

/**
 * Races a promise against a timeout, rejecting with a {@link ResourceGraphQueryError}
 * if the timeout elapses first. Ensures the timer is always cleared.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new ResourceGraphQueryError(
          `Resource Graph query timed out after ${ms}ms`,
        ),
      );
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Executes the non-compliant Resource Graph query for the given subscription
 * and extracts every returned row into a {@link Finding}.
 *
 * Enforces the {@link QUERY_TIMEOUT_MS} timeout. If the query fails or times
 * out, a {@link ResourceGraphQueryError} is thrown and no partial findings are
 * returned (Requirement 5.5).
 */
export async function queryNonCompliantFindings(
  subscriptionId: string,
  executor: QueryExecutor,
  options: QueryOptions = {},
): Promise<Finding[]> {
  const timeoutMs = options.timeoutMs ?? QUERY_TIMEOUT_MS;

  let rows: ResourceGraphRow[];
  try {
    rows = await withTimeout(
      executor(RESOURCE_GRAPH_QUERY, subscriptionId),
      timeoutMs,
    );
  } catch (err) {
    if (err instanceof ResourceGraphQueryError) {
      throw err;
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new ResourceGraphQueryError(
      `Resource Graph query failed: ${reason}`,
      { cause: err },
    );
  }

  return rows.map(extractFinding);
}

// ---------------------------------------------------------------------------
// Client adapter (dependency injection)
// ---------------------------------------------------------------------------

/**
 * Builds a {@link QueryExecutor} backed by a real `@azure/arm-resourcegraph`
 * `ResourceGraphClient`. Requests the `objectArray` result format so each row
 * arrives as a plain object keyed by the projected column names.
 */
export function createClientExecutor(
  client: ResourceGraphClientLike,
): QueryExecutor {
  return async (query, subscriptionId) => {
    const response = await client.resources({
      subscriptions: [subscriptionId],
      query,
      options: { resultFormat: "objectArray" },
    });
    return normalizeRows(response.data);
  };
}

/**
 * Normalizes a Resource Graph `data` payload into an array of rows. Handles the
 * `objectArray` format (a plain array) and defensively handles the `table`
 * format (`{ columns, rows }`); anything else yields no rows.
 */
function normalizeRows(data: unknown): ResourceGraphRow[] {
  if (Array.isArray(data)) {
    return data as ResourceGraphRow[];
  }

  if (
    data !== null &&
    typeof data === "object" &&
    Array.isArray((data as { columns?: unknown }).columns) &&
    Array.isArray((data as { rows?: unknown }).rows)
  ) {
    const columns = (data as { columns: Array<{ name: string }> }).columns;
    const rows = (data as { rows: unknown[][] }).rows;
    return rows.map((row) => {
      const obj: ResourceGraphRow = {};
      columns.forEach((column, index) => {
        obj[column.name] = row[index];
      });
      return obj;
    });
  }

  return [];
}
