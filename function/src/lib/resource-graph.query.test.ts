/**
 * Unit tests for the Resource Graph query path (`queryNonCompliantFindings`).
 *
 * These example-based tests complement the property test in
 * `resource-graph.property.test.ts` (Property 6). They pin the concrete query
 * behaviour required by the design's testing strategy:
 *
 *  - the executed query text always contains the `NonCompliant` filter
 *    (Requirement 5.2),
 *  - the happy path invokes the executor exactly once and returns the extracted
 *    findings (Requirement 5.1),
 *  - an executor rejection surfaces as a `ResourceGraphQueryError` and returns
 *    no partial findings (Requirement 5.5),
 *  - a query that exceeds its timeout surfaces as a `ResourceGraphQueryError`
 *    and returns no partial findings (Requirements 5.1, 5.5).
 */

import { describe, it, expect, vi } from "vitest";
import {
  queryNonCompliantFindings,
  RESOURCE_GRAPH_QUERY,
  ResourceGraphQueryError,
  type QueryExecutor,
  type ResourceGraphRow,
} from "./resource-graph";

const SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000000000";

describe("RESOURCE_GRAPH_QUERY constant (Req 5.2)", () => {
  it("includes the NonCompliant compliance-state filter", () => {
    expect(RESOURCE_GRAPH_QUERY).toContain("NonCompliant");
    expect(RESOURCE_GRAPH_QUERY).toContain(
      'properties.complianceState == "NonCompliant"',
    );
  });
});

describe("queryNonCompliantFindings — happy path (Req 5.1, 5.2)", () => {
  it("executes the NonCompliant query exactly once and returns findings", async () => {
    const rows: ResourceGraphRow[] = [
      {
        resourceId: "/subscriptions/x/resourceGroups/rg-governance-demo/r1",
        resourceType: "microsoft.storage/storageaccounts",
        policyName: "Secure transfer to storage accounts should be enabled",
        policyDisplayName: "Secure transfer",
        category: "storage",
        resourceGroup: "rg-governance-demo",
      },
      {
        resourceId: "/subscriptions/x/resourceGroups/rg-governance-demo/r2",
        resourceType: "microsoft.network/networksecuritygroups",
        policyName: "Inbound access from 0.0.0.0/0 should be restricted",
        policyDisplayName: "Restrict inbound",
        category: "networking",
        resourceGroup: "rg-governance-demo",
      },
    ];

    const executor = vi.fn<QueryExecutor>().mockResolvedValue(rows);

    const findings = await queryNonCompliantFindings(SUBSCRIPTION_ID, executor);

    // Query executes exactly once on the happy path.
    expect(executor).toHaveBeenCalledTimes(1);

    // The executed query text carries the NonCompliant filter and targets the
    // requested subscription.
    const [queryArg, subscriptionArg] = executor.mock.calls[0];
    expect(queryArg).toBe(RESOURCE_GRAPH_QUERY);
    expect(queryArg).toContain("NonCompliant");
    expect(subscriptionArg).toBe(SUBSCRIPTION_ID);

    // Each row is returned as an extracted finding.
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      resourceId: rows[0].resourceId,
      policyName: rows[0].policyName,
      category: "storage",
      severity: "high",
    });
    expect(findings[1]).toMatchObject({
      policyName: rows[1].policyName,
      category: "networking",
      severity: "high",
    });
  });

  it("returns an empty findings array when the query yields no rows", async () => {
    const executor = vi.fn<QueryExecutor>().mockResolvedValue([]);

    const findings = await queryNonCompliantFindings(SUBSCRIPTION_ID, executor);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(findings).toEqual([]);
  });
});

describe("queryNonCompliantFindings — failure path (Req 5.5)", () => {
  it("throws ResourceGraphQueryError and returns no partial findings when the executor rejects", async () => {
    const executor = vi
      .fn<QueryExecutor>()
      .mockRejectedValue(new Error("Resource Graph unavailable"));

    const promise = queryNonCompliantFindings(SUBSCRIPTION_ID, executor);

    await expect(promise).rejects.toBeInstanceOf(ResourceGraphQueryError);
    // No partial findings: the rejection propagates as an error, never a value.
    await expect(promise).rejects.toThrow(/Resource Graph query failed/);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("throws ResourceGraphQueryError when the query exceeds its timeout", async () => {
    // A slow executor that never resolves within the timeout window.
    const executor = vi.fn<QueryExecutor>().mockImplementation(
      () =>
        new Promise<ResourceGraphRow[]>((resolve) => {
          setTimeout(() => resolve([]), 1_000);
        }),
    );

    const promise = queryNonCompliantFindings(SUBSCRIPTION_ID, executor, {
      timeoutMs: 10,
    });

    await expect(promise).rejects.toBeInstanceOf(ResourceGraphQueryError);
    await expect(promise).rejects.toThrow(/timed out/);
  });
});
