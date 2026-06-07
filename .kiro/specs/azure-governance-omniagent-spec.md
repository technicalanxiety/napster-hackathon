# Azure Governance Baseline Advisor - Omniagent Hackathon Spec

## Project Overview

Build a multimodal AI agent using Napster's Omniagent API that acts as a senior Azure governance architect performing a policy baseline assessment on a customer's Azure subscription. The agent uses a video avatar, voice conversation, a governance knowledge base, and live tool integration that queries Azure Policy compliance state via Azure Resource Graph.

**Hackathon:** Napster Omniagent API Hackathon (May 18 - June 15, 2026)
**Build window:** Weekend sprint
**Platform docs:** https://developers.napster.com/docs
**API base URL:** `https://companion-api.napster.com`

## Demo Narrative

A team lead has inherited an Azure subscription and needs to understand their compliance posture. They open the web app and have a face-to-face conversation with the governance advisor agent. The agent:

1. Greets them and asks what they want to assess
2. Calls the policy compliance tool to query their environment
3. Walks through findings by category (networking, storage, identity, compute, logging)
4. Prioritizes findings by actual risk, not just count
5. Explains the "so what" behind each violation using the knowledge base
6. Recommends specific remediation steps
7. Remembers the conversation if they return later (persistent memory)

---

## Architecture

```
+---------------------------+
|   React SPA (Web SDK)     |
|   WebRTC video/voice      |
+------------+--------------+
             |
             v
+---------------------------+
|   Napster Omniagent API   |
|   - Companion (avatar)    |
|   - Knowledge base        |
|   - Tool: policy_check    |
|   - Azure OpenAI (LLM)   |
+------------+--------------+
             |
             | explicit tool call (HTTPS POST)
             v
+---------------------------+
|   Azure Function          |
|   (Node.js / TypeScript)  |
|   - Receives tool call    |
|   - Queries Resource Graph|
|   - Returns findings      |
+------------+--------------+
             |
             v
+---------------------------+
|   Azure Subscription      |
|   - Policy assignments    |
|   - Demo resources        |
|   (intentionally mixed    |
|    compliant/non-compliant)|
+---------------------------+
```

---

## Component 1: Azure Infrastructure (Demo Environment)

### Purpose
Provide a real Azure subscription with policy assignments and a mix of compliant and non-compliant resources for the agent to assess.

### Policy Assignments
Assign the **Azure Security Benchmark** initiative (built-in, ID: `1f3afdf9-d0c9-4c3d-847f-89da613e70a8`) at the subscription level. This gives broad coverage across networking, storage, identity, compute, and logging without writing custom policy.

Alternatively, use **CIS Microsoft Azure Foundations Benchmark** if you prefer that framing.

Do NOT write custom policy definitions. Use built-in policies only. Time trap.

### Demo Resources to Deploy
Create a resource group named `rg-governance-demo` and deploy these resources with intentional violations:

**Non-compliant resources (the findings):**
- Storage account with `supportsHttpsTrafficOnly: false` (insecure transfer)
- Storage account with no blob soft delete enabled
- NSG with an inbound rule allowing `0.0.0.0/0` on port 3389 (open RDP)
- VM with no tags (missing required tagging)
- Key Vault with no purge protection enabled
- SQL database without transparent data encryption audit logging
- VM with no diagnostic settings configured

**Compliant resources (to show it's not all bad):**
- Storage account with HTTPS-only, soft delete, private endpoint
- NSG with scoped rules only
- Key Vault with purge protection and soft delete

### Deployment Method
Use a single Bicep file or ARM template for all demo resources. Must be idempotent and deployable in one command:

```bash
az deployment group create \
  --resource-group rg-governance-demo \
  --template-file infra/main.bicep
```

### File: `infra/main.bicep`
Deploy all demo resources above. Keep it flat and simple. No modules, no parameters file. Hardcode names with a `demo-` prefix for easy cleanup.

### Post-deployment step
Wait 15-30 minutes after deployment for Azure Policy to evaluate compliance state. Policy evaluation is not instant. You can trigger an on-demand scan:

```bash
az policy state trigger-scan --resource-group rg-governance-demo
```

---

## Component 2: Azure Function (Tool Backend)

### Purpose
Receive explicit tool calls from Napster's Omniagent platform, query Azure Resource Graph for policy compliance state, and return structured findings.

### Runtime
- Azure Functions v4
- Node.js 20 / TypeScript
- HTTP trigger, function-level auth key
- Must be publicly accessible (Napster's infrastructure calls it)

### Endpoint
`POST /api/policy-check`

### Input Schema
The Napster explicit tool flow sends a JSON payload. The relevant field is the tool arguments object. Design the function to accept:

```json
{
  "category": "all | networking | storage | identity | compute | logging",
  "severity": "all | high | medium | low"
}
```

Both fields optional. Defaults to `"all"` for each.

### Logic
1. Authenticate to Azure using DefaultAzureCredential (managed identity in production, or Azure CLI creds for local dev / hackathon)
2. Run an Azure Resource Graph query against the target subscription:

```kusto
policyresources
| where type == "microsoft.policyinsights/policystates"
| where properties.complianceState == "NonCompliant"
| extend
    resourceId = properties.resourceId,
    resourceType = properties.resourceType,
    policyName = properties.policyDefinitionName,
    policyDisplayName = properties.policyDefinitionDisplayName,
    category = properties.policyDefinitionCategory,
    resourceGroup = properties.resourceGroup
| project resourceId, resourceType, policyName, policyDisplayName, category, resourceGroup
```

3. If `category` filter is provided, add a `| where category =~ "{category}"` clause
4. Group results by category and count violations per category
5. Return a structured response

### Output Schema

```json
{
  "subscriptionId": "xxxx-xxxx-xxxx",
  "assessmentTimestamp": "2026-06-07T14:30:00Z",
  "summary": {
    "totalNonCompliant": 12,
    "byCategory": {
      "networking": 3,
      "storage": 4,
      "identity": 2,
      "compute": 2,
      "logging": 1
    }
  },
  "findings": [
    {
      "category": "networking",
      "policyName": "Restrict open RDP access",
      "resourceId": "/subscriptions/.../nsg-demo-open",
      "resourceType": "Microsoft.Network/networkSecurityGroups",
      "severity": "high"
    }
  ]
}
```

### Severity Mapping
The built-in policies don't always carry severity cleanly. Map it heuristically:
- **high:** open network access (RDP/SSH to 0.0.0.0/0), missing encryption, no purge protection on Key Vault
- **medium:** missing diagnostics, no soft delete, missing tags
- **low:** informational policies, naming conventions

Hardcode a severity lookup table based on policy definition names you know will fire against your demo resources. This is a hackathon, don't over-engineer it.

### Dependencies
```json
{
  "@azure/identity": "latest",
  "@azure/arm-resourcegraph": "latest"
}
```

### Deployment
Deploy to Azure Functions via:
```bash
func azure functionapp publish governance-advisor-func
```

Or use VS Code Azure Functions extension. Whichever is faster for you.

### Auth Note
The function needs Reader + Resource Policy Reader RBAC on the target subscription. Assign these to the Function App's managed identity:

```bash
az role assignment create \
  --assignee <function-app-managed-identity-object-id> \
  --role "Reader" \
  --scope /subscriptions/<sub-id>

az role assignment create \
  --assignee <function-app-managed-identity-object-id> \
  --role "Resource Policy Reader" \
  --scope /subscriptions/<sub-id>
```

---

## Component 3: Napster Omniagent Configuration

### API Key
Create a Napster Omniagent API resource in the Azure Portal (Azure Marketplace). Generate an API key from the Napster dashboard. All API calls use header: `X-Api-Key: <key>`

### 3a. Companion

Create a custom companion for the advisor persona.

```
POST /public/companions
```

```json
{
  "firstName": "Morgan",
  "lastName": "Cole",
  "description": "A senior Azure governance architect with 15 years of experience across enterprise environments. Direct, knowledgeable, and practical. Prioritizes real risk over compliance theater. Explains the business impact of technical findings without condescension. Conversational but focused. Does not waste time on low-severity findings when critical gaps exist."
}
```

For the avatar image: use a professional headshot-style stock photo. 16:9 aspect ratio, waist-up, facing camera, relaxed arms, gentle smile. No public figures.

Save the returned `id` as `COMPANION_ID`.

### 3b. Knowledge Base

Create a knowledge collection and upload the governance framework document.

```
POST /public/knowledge-bases
```
```json
{
  "name": "Azure Governance Baseline Framework"
}
```

Then upload the knowledge document (see Component 4 below for full content):

```
POST /public/knowledge-bases/{kb_id}/files
```

Upload the markdown file as a hosted URL or through the dashboard.

Save the returned collection `id` as `KNOWLEDGE_BASE_ID`.

### 3c. Tool Definition

Register the policy check tool:

```
POST /public/functions
```

```json
{
  "data": {
    "name": "check_policy_compliance",
    "description": "Query the Azure subscription's policy compliance state. Returns a summary of non-compliant resources grouped by category (networking, storage, identity, compute, logging) with severity ratings. Use this when the user wants to understand their compliance posture, asks about policy violations, or wants to know what needs to be fixed. Always call this before making any claims about the environment's compliance state.",
    "parameters": {
      "type": "object",
      "properties": {
        "category": {
          "type": "string",
          "enum": ["all", "networking", "storage", "identity", "compute", "logging"],
          "description": "Filter findings by governance category. Use 'all' for a full baseline assessment."
        },
        "severity": {
          "type": "string",
          "enum": ["all", "high", "medium", "low"],
          "description": "Filter findings by severity level. Default to 'all' unless the user asks for critical issues only."
        }
      }
    }
  },
  "url": "https://<your-function-app>.azurewebsites.net/api/policy-check?code=<function-key>",
  "flow": "explicit"
}
```

Save the returned `id` as `TOOL_ID`.

### 3d. FAQ Collection (optional but recommended)

Create a small FAQ collection for questions the agent should answer consistently:

```
POST /public/faqs
```

```json
{
  "name": "Governance Advisor FAQs"
}
```

Then add items:

| Question | Answer |
|----------|--------|
| What is Azure Policy? | Azure Policy is a service that enforces organizational standards and assesses compliance at scale. It evaluates resources against policy definitions and reports which resources are non-compliant. It does not block deployments by default unless configured in deny mode. |
| What is a policy baseline? | A policy baseline is a minimum set of governance controls applied to every Azure subscription. It typically covers network security, data protection, identity controls, monitoring, and tagging standards. Think of it as the foundation that every workload inherits. |
| How often does Azure evaluate policy compliance? | Azure Policy evaluates compliance on a regular cycle, typically every 24 hours for existing resources. New resources are evaluated within minutes of creation. You can trigger an on-demand evaluation scan at any time. |
| What is the difference between audit and deny mode? | Audit mode flags non-compliant resources but does not prevent their creation. Deny mode actively blocks resource creation or modification that violates the policy. Most organizations start with audit to understand their baseline before switching critical policies to deny. |

### 3e. Assemble the Omniagent

```
POST /public/agents
```

```json
{
  "companionId": "<COMPANION_ID>",
  "name": "Azure Governance Baseline Advisor",
  "voiceId": "echo",
  "language": "English",
  "functions": ["<TOOL_ID>"],
  "faqCollections": ["<FAQ_COLLECTION_ID>"],
  "knowledgeBaseId": "<KNOWLEDGE_BASE_ID>",
  "providerSettings": {
    "temperature": 0.4
  }
}
```

Notes:
- `temperature: 0.4` keeps it grounded for compliance content. Don't go higher.
- `voiceId: "echo"` is a professional-sounding voice. Test alternatives in the Playground. Pick one that sounds like a senior consultant, not a customer support bot.

Save the returned `id` as `AGENT_ID`.

### 3f. System Prompt

Configure via the Companion description and/or the Playground system instructions field. The system prompt should include:

```
You are Morgan Cole, a senior Azure governance architect performing a policy baseline assessment. You have 15 years of experience working across enterprise Azure environments.

Your role in this conversation:
- Assess the customer's Azure environment for governance gaps
- Prioritize findings by actual business risk, not just compliance checkboxes
- Explain the "so what" behind every finding in plain language
- Recommend specific, actionable remediation steps
- Be direct and honest about what matters and what is noise

Behavior guidelines:
- Start by asking what they want to assess or if they want a full baseline review
- Always call the check_policy_compliance tool before making claims about their environment. Never guess.
- Present findings in priority order: critical risks first, then moderate, then informational
- For each finding, explain: what the violation is, why it matters, and what to do about it
- Use the knowledge base to provide context on governance best practices
- If they ask about something outside Azure governance, acknowledge it and redirect
- Keep responses conversational and concise. You are talking, not writing a report.
- When you finish the assessment, offer a summary of top actions they should take this week

Do not:
- Make up compliance data. If the tool returns no results for a category, say so.
- Overwhelm with every finding at once. Walk through categories one at a time unless they ask for everything.
- Use jargon without explaining it on first use.
- Qualify everything to death. Be confident in your expertise.
```

---

## Component 4: Knowledge Base Content

Create a file named `governance-baseline-framework.md` with the following content. This is the knowledge base document uploaded to Napster. It provides the agent with governance context beyond what the tool returns.

### Content to write:

**Title:** Azure Governance Baseline Framework - Policy Assessment Guide

**Sections to include:**

1. **What is a Governance Baseline?**
   - Definition: the minimum set of controls every subscription inherits
   - Purpose: risk reduction, consistency across environments, auditability
   - Not a one-time exercise. Baselines evolve as the org matures.

2. **Assessment Categories**

   **Networking**
   - Why it matters: network misconfigurations are the most common path to breach
   - Key controls: no open RDP/SSH to internet, NSG flow logs enabled, no public IPs on internal workloads, DDoS protection on external-facing resources
   - Common violations: wildcard source addresses in NSG rules, port 3389/22 open to 0.0.0.0/0
   - Remediation: scope inbound rules to known IP ranges or use Azure Bastion for remote access

   **Storage**
   - Why it matters: data exposure incidents are the most expensive to remediate
   - Key controls: HTTPS-only transfer, blob soft delete enabled, private endpoints for storage, encryption at rest (enabled by default but verify key management)
   - Common violations: HTTP access enabled, no soft delete, public blob access
   - Remediation: enforce HTTPS via policy, enable soft delete with 30-day retention minimum, disable anonymous blob access at the account level

   **Identity**
   - Why it matters: identity is the control plane. Compromised identity means compromised everything.
   - Key controls: MFA enforced for all users, no standing privileged access (use PIM), service principals with certificate auth not secrets, guest access reviewed quarterly
   - Common violations: service principals with password credentials, no conditional access policies, stale guest accounts
   - Remediation: rotate to certificate-based auth for service principals, implement conditional access baseline, audit and remove stale guests

   **Compute**
   - Why it matters: VMs are the largest attack surface in most Azure environments
   - Key controls: endpoint protection installed, OS updates applied, diagnostic settings configured, managed disks with encryption, no classic VMs
   - Common violations: no monitoring agent, missing tags (ownership/cost center), unattached disks
   - Remediation: deploy Azure Monitor Agent via policy, enforce tagging via policy (deny mode for new resources, audit for existing), clean up orphaned disks

   **Logging and Monitoring**
   - Why it matters: you cannot respond to what you cannot see
   - Key controls: activity log exported to Log Analytics, diagnostic settings on all critical resources, alerts configured for security events, Azure Defender (Microsoft Defender for Cloud) enabled
   - Common violations: no diagnostic settings on Key Vault, no activity log export, Defender disabled on subscription
   - Remediation: deploy diagnostic settings via policy initiative, enable Defender for Cloud at subscription level (start with free tier)

3. **Prioritization Framework**
   - Tier 1 (fix this week): open network access, missing encryption, identity gaps
   - Tier 2 (fix this month): missing monitoring, tagging gaps, soft delete not enabled
   - Tier 3 (plan for next quarter): advanced controls, PIM rollout, custom policy authoring

4. **Common Misconceptions**
   - "We're compliant" does not mean "we're secure." Compliance is the floor, not the ceiling.
   - Policy in audit mode is informational, not enforcement. It tells you what's wrong but does not prevent it.
   - Tagging is not just for cost management. It is the foundation for ownership, incident response, and automation targeting.
   - A governance baseline is not a one-time project. It is an operational practice with continuous evaluation.

---

## Component 5: React Frontend

### Purpose
Minimal web app that embeds the Napster Web SDK to render the agent's video avatar and handle the voice conversation.

### Tech Stack
- React (Vite scaffold)
- Napster Web SDK (`@anthropic/web-sdk` or whatever the SDK package is - check docs)
- No UI framework needed. This is deliberately minimal. The agent is the interface.

### Page Layout
Single page. Clean. The video avatar takes center stage.

```
+-----------------------------------------------+
|  Azure Governance Baseline Advisor             |
|                                                |
|        +------------------------+              |
|        |                        |              |
|        |    Video Avatar         |              |
|        |    (WebRTC)            |              |
|        |                        |              |
|        +------------------------+              |
|                                                |
|   [ Start Assessment ]   [ End Session ]       |
|                                                |
|   Status: Connected / Speaking / Listening     |
+-----------------------------------------------+
```

### Implementation
Follow the Napster Web SDK docs for WebRTC integration:
https://developers.napster.com/docs/deploying-your-omniagent/channels/webrtc

Key steps:
1. Import the SDK
2. Create a connection using `POST /public/agents/{agentId}/connections` with `channelType: "webrtc"`
3. Mount the companion in a DOM container
4. Handle session lifecycle (connect, disconnect, errors)

### Environment Variables
```
VITE_NAPSTER_API_KEY=<your-api-key>
VITE_AGENT_ID=<your-agent-id>
```

**Important:** For the hackathon, having the API key client-side is acceptable. In production you'd proxy through a backend. Don't waste time on that now.

### Hosting
`npm run build` and host on Azure Static Web Apps for zero-config deployment. Or just run `npm run dev` locally for the demo. Don't waste time on hosting if you're demoing from your laptop.

---

## Build Order (Critical Path)

Execute in this order. Each step unblocks the next.

### Phase 1: Azure Infrastructure (Friday night)
1. Create resource group `rg-governance-demo`
2. Write and deploy `infra/main.bicep` with all demo resources
3. Assign Azure Security Benchmark initiative at subscription level
4. Trigger policy evaluation scan
5. Verify compliance results populate in Azure Portal (Policy > Compliance)

### Phase 2: Azure Function (Saturday morning)
1. Scaffold Azure Function project (TypeScript, HTTP trigger)
2. Implement Resource Graph query logic
3. Test locally against your subscription using `az login` creds
4. Deploy to Azure
5. Test the deployed endpoint with curl
6. Grab the function URL + key for the Napster tool definition

### Phase 3: Napster Agent Assembly (Saturday afternoon)
1. Create Napster resource in Azure Portal (Marketplace)
2. Generate API key
3. Create companion via API
4. Upload knowledge base document
5. Create FAQ collection
6. Register the policy check tool (pointing to your Azure Function URL)
7. Assemble the Omniagent
8. Test everything in the Napster Playground (no code needed)
9. Iterate on system prompt based on Playground testing

### Phase 4: Frontend (Sunday morning)
1. Scaffold React app with Vite
2. Integrate Napster Web SDK
3. Wire up connection to your agent
4. Basic styling (dark theme, centered avatar, status indicator)
5. Test end-to-end: start conversation, trigger tool call, verify findings come back

### Phase 5: Demo Polish (Sunday afternoon)
1. Rehearse the demo narrative end-to-end
2. Test edge cases: what if the tool returns no findings? What if they ask about a category with no violations?
3. Test persistent memory: end session, start new one, verify the agent remembers prior context
4. Record a backup video in case of live demo issues
5. Write submission description

---

## File Structure

```
azure-governance-advisor/
  infra/
    main.bicep                    # All demo Azure resources
  function/
    package.json
    tsconfig.json
    host.json
    src/
      functions/
        policy-check.ts           # HTTP trigger function
      lib/
        resource-graph.ts         # Resource Graph query logic
        severity-map.ts           # Policy-to-severity lookup table
  frontend/
    package.json
    vite.config.ts
    src/
      App.tsx                     # Main app with SDK integration
      components/
        AgentView.tsx             # Avatar container + controls
        StatusBar.tsx             # Connection status display
  knowledge/
    governance-baseline-framework.md   # Knowledge base content
  README.md
```

---

## Judging Criteria (Inferred)

Based on typical hackathon scoring and Napster's platform positioning, optimize for:

1. **Use of platform differentiators**: video avatar, persistent memory, tool integration, multi-channel. You're hitting all of them except SIP (skip SIP unless you have extra time).
2. **Technical depth of tool integration**: A live query against real Azure infrastructure is dramatically more impressive than a mock response.
3. **Quality of the conversation**: The system prompt and knowledge base determine whether this feels like a senior architect or a chatbot reading docs. Invest time here.
4. **Practical value**: Judges should watch the demo and think "I would actually use this." Your practitioner credibility is what makes that land.
5. **Polish**: A clean, minimal frontend that gets out of the way. Don't distract from the agent.

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Azure Policy evaluation not complete by demo time | Trigger on-demand scan. Have a fallback with pre-populated mock data in the Azure Function. |
| Napster API key / quota issues | Apply for hackathon credits early. Have the Napster-hosted model option as backup (more expensive per minute but no BYOM setup). |
| Azure Function not reachable from Napster infra | Test early Saturday. If firewall issues, use ngrok as temporary tunnel. |
| Tool call returns empty results | Handle gracefully in system prompt: "If the tool returns no violations for a category, tell the customer their environment is clean for that area. Do not make up findings." |
| Knowledge base not grounding answers well | Test in Playground Saturday afternoon. If RAG retrieval is weak, move critical content into the system prompt directly. System prompt always wins over RAG for reliability. |
| Video avatar latency or quality issues | This is Napster's infrastructure, you can't control it. Have the WebSocket (audio-only) channel as a fallback. |

---

## Environment Variables Summary

```bash
# Azure
AZURE_SUBSCRIPTION_ID=<your-sub-id>
AZURE_RESOURCE_GROUP=rg-governance-demo

# Azure Function
AZURE_FUNCTION_URL=https://<func-app>.azurewebsites.net/api/policy-check
AZURE_FUNCTION_KEY=<function-level-auth-key>

# Napster
NAPSTER_API_KEY=<your-napster-api-key>
NAPSTER_AGENT_ID=<your-agent-id>
NAPSTER_COMPANION_ID=<your-companion-id>
NAPSTER_KNOWLEDGE_BASE_ID=<your-kb-id>
NAPSTER_TOOL_ID=<your-tool-id>
NAPSTER_FAQ_COLLECTION_ID=<your-faq-collection-id>
```
