/**
 * Unit tests for the Policy Function HTTP orchestration error paths
 * (`handlePolicyCheck`).
 *
 * These example-based tests complement the authorization-gate property test
 * (Property 4) by pinning the concrete error-path outcomes required by the
 * design's status-code contract and error-handling table:
 *
 *  - a `DefaultAzureCredential` token-acquisition failure returns HTTP 500
 *    ("authentication failure") and the Resource Graph query is never executed
 *    (Requirement 3.7),
 *  - a Resource Graph query failure returns HTTP 500 ("query failure") with no
 *    partial findings in the body (Requirement 5.5),
 *  - a query that returns no rows yields HTTP 200 with a summary total of zero
 *    and an empty findings array (Requirement 7.5).
 *
 * The credential and query executor are injected via `PolicyCheckDependencies`
 * so every path runs in-memory without making real Azure calls. A spy on
 * `createExecutor` verifies the query is never reached when credential
 * acquisition fails.
 */

import { describe, it, expect, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";

import {
  handlePolicyCheck,
  type CredentialLike,
  type PolicyCheckDependencies,
} from "./policy-check";
import {
  ResourceGraphQueryError,
  type QueryExecutor,
} from "../lib/resource-graph";
import type { PolicyCheckResponse } from "../lib/types";

const SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Build a minimal v4 `HttpRequest` exposing only the members the handler reads:
 * `query.get`, `headers.get`, and `text()`. No function key is configured in
 * these tests (auth is deferred to the runtime), so the body alone matters.
 */
function makeRequest(body = "{}"): HttpRequest {
  return {
    query: { get: () => null },
    headers: { get: () => null },
    text: async () => body,
  } as unknown as HttpRequest;
}

/** Build a minimal `InvocationContext` whose `error` method is a spy. */
function makeContext(): InvocationContext {
  return { error: vi.fn() } as unknown as InvocationContext;
}

/** A credential whose `getToken` always succeeds with a stub token. */
const succeedingCredential: CredentialLike = {
  getToken: async () => ({ token: "stub-token" }),
};

describe("handlePolicyCheck — credential failure (Req 3.7)", () => {
  it("returns 500 authentication failure and never executes the query when getToken throws", async () => {
    const createExecutor = vi.fn<PolicyCheckDependencies["createExecutor"]>();

    const deps: PolicyCheckDependencies = {
      getSubscriptionId: () => SUBSCRIPTION_ID,
      getExpectedFunctionKey: () => undefined,
      createCredential: () => ({
        getToken: async () => {
          throw new Error("credential chain exhausted");
        },
      }),
      createExecutor,
    };

    const response = await handlePolicyCheck(
      makeRequest(),
      makeContext(),
      deps,
    );

    expect(response.status).toBe(500);
    expect(response.jsonBody).toEqual({ error: "authentication failure" });
    // The query is never reached when credential acquisition fails.
    expect(createExecutor).not.toHaveBeenCalled();
  });

  it("returns 500 authentication failure and never executes the query when getToken returns null", async () => {
    const createExecutor = vi.fn<PolicyCheckDependencies["createExecutor"]>();

    const deps: PolicyCheckDependencies = {
      getSubscriptionId: () => SUBSCRIPTION_ID,
      getExpectedFunctionKey: () => undefined,
      createCredential: () => ({ getToken: async () => null }),
      createExecutor,
    };

    const response = await handlePolicyCheck(
      makeRequest(),
      makeContext(),
      deps,
    );

    expect(response.status).toBe(500);
    expect(response.jsonBody).toEqual({ error: "authentication failure" });
    expect(createExecutor).not.toHaveBeenCalled();
  });
});

describe("handlePolicyCheck — query failure (Req 5.5)", () => {
  it("returns 500 query failure with no partial findings when the executor rejects", async () => {
    const failingExecutor: QueryExecutor = async () => {
      throw new Error("Resource Graph unavailable");
    };

    const deps: PolicyCheckDependencies = {
      getSubscriptionId: () => SUBSCRIPTION_ID,
      getExpectedFunctionKey: () => undefined,
      createCredential: () => succeedingCredential,
      createExecutor: () => failingExecutor,
    };

    const response = await handlePolicyCheck(
      makeRequest(),
      makeContext(),
      deps,
    );

    expect(response.status).toBe(500);
    expect(response.jsonBody).toEqual({ error: "query failure" });
    // No partial findings: the error body carries no findings array.
    expect(response.jsonBody).not.toHaveProperty("findings");
  });

  it("returns 500 query failure when the executor throws a ResourceGraphQueryError directly", async () => {
    const failingExecutor: QueryExecutor = async () => {
      throw new ResourceGraphQueryError("query timed out");
    };

    const deps: PolicyCheckDependencies = {
      getSubscriptionId: () => SUBSCRIPTION_ID,
      getExpectedFunctionKey: () => undefined,
      createCredential: () => succeedingCredential,
      createExecutor: () => failingExecutor,
    };

    const response = await handlePolicyCheck(
      makeRequest(),
      makeContext(),
      deps,
    );

    expect(response.status).toBe(500);
    expect(response.jsonBody).toEqual({ error: "query failure" });
    expect(response.jsonBody).not.toHaveProperty("findings");
  });
});

describe("handlePolicyCheck — empty result (Req 7.5)", () => {
  it("returns 200 with total zero and an empty findings array when the query yields no rows", async () => {
    const emptyExecutor: QueryExecutor = async () => [];

    const deps: PolicyCheckDependencies = {
      getSubscriptionId: () => SUBSCRIPTION_ID,
      getExpectedFunctionKey: () => undefined,
      createCredential: () => succeedingCredential,
      createExecutor: () => emptyExecutor,
    };

    const response = await handlePolicyCheck(
      makeRequest(),
      makeContext(),
      deps,
    );

    expect(response.status).toBe(200);
    const body = response.jsonBody as PolicyCheckResponse;
    expect(body.summary.totalNonCompliant).toBe(0);
    expect(body.findings).toEqual([]);
  });
});
