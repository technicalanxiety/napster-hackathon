/**
 * Property-based tests for the Policy Function authorization gate.
 *
 * Feature: azure-governance-advisor, Property 4: Authorization gate precedes the
 * query
 *
 * For any supplied function-level key that does not match the configured key
 * (including an absent key), the function returns HTTP 401 indicating
 * authorization failure and never executes the Resource Graph query.
 *
 * Validates: Requirements 3.2, 3.3
 */

import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import type { HttpRequest, InvocationContext } from "@azure/functions";

import {
  handlePolicyCheck,
  type CredentialLike,
  type PolicyCheckDependencies,
} from "./policy-check";
import type { QueryExecutor } from "../lib/resource-graph";
import type { ErrorResponse } from "../lib/types";

/** The configured function key the handler enforces in these tests. */
const CONFIGURED_KEY = "the-configured-function-key";

/** A no-op invocation context with the methods the handler touches. */
function makeContext(): InvocationContext {
  return {
    error: () => {},
    warn: () => {},
    info: () => {},
    log: () => {},
    debug: () => {},
    trace: () => {},
  } as unknown as InvocationContext;
}

/**
 * Builds a minimal v4-model {@link HttpRequest} exposing only what the handler
 * reads: `query.get('code')`, `headers.get(name)`, and `text()`. The supplied
 * function key is placed in either the `code` query parameter or the
 * `x-functions-key` header, per `viaHeader`.
 */
function makeRequest(
  suppliedKey: string | undefined,
  viaHeader: boolean,
  body: string,
): HttpRequest {
  const queryValue = !viaHeader ? suppliedKey : undefined;
  const headerValue = viaHeader ? suppliedKey : undefined;

  return {
    query: {
      get: (name: string) =>
        name === "code" ? (queryValue ?? null) : null,
    },
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "x-functions-key" ? (headerValue ?? null) : null,
    },
    text: async () => body,
  } as unknown as HttpRequest;
}

/**
 * Builds dependencies whose configured key is fixed and whose `createExecutor`
 * returns a spy {@link QueryExecutor}. The credential is a stub that succeeds,
 * so any path reaching the query would invoke the spy — letting us assert the
 * authorization gate short-circuits before the query.
 */
function makeDeps(): {
  deps: PolicyCheckDependencies;
  executorSpy: ReturnType<typeof vi.fn>;
  createExecutorSpy: ReturnType<typeof vi.fn>;
} {
  const executorSpy = vi.fn<Parameters<QueryExecutor>, ReturnType<QueryExecutor>>(
    async () => [],
  );
  const createExecutorSpy = vi.fn(() => executorSpy as unknown as QueryExecutor);

  const credential: CredentialLike = {
    getToken: async () => ({ token: "stub-token" }),
  };

  const deps: PolicyCheckDependencies = {
    getSubscriptionId: () => "sub-123",
    getExpectedFunctionKey: () => CONFIGURED_KEY,
    createCredential: () => credential,
    createExecutor: createExecutorSpy as unknown as PolicyCheckDependencies["createExecutor"],
  };

  return { deps, executorSpy, createExecutorSpy };
}

/**
 * Arbitrary supplied key that never equals the configured key: either absent
 * (`undefined`) or any string distinct from {@link CONFIGURED_KEY}.
 */
const nonMatchingKeyArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.string().filter((s) => s !== CONFIGURED_KEY),
);

describe("handlePolicyCheck — Property 4 (authorization gate precedes the query)", () => {
  it("returns 401 authorization failure and never runs the query for any non-matching key", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonMatchingKeyArb,
        fc.boolean(),
        fc.string(),
        async (suppliedKey, viaHeader, body) => {
          const { deps, executorSpy, createExecutorSpy } = makeDeps();
          const request = makeRequest(suppliedKey, viaHeader, body);

          const response = await handlePolicyCheck(request, makeContext(), deps);

          // 401 with an error indicating authorization failure.
          expect(response.status).toBe(401);
          const errorBody = response.jsonBody as ErrorResponse;
          expect(errorBody.error).toMatch(/authoriz/i);

          // The Resource Graph query was never executed: neither the executor
          // factory nor the executor itself was invoked.
          expect(createExecutorSpy).not.toHaveBeenCalled();
          expect(executorSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 200 },
    );
  });
});
