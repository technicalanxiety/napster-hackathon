//! Payload and identifier types for the Napster Omniagent assembly.
//!
//! These types describe the exact request bodies sent to the Napster public
//! API (`https://companion-api.napster.com`) when assembling the Azure
//! Governance Baseline Advisor agent "Morgan Cole". They are kept separate
//! from the network layer so the config-building logic can be unit-tested in
//! isolation (see task 11.2).

/** A single frequently-asked-question entry: exactly one question, one answer. */
export interface FaqEntry {
  /** The user-facing question text. */
  question: string;
  /** The single canonical answer returned for this question. */
  answer: string;
}

/**
 * Request body for `POST /public/companions`.
 *
 * The companion carries the persona identity ("Morgan Cole", a senior Azure
 * governance architect) that the assembled agent speaks as.
 */
export interface CompanionPayload {
  /** Persona given name. */
  firstName: string;
  /** Persona family name. */
  lastName: string;
  /** Persona role/biography describing the senior governance architect. */
  description: string;
}

/**
 * Request body for `POST /public/knowledge-bases`.
 *
 * The knowledge base holds the governance baseline framework document that
 * grounds the agent's "why it matters" explanations.
 */
export interface KnowledgeBasePayload {
  /** Human-readable name of the knowledge base. */
  name: string;
  /** Short description of the knowledge base contents. */
  description: string;
}

/**
 * JSON-schema-style parameter declaration for a tool's enumerated argument.
 */
export interface ToolEnumParameter {
  /** Always `"string"` for the category/severity enums. */
  type: "string";
  /** The exact set of accepted values for this parameter. */
  enum: string[];
  /** Description shown to the model to guide argument selection. */
  description: string;
}

/** The `parameters` object of a registered tool, in JSON-schema form. */
export interface ToolParameters {
  type: "object";
  properties: {
    category: ToolEnumParameter;
    severity: ToolEnumParameter;
  };
  /** Both parameters are optional; the Function defaults absent values to "all". */
  required: string[];
}

/**
 * Request body for `POST /public/functions` (tool registration).
 *
 * Registers `check_policy_compliance` with an explicit invocation flow that
 * issues an HTTPS POST to the Policy Function endpoint, with the function
 * authorization key embedded as the `code` query parameter on the URL.
 */
export interface ToolPayload {
  /** Tool identifier the model invokes: `check_policy_compliance`. */
  name: string;
  /** Description telling the model when and why to call the tool. */
  description: string;
  /** Explicit flow => the platform performs the HTTPS call to `url`. */
  flow: "explicit";
  /** HTTP method used to invoke the Policy Function. */
  method: "POST";
  /** Full Policy Function endpoint including `?code=<function-key>`. */
  url: string;
  /** Enumerated `category` and `severity` parameters. */
  parameters: ToolParameters;
}

/**
 * Request body for `POST /public/faqs` (FAQ collection creation).
 */
export interface FaqCollectionPayload {
  /** Human-readable name of the FAQ collection. */
  name: string;
  /** Short description of the collection. */
  description: string;
  /** The FAQ entries; each pairs exactly one question with one answer. */
  faqs: FaqEntry[];
}

/** Provider-level model settings; temperature is fixed at 0.4 by design. */
export interface ProviderSettings {
  /** Model temperature, exactly 0.4 per Requirement 9.5. */
  temperature: number;
}

/** Toggle for a platform-managed agent feature (avatar, memory). */
export interface FeatureToggle {
  enabled: boolean;
}

/**
 * Request body for `POST /public/agents` (final agent assembly).
 *
 * Wires the companion persona to the voice, video avatar, persistent memory,
 * registered tool, knowledge base, and FAQ collection, and pins the model
 * temperature and system prompt.
 */
export interface AgentPayload {
  /** Human-readable agent name. */
  name: string;
  /** Identifier of the companion created via `POST /public/companions`. */
  companionId: string;
  /** Platform voice identifier used for spoken responses. */
  voiceId: string;
  /** Conversation language. */
  language: string;
  /** Video avatar feature toggle (presented while a session is active). */
  avatar: FeatureToggle;
  /** Persistent cross-session memory feature toggle. */
  memory: FeatureToggle;
  /** Registered tool identifiers associated with the agent. */
  functions: string[];
  /** FAQ collection identifiers associated with the agent. */
  faqCollections: string[];
  /** Associated knowledge base identifier. */
  knowledgeBaseId: string;
  /** The system prompt enforcing tool-before-claims and grounding discipline. */
  systemPrompt: string;
  /** Provider settings, including the fixed temperature. */
  providerSettings: ProviderSettings;
}

/**
 * The four identifiers produced by the intermediate assembly steps, consumed
 * by {@link AgentPayload} construction.
 */
export interface AssembledIds {
  companionId: string;
  knowledgeBaseId: string;
  toolId: string;
  faqCollectionId: string;
}
