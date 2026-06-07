# Implementation Plan: Azure Governance Baseline Advisor

## Overview

This plan implements the five components of the Azure Governance Baseline Advisor in TypeScript (Azure Functions v4 / Node.js 20 for the backend, React + Vite for the frontend) and Bicep for infrastructure. Work begins with the Policy Function — the testable functional core whose pure logic carries Correctness Properties 1–8 — building it module by module from input handling through response shaping and HTTP orchestration. It then layers in the demo Bicep environment with least-privilege RBAC, the governance knowledge/FAQ content, the Napster agent assembly script, and finally the React frontend (whose session state machine carries Property 9). Each step builds on the previous and ends with wiring the pieces together so no code is left orphaned.

Property-based tests use `fast-check` with `vitest` and are tagged `Feature: azure-governance-advisor, Property {number}: {property_text}`. Test sub-tasks are marked optional with `*`.

## Tasks

- [x] 1. Set up monorepo structure and shared tooling
  - Create top-level `function/`, `frontend/`, `infra/`, `knowledge/`, and `agent/` directories
  - Initialize the `function/` package with TypeScript, Azure Functions v4 (`@azure/functions`), `@azure/identity`, and `@azure/arm-resourcegraph` dependencies
  - Configure `vitest` and `fast-check` as the test runner and PBT library for `function/`, `frontend/`, and `agent/`
  - _Requirements: 3.5_

- [x] 2. Implement Policy Function data models and input handling
  - [x] 2.1 Define shared Policy Function types
    - Create `function/src/lib/types.ts` with `Category`, `SeverityFilter`, `NormalizedInput`, `FindingCategory`, `Severity`, `Finding`, `CategoryBreakdown`, `Summary`, `PolicyCheckResponse`, and `ErrorResponse`
    - Define the accepted `category` and `severity` value sets as canonical lowercase constants
    - _Requirements: 4.1, 4.4, 4.5, 5.3, 7.1, 7.3_

  - [x] 2.2 Implement input parse/validate/default module
    - Create `function/src/lib/input.ts` exporting `parseAndValidate(rawBody)` returning a `Result<NormalizedInput, ValidationError>`
    - Guard malformed non-empty JSON bodies (parse error), default absent/empty `category`/`severity` to `all`, lowercase and check set membership, and produce field-specific validation errors listing accepted values
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 2.3 Write property test for field defaulting
    - **Property 1: Field defaulting to "all"**
    - **Validates: Requirements 4.2, 4.3**

  - [x] 2.4 Write property test for case-insensitive acceptance and normalization
    - **Property 2: Case-insensitive acceptance and canonical normalization**
    - **Validates: Requirements 4.1, 4.4, 4.5**

  - [x] 2.5 Write property test for invalid-input rejection
    - **Property 3: Invalid field values are rejected before any query** (covers invalid `category`/`severity` and malformed JSON)
    - **Validates: Requirements 4.6, 4.7, 4.8**

- [x] 3. Implement severity mapping
  - [x] 3.1 Implement the Severity_Mapper lookup
    - Create `function/src/lib/severity-map.ts` exporting the pure `severityFor(policyName)` with a hardcoded lookup table
    - Apply `high > medium > low` precedence for multi-tier matches and default unknown policy names to `low`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

  - [x] 3.2 Write property test for severity assignment
    - **Property 7: Severity assignment is total, defaulted, and deterministic**
    - **Validates: Requirements 6.1, 6.5, 6.6**

  - [x] 3.3 Write unit tests for severity table and precedence
    - Assert known high/medium/low policy names map correctly and multi-tier names resolve by precedence
    - _Requirements: 6.2, 6.3, 6.4, 6.7_

- [x] 4. Implement Resource Graph query and finding extraction
  - [x] 4.1 Implement the Resource Graph module
    - Create `function/src/lib/resource-graph.ts` that builds the Kusto query (always filtering `complianceState == "NonCompliant"`), executes it via `@azure/arm-resourcegraph`, and extracts each row into a `Finding`
    - Retain every row, populate absent `policyDisplayName`/`category`/`resourceGroup` as empty strings, and enforce a 30s timeout that surfaces a query failure with no partial results
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 4.2 Write property test for finding extraction
    - **Property 6: Finding extraction is total with empty-string fill**
    - **Validates: Requirements 5.3, 5.4**

  - [x] 4.3 Write unit tests for the query path
    - Assert the query text includes the `NonCompliant` filter, the query executes once on the happy path, and the failure/timeout path yields a failure with no partial findings
    - _Requirements: 5.1, 5.2, 5.5_

- [x] 5. Implement category/severity filtering
  - [x] 5.1 Implement the filter module
    - Create `function/src/lib/filter.ts` exporting `applyFilters(findings, category, severity)` that restricts on each non-`all` dimension and treats `all` as no restriction (conjunction when both are set)
    - _Requirements: 4.9, 4.10, 4.11_

  - [x] 5.2 Write property test for filtering
    - **Property 5: Filtering restricts results to matching dimensions**
    - **Validates: Requirements 4.9, 4.10, 4.11**

- [x] 6. Implement response building
  - [x] 6.1 Implement the response module
    - Create `function/src/lib/response.ts` exporting `buildResponse(subscriptionId, findings)` that derives the per-category breakdown (zero where none), sets `totalNonCompliant` to `findings.length`, ensures per-category counts sum to the total, and stamps an ISO-8601 UTC `Z` timestamp
    - Handle the empty-findings case with total zero and an empty array
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 6.2 Write property test for response structure and counting
    - **Property 8: Response structure and counting invariants**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8**

- [x] 7. Implement HTTP trigger orchestration
  - [x] 7.1 Wire the policy-check HTTP handler
    - Create `function/src/functions/policy-check.ts` registering the `POST /api/policy-check` route with function-level auth
    - Enforce gate ordering (function-key auth → JSON parse → field validation → `DefaultAzureCredential` acquisition → Resource Graph query) and map each outcome to its HTTP status, composing `input`, `resource-graph`, `severity-map`, `filter`, and `response` modules
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 5.1, 6.1_

  - [x] 7.2 Write property test for the authorization gate
    - **Property 4: Authorization gate precedes the query**
    - **Validates: Requirements 3.2, 3.3**

  - [x] 7.3 Write unit tests for orchestration error paths
    - Assert credential failure returns 500 without querying, query failure returns 500 with no partial findings, and an empty result returns 200 with total zero
    - _Requirements: 3.7, 5.5, 7.5_

- [x] 8. Checkpoint - Ensure all Policy Function tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement the demo Azure environment (Bicep)
  - [x] 9.1 Author the demo resource template
    - Create `infra/main.bicep` declaring the intentionally non-compliant resources (HTTP-only storage, storage with soft delete disabled, NSG allowing `0.0.0.0/0` on port 3389, untagged VM, Key Vault without purge protection, unaudited SQL database, VM without diagnostics) and the compliant contrast resources (HTTPS+soft-delete+private-endpoint storage, scoped-source NSG, hardened Key Vault)
    - Target resource group `rg-governance-demo`, apply the `demo` naming token to every resource, use only built-in definitions, and fix all names/properties so redeployment produces no diff
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14_

  - [x] 9.2 Add the Azure Security Benchmark initiative assignment
    - Add a `Microsoft.Authorization/policyAssignments` resource assigning initiative `1f3afdf9-d0c9-4c3d-847f-89da613e70a8` at subscription scope
    - _Requirements: 2.1_

  - [x] 9.3 Add least-privilege RBAC role assignments
    - Add role assignments granting the Function App managed identity exactly `Reader` and `Resource Policy Reader` on the subscription scope and no write-capable roles
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 9.4 Write Bicep synthesis/snapshot tests
    - Build the template and assert the resource group name, each compliant/non-compliant resource and its key properties, the `demo` naming token, built-in-only policy usage, the subscription-scope initiative assignment, and the exact `{Reader, Resource Policy Reader}` RBAC set
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 2.1, 8.1, 8.2, 8.3, 8.4_

- [x] 10. Author the governance knowledge base and FAQ content
  - [x] 10.1 Write the governance baseline framework document
    - Create `knowledge/governance-baseline-framework.md` covering all five categories (networking, storage, identity, compute, logging) with key controls, common violations, and remediation for each, plus a three-tier prioritization framework mapping each gap to a high/medium/low tier
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 10.2 Write the FAQ collection content
    - Create `knowledge/faq.json` (or equivalent) with one question/answer entry each for: what Azure Policy is, what a policy baseline is, evaluation cadence, and audit vs deny mode
    - _Requirements: 11.1, 11.2_

  - [x] 10.3 Write content validation tests
    - Assert the KB covers all five categories with controls/violations/remediation and a three-tier framework, and that the FAQ contains the four required entries each with exactly one question and one answer
    - _Requirements: 10.1, 10.2, 10.3, 11.1, 11.2_

- [x] 11. Assemble the Napster Omniagent configuration
  - [x] 11.1 Implement the agent assembly script
    - Create the `agent/` package with pure payload-building logic in `agent/src/config.ts`, the Napster API client in `agent/src/napster-client.ts`, shared types in `agent/src/types.ts`, the persona/discipline system prompt in `agent/src/system-prompt.ts`, and the orchestration entry point in `agent/src/assemble.ts`
    - Create the companion ("Morgan" / "Cole", senior governance architect), upload the knowledge base file, register the `check_policy_compliance` tool (`flow: "explicit"`, `category`/`severity` enum parameters, `url` = Function endpoint with `?code=<function-key>`), create the FAQ collection, and assemble the agent (voice, avatar, persistent memory, `temperature: 0.4`) wiring tool + KB + FAQ
    - Author the system prompt enforcing tool-before-claims, severity-ordered/category-grouped presentation, KB grounding, no-fabrication, and the top-5 closing summary
    - _Requirements: 9.1, 9.2, 9.5, 10.4, 11.3, 12.1, 12.2, 12.3, 12.6, 13.1, 13.2, 13.3, 13.4, 13.6, 14.1, 14.2, 14.3_

  - [x] 11.2 Write agent assembly configuration tests
    - In `agent/src/config.test.ts`, assert the assembled config payloads: companion name and role, temperature exactly 0.4, persistent memory enabled, tool name/flow/params/url, and agent associations to tool + KB + FAQ
    - _Requirements: 9.1, 9.2, 9.5, 10.4, 11.3, 12.1, 12.2, 12.3, 12.6, 14.1_

- [x] 12. Implement the React frontend
  - [x] 12.1 Implement the session state machine
    - Create `frontend/src/session.ts` with a reducer over statuses `disconnected | connecting | connected | ended | error` and transitions for start, established, end, timeout, connection error, and missing-config
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.9_

  - [x] 12.2 Write property test for the session status invariant
    - **Property 9: Session status invariant**
    - **Validates: Requirements 15.5**

  - [x] 12.3 Build the single-page app and Web SDK integration
    - Create the Vite React page with the agent avatar as the central element, start/end controls, and a status indicator, reading `VITE_NAPSTER_API_KEY` and `VITE_AGENT_ID` from env config
    - On start open a WebRTC connection (`POST /public/agents/{agentId}/connections`, `channelType: "webrtc"`), mount the avatar on success, enforce a 30s connection timeout, handle connection errors with retry, and disable start when config is missing
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.6, 15.7, 15.8, 15.9_

  - [x] 12.4 Write example/component tests for the frontend
    - Test reducer transitions (start→connecting, established→connected with avatar mounted, end→ended teardown, timeout→error, connection error→error with start re-enabled, missing config→error with start disabled), the single-page render with avatar central, and config reads
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.6, 15.7, 15.8, 15.9_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Each task references specific requirements (granular sub-requirement clauses) for traceability.
- Property tests validate the universal correctness properties from the design; unit/example tests cover specific cases and edge conditions.
- Infrastructure (Bicep/RBAC), agent assembly, and content are validated through synthesis/snapshot and config tests rather than property-based tests, per the design's testing strategy.
- Deployment, live Azure scans, and manual LLM evaluation are out of scope for these coding tasks (they require running services and human judgment).
- Checkpoints ensure incremental validation at component boundaries.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "9.1", "10.1", "10.2"] },
    { "id": 1, "tasks": ["2.1", "9.2", "9.3", "10.3"] },
    { "id": 2, "tasks": ["2.2", "3.1", "4.1", "5.1", "6.1", "9.4", "11.1", "12.1"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5", "3.2", "3.3", "4.2", "4.3", "5.2", "6.2", "11.2", "12.2", "12.3"] },
    { "id": 4, "tasks": ["7.1", "12.4"] },
    { "id": 5, "tasks": ["7.2", "7.3"] }
  ]
}
```
