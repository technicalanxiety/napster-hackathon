//! Tests for the pure config builders in `config.ts` (task 11.2).
//!
//! These assertions lock down the exact payloads POSTed to the Napster public
//! API during agent assembly: the "Morgan Cole" senior governance architect
//! persona, the model temperature pinned at 0.4, the `check_policy_compliance`
//! tool (explicit flow, enumerated category/severity params, function URL with
//! its `code` key), and the final agent's tool + knowledge base + FAQ
//! associations.

import { describe, it, expect } from "vitest";
import {
  buildCompanionPayload,
  buildKnowledgeBasePayload,
  buildToolPayload,
  buildToolUrl,
  buildFaqCollectionPayload,
  buildAgentPayload,
  AGENT_TEMPERATURE,
  TOOL_NAME,
  CATEGORY_VALUES,
  SEVERITY_VALUES,
} from "./config";
import { SYSTEM_PROMPT } from "./system-prompt";
import type { AssembledIds, FaqEntry } from "./types";

const FUNCTION_ENDPOINT = "https://policy-fn.azurewebsites.net/api/policy-check";
const FUNCTION_KEY = "abc123-secret-key";

const SAMPLE_IDS: AssembledIds = {
  companionId: "companion-1",
  knowledgeBaseId: "kb-1",
  toolId: "tool-1",
  faqCollectionId: "faq-1",
};

describe("buildCompanionPayload", () => {
  it("uses the persona name Morgan Cole (Req 9.1)", () => {
    const payload = buildCompanionPayload();
    expect(payload.firstName).toBe("Morgan");
    expect(payload.lastName).toBe("Cole");
  });

  it("describes the senior Azure governance architect role (Req 9.2)", () => {
    const payload = buildCompanionPayload();
    expect(payload.description.toLowerCase()).toContain(
      "senior azure governance architect"
    );
  });
});

describe("buildKnowledgeBasePayload", () => {
  it("produces a named, described knowledge base for association (Req 10.4)", () => {
    const payload = buildKnowledgeBasePayload();
    expect(payload.name).toBeTruthy();
    expect(payload.description).toBeTruthy();
  });
});

describe("buildToolUrl (Req 12.3)", () => {
  it("appends the function key as the code query parameter", () => {
    const url = buildToolUrl(FUNCTION_ENDPOINT, FUNCTION_KEY);
    expect(url).toBe(`${FUNCTION_ENDPOINT}?code=${FUNCTION_KEY}`);
    expect(url).toContain(FUNCTION_ENDPOINT);
    expect(url).toContain(`code=${FUNCTION_KEY}`);
  });

  it("uses & when the endpoint already has a query string", () => {
    const endpointWithQuery = `${FUNCTION_ENDPOINT}?clientId=42`;
    const url = buildToolUrl(endpointWithQuery, FUNCTION_KEY);
    expect(url).toBe(`${endpointWithQuery}&code=${FUNCTION_KEY}`);
  });

  it("url-encodes a key containing reserved characters", () => {
    const url = buildToolUrl(FUNCTION_ENDPOINT, "a+b/c=d");
    expect(url).toBe(`${FUNCTION_ENDPOINT}?code=a%2Bb%2Fc%3Dd`);
  });
});

describe("buildToolPayload (Req 12.1, 12.2, 12.3)", () => {
  const payload = buildToolPayload(FUNCTION_ENDPOINT, FUNCTION_KEY);

  it("registers the check_policy_compliance tool with an explicit flow", () => {
    expect(payload.name).toBe("check_policy_compliance");
    expect(payload.name).toBe(TOOL_NAME);
    expect(payload.flow).toBe("explicit");
    expect(payload.method).toBe("POST");
  });

  it("targets the function endpoint with the code key", () => {
    expect(payload.url).toBe(`${FUNCTION_ENDPOINT}?code=${FUNCTION_KEY}`);
  });

  it("declares the enumerated category parameter", () => {
    const category = payload.parameters.properties.category;
    expect(category.type).toBe("string");
    expect(category.enum).toEqual([
      "all",
      "networking",
      "storage",
      "identity",
      "compute",
      "logging",
    ]);
    expect(category.enum).toEqual([...CATEGORY_VALUES]);
  });

  it("declares the enumerated severity parameter", () => {
    const severity = payload.parameters.properties.severity;
    expect(severity.type).toBe("string");
    expect(severity.enum).toEqual(["all", "high", "medium", "low"]);
    expect(severity.enum).toEqual([...SEVERITY_VALUES]);
  });

  it("makes both parameters optional", () => {
    expect(payload.parameters.type).toBe("object");
    expect(payload.parameters.required).toEqual([]);
  });
});

describe("buildFaqCollectionPayload (Req 11.3)", () => {
  it("carries through the provided FAQ entries", () => {
    const faqs: FaqEntry[] = [
      { question: "What is Azure Policy?", answer: "A governance service." },
      { question: "What is a policy baseline?", answer: "A set of controls." },
    ];
    const payload = buildFaqCollectionPayload(faqs);
    expect(payload.name).toBeTruthy();
    expect(payload.faqs).toEqual(faqs);
  });
});

describe("buildAgentPayload", () => {
  const payload = buildAgentPayload(SAMPLE_IDS);

  it("pins the model temperature to exactly 0.4 (Req 9.5)", () => {
    expect(payload.providerSettings.temperature).toBe(0.4);
    expect(payload.providerSettings.temperature).toBe(AGENT_TEMPERATURE);
  });

  it("associates the registered tool (Req 12.6)", () => {
    expect(payload.functions).toEqual([SAMPLE_IDS.toolId]);
  });

  it("associates the knowledge base (Req 10.4, 12.6)", () => {
    expect(payload.knowledgeBaseId).toBe(SAMPLE_IDS.knowledgeBaseId);
  });

  it("associates the FAQ collection (Req 11.3, 12.6)", () => {
    expect(payload.faqCollections).toEqual([SAMPLE_IDS.faqCollectionId]);
  });

  it("wires the companion and the system prompt", () => {
    expect(payload.companionId).toBe(SAMPLE_IDS.companionId);
    expect(payload.systemPrompt).toBe(SYSTEM_PROMPT);
  });
});
