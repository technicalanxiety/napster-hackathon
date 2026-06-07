/**
 * HTTP trigger for the Policy Function (`POST /api/policy-check`).
 *
 * This module wires together the Policy Function's pure modules into a single
 * orchestration whose gate ordering and HTTP status mapping satisfy the design
 * contract:
 *
 *   function-key auth → JSON parse → field validation
 *     → DefaultAzureCredential acquisition → Resource Graph query
 *
 * Each gate, on failure, returns its mapped HTTP status *before* the Resource
 * Graph query executes, guaranteeing no failed precondition ever reaches Azure
 * (Requirements 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 5.1, 6.1):
 *
 *   | Condition                                   | Status |
 *   |---------------------------------------------|--------|
 *   | Success                                     | 200    |
 *   | Missing/invalid function key                | 401    |
 *   | Body present but not valid JSON             | 400    |
 *   | Invalid `category`/`severity` value         | 400    |
 *   | DefaultAzureCredential token failure        | 500    |
 *   | Resource Graph query failure/timeout        | 500    |
 *
 * The credential and Resource Graph executor are injected through
 * {@link PolicyCheckDependencies} so the orchestration error paths and the
 * authorization gate can be exercised in tests without making real Azure calls.
 */

import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { ResourceGraphClient } from "@azure/arm-resourcegraph";

import { parseAndValidate } from "../lib/input";
import {
  createClientExecutor,
  queryNonCompliantFindings,
  ResourceGraphQueryError,
  type QueryExecutor,
  type QueryOptions,
  type ResourceGraphClientLike,
} from "../lib/resource-graph";
import { applyFilters } from "../lib/filter";
import { buildResponse } from "../lib/response";
import type { ErrorResponse } from "../lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ARM token scope used to verify DefaultAzureCredential can acquire a token. */
export const ARM_SCOPE = "https://management.azure.com/.default";

/** The route segment registered under the runtime's `api` route prefix. */
const ROUTE = "policy-check";

// ---------------------------------------------------------------------------
// Injectable dependencies
// ---------------------------------------------------------------------------

/**
 * Minimal structural shape of an Azure credential, satisfied by
 * `DefaultAzureCredential`. Acquiring a token verifies the credential chain
 * before the Resource Graph query runs (Requirement 3.7). Injected so tests can
 * supply a failing or stub credential.
 */
export interface CredentialLike {
  getToken(
    scopes: string | string[],
    options?: unknown,
  ): Promise<{ token: string } | null>;
}

/**
 * Dependencies for {@link handlePolicyCheck}. Defaults are provided by
 * {@link defaultDependencies}; tests override individual members to exercise the
 * authorization gate and the credential/query error paths in-memory.
 */
export interface PolicyCheckDependencies {
  /** Resolves the target subscription identifier. */
  getSubscriptionId(): string;
  /**
   * Resolves the configured function key the handler enforces, or `undefined`
   * to defer entirely to the Functions runtime's `authLevel: 'function'` gate.
   * Tests return a concrete key to exercise the 401 authorization gate.
   */
  getExpectedFunctionKey(): string | undefined;
  /** Constructs the Azure credential used to authenticate to Azure. */
  createCredential(): CredentialLike;
  /**
   * Builds the {@link QueryExecutor} used to run the Resource Graph query,
   * given the acquired credential and target subscription.
   */
  createExecutor(
    credential: CredentialLike,
    subscriptionId: string,
  ): QueryExecutor;
  /** Optional Resource Graph query options (e.g. a shorter test timeout). */
  queryOptions?: QueryOptions;
  /** Overrides the ARM token scope used during credential acquisition. */
  tokenScope?: string;
}

/**
 * Production dependencies: read the subscription from the environment, defer
 * function-key auth to the Functions runtime, and back the query with a real
 * `DefaultAzureCredential` + `ResourceGraphClient`.
 */
export function defaultDependencies(): PolicyCheckDependencies {
  return {
    getSubscriptionId: () => process.env.AZURE_SUBSCRIPTION_ID ?? "",
    getExpectedFunctionKey: () => undefined,
    createCredential: () => new DefaultAzureCredential(),
    createExecutor: (credential) =>
      createClientExecutor(
        new ResourceGraphClient(
          credential as unknown as ConstructorParameters<
            typeof ResourceGraphClient
          >[0],
        ) as unknown as ResourceGraphClientLike,
      ),
    tokenScope: ARM_SCOPE,
  };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** Build a JSON HTTP response with the given status and body. */
function jsonResponse(status: number, body: unknown): HttpResponseInit {
  return { status, jsonBody: body };
}

/** Build a 4xx/5xx error response body, optionally listing accepted values. */
function errorBody(message: string, acceptedValues?: string[]): ErrorResponse {
  return acceptedValues === undefined
    ? { error: message }
    : { error: message, acceptedValues };
}

/**
 * Extract the supplied function key from a request: the `code` query parameter
 * (how the Napster platform passes it) or the `x-functions-key` header. Returns
 * `undefined` when neither is present.
 */
function extractFunctionKey(request: HttpRequest): string | undefined {
  return (
    request.query.get("code") ??
    request.headers.get("x-functions-key") ??
    undefined
  );
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Orchestrate a single policy-check request through the ordered gates and map
 * each outcome to its HTTP status. Exported (separately from registration) so
 * tests can drive it directly with mocked dependencies.
 */
export async function handlePolicyCheck(
  request: HttpRequest,
  context: InvocationContext,
  deps: PolicyCheckDependencies,
): Promise<HttpResponseInit> {
  // Gate 1: function-key authorization. When a configured key is supplied, an
  // absent or mismatched key is rejected with 401 before anything else runs
  // (Requirements 3.2, 3.3). When no key is configured, the runtime's
  // `authLevel: 'function'` gate has already enforced authorization.
  const expectedKey = deps.getExpectedFunctionKey();
  if (expectedKey !== undefined) {
    if (extractFunctionKey(request) !== expectedKey) {
      return jsonResponse(401, errorBody("authorization failed"));
    }
  }

  // Gate 2 & 3: JSON parse + field validation (Requirements 4.6, 4.7, 4.8).
  const rawBody = await request.text();
  const validation = parseAndValidate(rawBody);
  if (!validation.ok) {
    const { error } = validation;
    return jsonResponse(
      400,
      error.kind === "field"
        ? errorBody(error.message, error.acceptedValues)
        : errorBody(error.message),
    );
  }
  const { category, severity } = validation.value;

  // Gate 4: credential acquisition. A failure to acquire an Azure token maps to
  // a 500 authentication failure and the query never runs (Requirement 3.7).
  let credential: CredentialLike;
  try {
    credential = deps.createCredential();
    const token = await credential.getToken(deps.tokenScope ?? ARM_SCOPE);
    if (token === null) {
      throw new Error("DefaultAzureCredential returned no token");
    }
  } catch (err) {
    context.error("Credential acquisition failed", err);
    return jsonResponse(500, errorBody("authentication failure"));
  }

  // Gate 5: Resource Graph query. A failure or timeout maps to a 500 query
  // failure with no partial findings returned (Requirement 5.5).
  const subscriptionId = deps.getSubscriptionId();
  let findings;
  try {
    const executor = deps.createExecutor(credential, subscriptionId);
    findings = await queryNonCompliantFindings(
      subscriptionId,
      executor,
      deps.queryOptions,
    );
  } catch (err) {
    if (err instanceof ResourceGraphQueryError) {
      context.error("Resource Graph query failed", err);
      return jsonResponse(500, errorBody("query failure"));
    }
    throw err;
  }

  // Success: filter, summarize, and return the structured response (200).
  const filtered = applyFilters(findings, category, severity);
  return jsonResponse(200, buildResponse(subscriptionId, filtered));
}

// ---------------------------------------------------------------------------
// Registration (Azure Functions v4 programming model)
// ---------------------------------------------------------------------------

/** The registered handler, bound to the production dependencies. */
export const policyCheckHandler: HttpHandler = (request, context) =>
  handlePolicyCheck(request, context, defaultDependencies());

app.http("policy-check", {
  methods: ["POST"],
  authLevel: "function",
  route: ROUTE,
  handler: policyCheckHandler,
});
