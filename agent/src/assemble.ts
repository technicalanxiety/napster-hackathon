//! Entry point: assembles the "Morgan Cole" Azure Governance Baseline Advisor
//! agent on the Napster Omniagent platform.
//!
//! Reads secrets/endpoints from environment variables, loads the governance
//! knowledge base document and FAQ content from the repo's `knowledge/`
//! directory, then drives the platform API in order:
//!   1. create the companion persona,
//!   2. create the knowledge base and upload the framework document,
//!   3. register the `check_policy_compliance` tool,
//!   4. create the FAQ collection,
//!   5. assemble the agent wiring tool + KB + FAQ, voice, avatar, memory, and
//!      a fixed temperature of 0.4.
//!
//! The pure payload-building logic lives in `config.ts`; this file only handles
//! environment input, file loading, and sequencing the network calls.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildAgentPayload,
  buildCompanionPayload,
  buildFaqCollectionPayload,
  buildKnowledgeBasePayload,
  buildToolPayload,
} from "./config";
import { NapsterClient } from "./napster-client";
import type { FaqEntry } from "./types";

/** Shape of the FAQ content file (`knowledge/faq.json`). */
interface FaqFile {
  faqs: FaqEntry[];
}

/** A created Napster resource; the platform returns at least an `id`. */
interface CreatedResource {
  id: string;
}

/**
 * Runtime configuration resolved from environment variables.
 */
interface Environment {
  /** Napster API key (`X-Api-Key`). */
  apiKey: string;
  /** Base Policy Function endpoint URL. */
  functionEndpoint: string;
  /** Policy Function authorization key embedded as `?code=`. */
  functionKey: string;
  /** Optional override for the Napster API base URL. */
  baseUrl?: string;
  /** Directory containing the knowledge base + FAQ content. */
  knowledgeDir: string;
}

/** Read a required environment variable or throw a clear error. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Resolve all runtime configuration from the environment.
 *
 * Defaults the knowledge directory to the repo's `knowledge/` folder relative
 * to this compiled script (`agent/dist` -> repo root -> `knowledge`).
 */
export function resolveEnvironment(): Environment {
  const defaultKnowledgeDir = resolve(__dirname, "..", "..", "knowledge");
  return {
    apiKey: requireEnv("NAPSTER_API_KEY"),
    functionEndpoint: requireEnv("POLICY_FUNCTION_ENDPOINT"),
    functionKey: requireEnv("POLICY_FUNCTION_KEY"),
    baseUrl: process.env.NAPSTER_BASE_URL,
    knowledgeDir: process.env.KNOWLEDGE_DIR ?? defaultKnowledgeDir,
  };
}

/** Load and parse the FAQ entries from `knowledge/faq.json`. */
function loadFaqs(knowledgeDir: string): FaqEntry[] {
  const raw = readFileSync(resolve(knowledgeDir, "faq.json"), "utf-8");
  const parsed = JSON.parse(raw) as FaqFile;
  if (!Array.isArray(parsed.faqs)) {
    throw new Error("knowledge/faq.json must contain a 'faqs' array");
  }
  return parsed.faqs;
}

/** Load the governance baseline framework markdown document. */
function loadKnowledgeDocument(knowledgeDir: string): string {
  return readFileSync(resolve(knowledgeDir, "governance-baseline-framework.md"), "utf-8");
}

/**
 * Drive the full assembly sequence against the Napster platform.
 *
 * Each step depends on the identifier returned by the previous one, so the
 * calls run sequentially. Returns the assembled agent id.
 *
 * @param env Resolved runtime configuration.
 * @param client The authenticated Napster client to use.
 */
export async function assemble(env: Environment, client: NapsterClient): Promise<string> {
  // 1. Companion persona (Morgan Cole, senior governance architect).
  const companion = await client.postJson<CreatedResource>(
    "/public/companions",
    buildCompanionPayload(),
  );
  console.log(`Created companion ${companion.id} (Morgan Cole)`);

  // 2. Knowledge base + framework document upload.
  const knowledgeBase = await client.postJson<CreatedResource>(
    "/public/knowledge-bases",
    buildKnowledgeBasePayload(),
  );
  const document = loadKnowledgeDocument(env.knowledgeDir);
  await client.postFile<CreatedResource>(
    `/public/knowledge-bases/${knowledgeBase.id}/files`,
    "governance-baseline-framework.md",
    document,
    "text/markdown",
  );
  console.log(`Created knowledge base ${knowledgeBase.id} and uploaded framework document`);

  // 3. Tool registration (check_policy_compliance, explicit flow).
  const tool = await client.postJson<CreatedResource>(
    "/public/functions",
    buildToolPayload(env.functionEndpoint, env.functionKey),
  );
  console.log(`Registered tool ${tool.id} (check_policy_compliance)`);

  // 4. FAQ collection.
  const faqs = loadFaqs(env.knowledgeDir);
  const faqCollection = await client.postJson<CreatedResource>(
    "/public/faqs",
    buildFaqCollectionPayload(faqs),
  );
  console.log(`Created FAQ collection ${faqCollection.id} with ${faqs.length} entries`);

  // 5. Assemble the agent wiring everything together.
  const agent = await client.postJson<CreatedResource>(
    "/public/agents",
    buildAgentPayload({
      companionId: companion.id,
      knowledgeBaseId: knowledgeBase.id,
      toolId: tool.id,
      faqCollectionId: faqCollection.id,
    }),
  );
  console.log(`Assembled agent ${agent.id}`);
  return agent.id;
}

/** Script entry: resolve config, build the client, run the assembly. */
async function main(): Promise<void> {
  const env = resolveEnvironment();
  const client = new NapsterClient({ apiKey: env.apiKey, baseUrl: env.baseUrl });
  const agentId = await assemble(env, client);
  console.log(`\nDone. AGENT_ID=${agentId}`);
}

// Only run when executed directly (not when imported by tests).
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error("Agent assembly failed:", error);
    process.exitCode = 1;
  });
}
