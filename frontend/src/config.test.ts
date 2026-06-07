/**
 * Example/unit tests for {@link readConfig} (Requirements 15.8, 15.9).
 *
 * Verifies the frontend reads the Napster API key and agent identifier from
 * `VITE_`-prefixed environment values, and returns `null` whenever either is
 * absent or blank so the UI can surface the missing-configuration error.
 */

import { describe, expect, it } from "vitest";
import { readConfig } from "./config";

describe("readConfig", () => {
  it("reads VITE_ env vars into a resolved config (15.8)", () => {
    const config = readConfig({
      VITE_NAPSTER_API_KEY: "key-123",
      VITE_AGENT_ID: "agent-abc",
    });
    expect(config).toEqual({ apiKey: "key-123", agentId: "agent-abc" });
  });

  it("trims surrounding whitespace from values", () => {
    const config = readConfig({
      VITE_NAPSTER_API_KEY: "  key-123  ",
      VITE_AGENT_ID: "\tagent-abc\n",
    });
    expect(config).toEqual({ apiKey: "key-123", agentId: "agent-abc" });
  });

  it("returns null when the API key is absent (15.9)", () => {
    expect(readConfig({ VITE_AGENT_ID: "agent-abc" })).toBeNull();
  });

  it("returns null when the agent id is absent (15.9)", () => {
    expect(readConfig({ VITE_NAPSTER_API_KEY: "key-123" })).toBeNull();
  });

  it("returns null when both values are absent (15.9)", () => {
    expect(readConfig({})).toBeNull();
  });

  it("treats whitespace-only values as absent (15.9)", () => {
    expect(
      readConfig({ VITE_NAPSTER_API_KEY: "   ", VITE_AGENT_ID: "agent-abc" }),
    ).toBeNull();
  });
});
