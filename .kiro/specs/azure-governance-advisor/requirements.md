# Requirements Document

## Introduction

The Azure Governance Baseline Advisor is a multimodal AI agent built on Napster's Omniagent API that acts as a senior Azure governance architect. A user holds a face-to-face video and voice conversation with the agent, which performs a live policy baseline assessment of a real Azure subscription. The agent queries Azure Policy compliance state through an Azure Function backed by Azure Resource Graph, prioritizes findings by real business risk, explains the impact of each finding using a governance knowledge base, recommends remediation, and remembers prior conversations through persistent memory.

This is a hackathon project (Napster Omniagent API Hackathon) built over a weekend sprint. The system spans five components: a demo Azure environment, an Azure Function tool backend, Napster Omniagent configuration, a governance knowledge base, and a minimal React frontend. Built-in Azure policies only — no custom policy authoring.

## Glossary

- **Advisor_Agent**: The assembled Napster Omniagent (persona "Morgan Cole") that conducts the governance assessment conversation.
- **Demo_Environment**: The Azure resource group `rg-governance-demo` containing intentionally compliant and non-compliant resources deployed via Bicep.
- **Bicep_Template**: The single idempotent infrastructure-as-code file `infra/main.bicep` that deploys all demo resources.
- **Policy_Function**: The Azure Function (Node.js 20 / TypeScript, Functions v4) exposing the HTTP endpoint `POST /api/policy-check`.
- **Resource_Graph_Query**: The Kusto query executed by the Policy_Function against Azure Resource Graph to retrieve policy compliance state.
- **Severity_Mapper**: The component within the Policy_Function that assigns a severity rating (high, medium, low) to each finding using a hardcoded lookup table.
- **Knowledge_Base**: The Napster knowledge collection containing the governance baseline framework document.
- **FAQ_Collection**: The Napster FAQ collection providing consistent answers to common governance questions.
- **Policy_Tool**: The Napster tool definition (`check_policy_compliance`, explicit flow) that points at the Policy_Function URL.
- **Web_Frontend**: The React (Vite) single-page application that embeds the Napster Web SDK for WebRTC video and voice.
- **Napster_Platform**: Napster's hosted Omniagent infrastructure that runs the LLM, avatar, voice, memory, and orchestrates tool calls.
- **Finding**: A single non-compliant resource-policy pair returned by the Policy_Function, carrying category, policy name, resource identifiers, and severity.
- **Category**: A governance domain, one of networking, storage, identity, compute, or logging.
- **Severity**: A risk rating for a finding, one of high, medium, or low.
- **Azure_Security_Benchmark**: The built-in Azure Policy initiative (ID `1f3afdf9-d0c9-4c3d-847f-89da613e70a8`) assigned at subscription level.
- **DefaultAzureCredential**: The Azure SDK credential chain used by the Policy_Function to authenticate to Azure.

## Requirements

### Requirement 1: Demo Azure Environment Provisioning

**User Story:** As a hackathon builder, I want a single idempotent infrastructure file that deploys a realistic mix of compliant and non-compliant Azure resources, so that the Advisor_Agent has real compliance data to assess during the demo.

#### Acceptance Criteria

1. THE Bicep_Template SHALL deploy all demo resources into a resource group named `rg-governance-demo`.
2. WHEN the Bicep_Template is deployed a second time with no source changes, THE Bicep_Template SHALL complete with a successful deployment status AND SHALL create, delete, or modify no demo resource relative to the first deployment.
3. THE Bicep_Template SHALL deploy a storage account configured with `supportsHttpsTrafficOnly` set to false.
4. THE Bicep_Template SHALL deploy a storage account with blob soft delete disabled.
5. THE Bicep_Template SHALL deploy a network security group containing an enabled inbound rule with access set to Allow, source `0.0.0.0/0`, and destination port 3389.
6. THE Bicep_Template SHALL deploy a virtual machine that has zero resource tags assigned.
7. THE Bicep_Template SHALL deploy a Key Vault with purge protection disabled.
8. THE Bicep_Template SHALL deploy a SQL database with database auditing not configured.
9. THE Bicep_Template SHALL deploy a virtual machine with no diagnostic settings configured.
10. THE Bicep_Template SHALL deploy a storage account configured with HTTPS-only transfer, blob soft delete, and a private endpoint.
11. THE Bicep_Template SHALL deploy a network security group in which each inbound rule specifies a source other than `0.0.0.0/0`.
12. THE Bicep_Template SHALL deploy a Key Vault with both purge protection and soft delete enabled.
13. THE Bicep_Template SHALL assign each demo resource a name carrying a `demo` token, using the `demo-` prefix form where the resource type's naming rules permit hyphens.
14. THE Demo_Environment SHALL use only built-in Azure Policy definitions and built-in initiatives.

### Requirement 2: Policy Initiative Assignment and Evaluation

**User Story:** As a hackathon builder, I want the Azure Security Benchmark initiative assigned at the subscription and compliance evaluated on demand, so that compliance state reflects the deployed demo resources before the demo.

#### Acceptance Criteria

1. THE Demo_Environment SHALL assign the Azure_Security_Benchmark initiative at the subscription scope.
2. IF the assignment of the Azure_Security_Benchmark initiative fails, THEN THE Demo_Environment SHALL surface an error indication and SHALL leave any prior assignment state unchanged.
3. WHEN an on-demand policy evaluation scan is triggered for `rg-governance-demo`, THE Demo_Environment SHALL evaluate the compliance state of the demo resources against the assigned initiative and reach a terminal state of completed or failed within 30 minutes.
4. IF the policy evaluation scan does not reach a terminal state within 30 minutes, THEN THE Demo_Environment SHALL surface a timeout error indication and SHALL retain the prior evaluated compliance state.
5. WHEN the policy evaluation scan completes, THE Demo_Environment SHALL expose, for each demo resource, a compliance value of Compliant or NonCompliant that is queryable through Azure Resource Graph by the Policy_Function.

### Requirement 3: Policy Function Endpoint and Authentication

**User Story:** As the Napster_Platform, I want a publicly reachable, authenticated HTTP endpoint, so that I can invoke the policy compliance tool during a conversation.

#### Acceptance Criteria

1. THE Policy_Function SHALL expose an HTTP endpoint at the route `POST /api/policy-check`.
2. THE Policy_Function SHALL require a valid function-level authorization key supplied on every request.
3. IF a request omits the function-level authorization key or supplies a key that does not match the configured key, THEN THE Policy_Function SHALL reject the request with an HTTP 401 status and an error response indicating that authorization failed, without executing the Resource_Graph_Query.
4. THE Policy_Function SHALL authenticate to Azure using DefaultAzureCredential.
5. THE Policy_Function SHALL be deployed on Azure Functions v4 with the Node.js 20 runtime.
6. WHEN a client on the public internet sends an HTTPS request to the `POST /api/policy-check` endpoint, THE Policy_Function SHALL accept the request and return an HTTP response within 30 seconds.
7. IF DefaultAzureCredential fails to acquire an Azure access token, THEN THE Policy_Function SHALL reject the request with an HTTP 500 status and an error response indicating an authentication failure, without executing the Resource_Graph_Query.

### Requirement 4: Policy Function Input Handling

**User Story:** As the Advisor_Agent, I want to filter the compliance query by category and severity, so that I can request either a full baseline or a focused subset of findings.

#### Acceptance Criteria

1. THE Policy_Function SHALL accept a JSON request body containing an optional string `category` field and an optional string `severity` field.
2. WHERE the `category` field is absent or present as an empty string, THE Policy_Function SHALL apply the default value `all`.
3. WHERE the `severity` field is absent or present as an empty string, THE Policy_Function SHALL apply the default value `all`.
4. THE Policy_Function SHALL accept the `category` values `all`, `networking`, `storage`, `identity`, `compute`, and `logging`, matched case-insensitively.
5. THE Policy_Function SHALL accept the `severity` values `all`, `high`, `medium`, and `low`, matched case-insensitively.
6. IF the `category` field contains a value outside the accepted set, THEN THE Policy_Function SHALL return an HTTP 400 status with an error message identifying the `category` field as invalid and listing the accepted values, and SHALL NOT execute the Resource_Graph_Query.
7. IF the `severity` field contains a value outside the accepted set, THEN THE Policy_Function SHALL return an HTTP 400 status with an error message identifying the `severity` field as invalid and listing the accepted values, and SHALL NOT execute the Resource_Graph_Query.
8. IF the request body is present but is not valid JSON, THEN THE Policy_Function SHALL return an HTTP 400 status with an error message indicating the request body could not be parsed, and SHALL NOT execute the Resource_Graph_Query.
9. WHERE the `category` field holds a value other than `all`, THE Policy_Function SHALL restrict the Resource_Graph_Query results to findings whose category equals the provided value.
10. WHERE the `severity` field holds a value other than `all`, THE Policy_Function SHALL restrict the returned findings to those whose assigned severity equals the provided value.
11. WHERE both the `category` and `severity` fields hold values other than `all`, THE Policy_Function SHALL restrict the returned findings to those whose category equals the provided `category` value AND whose severity equals the provided `severity` value.

### Requirement 5: Policy Function Compliance Query

**User Story:** As the Advisor_Agent, I want the function to query live policy compliance state, so that my assessment reflects the actual environment rather than guesses.

#### Acceptance Criteria

1. WHEN the Policy_Function receives a request that has passed function-level authorization and input validation, THE Policy_Function SHALL execute the Resource_Graph_Query against the target subscription and complete the query within 30 seconds.
2. THE Resource_Graph_Query SHALL return only resources whose compliance state equals `NonCompliant`.
3. THE Policy_Function SHALL extract from each query result the resource identifier, resource type, policy name, policy display name, category, and resource group.
4. WHERE a query result omits a value for the policy display name, category, or resource group, THE Policy_Function SHALL populate that field with an empty string in the extracted Finding rather than discard the result.
5. IF the Resource_Graph_Query fails or does not complete within 30 seconds, THEN THE Policy_Function SHALL return an HTTP 500 status with an error message indicating the query failure, and SHALL return no partial findings.

### Requirement 6: Severity Mapping

**User Story:** As the Advisor_Agent, I want each finding tagged with a severity, so that I can prioritize findings by real risk during the conversation.

#### Acceptance Criteria

1. WHEN the Policy_Function produces a Finding, THE Severity_Mapper SHALL match the Finding's policy name against the severity lookup table and assign exactly one severity value of `high`, `medium`, or `low`.
2. THE Severity_Mapper SHALL assign severity `high` to a Finding whose policy name corresponds to open network access to `0.0.0.0/0`, OR missing encryption, OR missing Key Vault purge protection.
3. THE Severity_Mapper SHALL assign severity `medium` to a Finding whose policy name corresponds to missing diagnostic settings, OR disabled soft delete, OR missing tags.
4. THE Severity_Mapper SHALL assign severity `low` to a Finding whose policy name corresponds to an informational or naming-convention policy.
5. WHERE a Finding's policy name is absent from the severity lookup table, THE Severity_Mapper SHALL assign a default severity of `low`.
6. THE Severity_Mapper SHALL assign the same severity value to every Finding that carries the same policy name across requests.
7. WHERE a Finding's policy name matches more than one severity tier, THE Severity_Mapper SHALL apply the precedence order `high` over `medium` over `low`.

### Requirement 7: Policy Function Response Structure

**User Story:** As the Napster_Platform, I want a structured compliance response, so that the Advisor_Agent can summarize counts by category and walk through individual findings.

#### Acceptance Criteria

1. THE Policy_Function SHALL return a JSON response containing the target subscription identifier, an assessment timestamp, a summary object, and a findings array.
2. THE Policy_Function SHALL include in the summary object a total count of non-compliant findings and a per-category breakdown that contains a separate count for each of the categories networking, storage, identity, compute, and logging.
3. THE Policy_Function SHALL include for each Finding the category as one of networking, storage, identity, compute, or logging; the policy name; the resource identifier; the resource type; and the severity as one of high, medium, or low.
4. THE Policy_Function SHALL set the summary total count equal to the number of elements in the findings array.
5. WHEN the query returns no non-compliant resources for the requested filters, THE Policy_Function SHALL return a summary total count of zero and an empty findings array.
6. THE Policy_Function SHALL format the assessment timestamp as an ISO 8601 timestamp expressed in UTC with the `Z` zone designator.
7. WHERE a category has no non-compliant findings, THE Policy_Function SHALL report that category's count as zero in the per-category breakdown.
8. THE Policy_Function SHALL set the sum of the per-category counts in the summary object equal to the summary total count.

### Requirement 8: Policy Function Azure Authorization

**User Story:** As a hackathon builder, I want the function's identity to hold least-privilege read access, so that it can query compliance state without write permissions on the subscription.

#### Acceptance Criteria

1. THE Policy_Function's managed identity SHALL be granted the Reader role on the subscription scope that contains the Demo_Environment.
2. THE Policy_Function's managed identity SHALL be granted the Resource Policy Reader role on the subscription scope that contains the Demo_Environment.
3. THE Policy_Function's managed identity SHALL NOT be granted any role that confers create, update, or delete permissions on the subscription scope.
4. THE Policy_Function's managed identity SHALL be granted no roles other than Reader and Resource Policy Reader on the subscription scope.

### Requirement 9: Companion Persona Configuration

**User Story:** As a user, I want to converse with a credible senior governance architect persona, so that the assessment feels authoritative and practical.

#### Acceptance Criteria

1. THE Advisor_Agent SHALL use a companion configured with the persona name "Morgan Cole".
2. THE Advisor_Agent SHALL be configured with a persona role of senior Azure governance architect.
3. WHILE a session is active, THE Advisor_Agent SHALL present a video avatar through the Napster_Platform.
4. WHILE a session is active, THE Advisor_Agent SHALL converse using voice through the Napster_Platform.
5. THE Advisor_Agent SHALL be configured with a model temperature of exactly 0.4.

### Requirement 10: Knowledge Base Content and Grounding

**User Story:** As a user, I want the agent to explain why each finding matters, so that I understand the business impact and remediation, not just the violation.

#### Acceptance Criteria

1. THE Knowledge_Base SHALL contain a governance baseline framework document that covers all five categories: networking, storage, identity, compute, and logging.
2. THE Knowledge_Base SHALL provide, for each of the five categories, the key controls, the common violations, and the remediation guidance for that category.
3. THE Knowledge_Base SHALL provide a prioritization framework that maps each governance gap to exactly one of three remediation tiers, where the three tiers correspond to the high, medium, and low Severity ratings.
4. THE Advisor_Agent SHALL be associated with the Knowledge_Base when assembled.
5. WHEN a user asks why a finding matters, THE Advisor_Agent SHALL explain the finding's business impact and recommended remediation using only content contained in the Knowledge_Base.
6. IF a user asks why a finding matters and the Knowledge_Base contains no content covering that finding's category, THEN THE Advisor_Agent SHALL inform the user that no grounding content is available for that finding and SHALL refrain from providing fabricated impact or remediation content.

### Requirement 11: FAQ Collection

**User Story:** As a user, I want consistent answers to common governance questions, so that the agent does not contradict itself across sessions.

#### Acceptance Criteria

1. THE FAQ_Collection SHALL contain at least one entry for each of the following questions: what Azure Policy is, what a policy baseline is, how often Azure evaluates compliance, and the difference between audit and deny mode.
2. THE FAQ_Collection SHALL pair each entry with exactly one question and exactly one defined answer.
3. THE Advisor_Agent SHALL be associated with the FAQ_Collection when assembled.
4. WHEN a user asks a question that matches an entry in the FAQ_Collection, THE Advisor_Agent SHALL answer using the defined answer from that FAQ_Collection entry.
5. WHEN the same FAQ_Collection question is asked in two separate sessions, THE Advisor_Agent SHALL return the answer drawn from the same FAQ_Collection entry in both sessions.

### Requirement 12: Tool Registration and Invocation

**User Story:** As the Advisor_Agent, I want a registered tool that calls the Policy_Function, so that I can retrieve live compliance data before making claims about the environment.

#### Acceptance Criteria

1. THE Policy_Tool SHALL be registered on the Napster_Platform with the name `check_policy_compliance` and an explicit invocation flow.
2. THE Policy_Tool SHALL declare a `category` parameter accepting the enumerated values `all`, `networking`, `storage`, `identity`, `compute`, and `logging`, and a `severity` parameter accepting the enumerated values `all`, `high`, `medium`, and `low`.
3. THE Policy_Tool SHALL target the Policy_Function endpoint URL including its function authorization key.
4. WHEN the user requests an assessment of the environment's compliance posture, THE Advisor_Agent SHALL invoke the Policy_Tool before stating any compliance finding.
5. IF the Policy_Tool invocation fails or returns no compliance data, THEN THE Advisor_Agent SHALL inform the user that compliance data could not be retrieved and SHALL refrain from stating any compliance finding.
6. THE Advisor_Agent SHALL be assembled with the Policy_Tool, the Knowledge_Base, and the FAQ_Collection associated.

### Requirement 13: Assessment Conversation Behavior

**User Story:** As a user, I want the agent to walk me through findings in priority order and recommend actions, so that I know what to fix first.

#### Acceptance Criteria

1. WHEN a session begins, THE Advisor_Agent SHALL ask the user to name a specific Category to assess or to accept a full baseline review across all five categories.
2. WHEN presenting findings, THE Advisor_Agent SHALL order them by severity, presenting high-severity findings first, then medium-severity findings, then low-severity findings.
3. WHEN multiple findings share the same severity, THE Advisor_Agent SHALL group those findings by category when presenting them.
4. WHEN presenting a finding, THE Advisor_Agent SHALL state the violation, why it matters using content grounded in the Knowledge_Base, and one recommended remediation step.
5. IF the Policy_Function returns zero findings for a requested category, THEN THE Advisor_Agent SHALL inform the user that the category is clean and SHALL NOT report any finding absent from the Policy_Function response.
6. WHEN the assessment concludes, THE Advisor_Agent SHALL offer a summary of up to the five highest-severity recommended actions, ordered from high to low severity.

### Requirement 14: Persistent Memory

**User Story:** As a returning user, I want the agent to remember our prior conversation, so that I do not have to repeat context across sessions.

#### Acceptance Criteria

1. WHEN a returning user recognized by the Napster_Platform as the same user starts a new session, THE Advisor_Agent SHALL retrieve the prior conversation context, including previously discussed findings and the prior assessment scope, from the Napster_Platform persistent memory.
2. WHEN the user references a topic, finding, or assessment scope discussed in a prior session, THE Advisor_Agent SHALL respond using the retrieved prior context without requiring the user to restate that information.
3. IF no prior conversation context exists for the user in the Napster_Platform persistent memory, THEN THE Advisor_Agent SHALL begin the session as a new assessment and SHALL refrain from referencing nonexistent prior context.

### Requirement 15: Frontend Session Lifecycle

**User Story:** As a user, I want a minimal web page that connects me to the agent's video avatar, so that I can start and end the assessment conversation easily.

#### Acceptance Criteria

1. THE Web_Frontend SHALL render a single page presenting the agent video avatar as the central element.
2. WHEN the user activates the start control, THE Web_Frontend SHALL create a WebRTC connection to the Advisor_Agent through the Napster Web SDK and set the session status to `connecting`.
3. WHEN a WebRTC connection is established, THE Web_Frontend SHALL mount the agent video avatar in the page container and set the session status to `connected`.
4. WHEN the user activates the end control, THE Web_Frontend SHALL terminate the active session, release the connection, and set the session status to `ended`.
5. THE Web_Frontend SHALL display the current session status as one of `disconnected`, `connecting`, `connected`, `ended`, or `error`.
6. IF a WebRTC connection is not established within 30 seconds of activating the start control, THEN THE Web_Frontend SHALL set the session status to `error` and indicate a connection timeout.
7. IF a connection error occurs, THEN THE Web_Frontend SHALL set the session status to `error`, display an error indication, and re-enable the start control to allow a retry.
8. THE Web_Frontend SHALL read the Napster API key and agent identifier from environment-based configuration.
9. IF the Napster API key or the agent identifier is absent at startup, THEN THE Web_Frontend SHALL display an error status indicating the missing configuration and SHALL disable the start control.
