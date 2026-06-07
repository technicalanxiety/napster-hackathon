//! Pure config-building logic for the Napster Omniagent assembly.
//!
//! Every function here is a pure builder: given inputs (ids, the function
//! endpoint/key, FAQ entries) it returns the exact request payload that will
//! be POSTed to the Napster public API. No network or environment access lives
//! in this module so the assembled payloads can be unit-tested directly
//! (task 11.2 asserts companion name/role, temperature, tool name/flow/params/
//! url, and the agent's tool + KB + FAQ associations).

import { SYSTEM_PROMPT } from "./system-prompt";
import type {
  AgentPayload,
  AssembledIds,
  CompanionPayload,
  FaqCollectionPayload,
  FaqEntry,
  KnowledgeBasePayload,
  ToolPayload,
} from "./types";

/** Canonical persona identity for the advisor (Req 9.1). */
export const COMPANION_FIRST_NAME = "Morgan";
export const COMPANION_LAST_NAME = "Cole";

/** Registered tool name the model invokes (Req 12.1). */
export const TOOL_NAME = "check_policy_compliance";

/** Accepted `category` parameter values (Req 12.2). */
export const CATEGORY_VALUES = [
  "all",
  "networking",
  "storage",
  "identity",
  "compute",
  "logging",
] as const;

/** Accepted `severity` parameter values (Req 12.2). */
export const SEVERITY_VALUES = ["all", "high", "medium", "low"] as const;

/** Model temperature pinned by the design (Req 9.5). */
export const AGENT_TEMPERATURE = 0.4;

/** Platform voice identifier used for spoken responses (Req 9.4). */
export const VOICE_ID = "echo";

/** Conversation language. */
export const LANGUAGE = "English";

/**
 * Build the companion creation payload for `POST /public/companions`.
 *
 * Establishes the "Morgan Cole" senior Azure governance architect persona
 * (Req 9.1, 9.2).
 */
export function buildCompanionPayload(): CompanionPayload {
  return {
    firstName: COMPANION_FIRST_NAME,
    lastName: COMPANION_LAST_NAME,
    description:
      "Senior Azure governance architect with deep experience assessing " +
      "subscriptions against governance baselines. Morgan reviews Azure Policy " +
      "compliance across networking, storage, identity, compute, and logging, " +
      "explains why each gap matters, and recommends practical, prioritized " +
      "remediation. Authoritative and pragmatic, never alarmist.",
  };
}

/**
 * Build the knowledge base creation payload for `POST /public/knowledge-bases`.
 *
 * The governance baseline framework document is uploaded separately to the
 * `/files` sub-resource after the base is created (Req 10.4).
 */
export function buildKnowledgeBasePayload(): KnowledgeBasePayload {
  return {
    name: "Azure Governance Baseline Framework",
    description:
      "Governance baseline covering networking, storage, identity, compute, " +
      "and logging — key controls, common violations, remediation guidance, " +
      "and a high/medium/low prioritization framework.",
  };
}

/**
 * Compose the tool invocation URL from the Policy Function endpoint and its
 * function authorization key (Req 12.3).
 *
 * The key is embedded as the `code` query parameter, matching the Azure
 * Functions function-level auth convention and the explicit-flow contract.
 * Any existing query string on the endpoint is preserved.
 *
 * @param functionEndpoint Base Policy Function URL (e.g. `https://app.azurewebsites.net/api/policy-check`).
 * @param functionKey The function-level authorization key.
 */
export function buildToolUrl(functionEndpoint: string, functionKey: string): string {
  const separator = functionEndpoint.includes("?") ? "&" : "?";
  return `${functionEndpoint}${separator}code=${encodeURIComponent(functionKey)}`;
}

/**
 * Build the tool registration payload for `POST /public/functions`.
 *
 * Registers `check_policy_compliance` with an explicit flow, the enumerated
 * `category`/`severity` parameters, and the Policy Function URL carrying the
 * function key (Req 12.1, 12.2, 12.3).
 *
 * @param functionEndpoint Base Policy Function URL.
 * @param functionKey The function-level authorization key.
 */
export function buildToolPayload(functionEndpoint: string, functionKey: string): ToolPayload {
  return {
    name: TOOL_NAME,
    description:
      "Retrieves live Azure Policy compliance findings for the environment. " +
      "Call this before stating any compliance finding. Optionally filter by " +
      "category and severity; omit or pass 'all' for no restriction.",
    flow: "explicit",
    method: "POST",
    url: buildToolUrl(functionEndpoint, functionKey),
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [...CATEGORY_VALUES],
          description:
            "Governance category to assess. Use 'all' for a full baseline review.",
        },
        severity: {
          type: "string",
          enum: [...SEVERITY_VALUES],
          description:
            "Severity filter. Use 'all' to include findings of every severity.",
        },
      },
      required: [],
    },
  };
}

/**
 * Build the FAQ collection payload for `POST /public/faqs`.
 *
 * @param faqs The FAQ entries loaded from `knowledge/faq.json` (Req 11.1, 11.2).
 */
export function buildFaqCollectionPayload(faqs: FaqEntry[]): FaqCollectionPayload {
  return {
    name: "Azure Governance FAQ",
    description:
      "Consistent answers to common Azure governance questions used to keep " +
      "the advisor's responses stable across sessions.",
    faqs,
  };
}

/**
 * Build the final agent assembly payload for `POST /public/agents`.
 *
 * Wires the companion persona to voice, video avatar, persistent memory, the
 * registered tool, the knowledge base, and the FAQ collection, and pins the
 * model temperature to 0.4 and the system prompt (Req 9.5, 10.4, 11.3, 12.6).
 *
 * @param ids The identifiers returned by the companion, KB, tool, and FAQ steps.
 */
export function buildAgentPayload(ids: AssembledIds): AgentPayload {
  return {
    name: "Azure Governance Baseline Advisor",
    companionId: ids.companionId,
    voiceId: VOICE_ID,
    language: LANGUAGE,
    avatar: { enabled: true },
    memory: { enabled: true },
    functions: [ids.toolId],
    faqCollections: [ids.faqCollectionId],
    knowledgeBaseId: ids.knowledgeBaseId,
    systemPrompt: SYSTEM_PROMPT,
    providerSettings: { temperature: AGENT_TEMPERATURE },
  };
}
