/**
 * Unit tests for the Severity_Mapper (`severityFor`).
 *
 * These example-based tests complement the property test in
 * `severity-map.property.test.ts`. They pin the known high/medium/low policy
 * names to their expected severities (Requirements 6.2, 6.3, 6.4) and verify
 * that a policy name matching more than one severity tier resolves to the
 * highest tier under the precedence order `high > medium > low`
 * (Requirement 6.7).
 */

import { describe, it, expect } from "vitest";
import { severityFor } from "./severity-map";

describe("severityFor — known high-severity policies (Req 6.2)", () => {
  // Open network access to 0.0.0.0/0, missing encryption, or missing Key Vault
  // purge protection map to `high`.
  it.each([
    // --- known built-in policy definition GUIDs ---
    ["22730e10-96f6-4aac-ad84-9383d35b5917", "Management ports closed"],
    ["e372f825-a257-4fb8-9175-797a8a8627d6", "RDP from Internet blocked"],
    ["404c3081-a854-4457-ae30-26a93ef643f9", "Secure transfer to storage"],
    ["0b60c0b2-2dc2-4e1c-b5c9-abbed971de53", "Key vault purge protection"],
    // --- descriptive display names (keyword fallback) ---
    ["Inbound access from 0.0.0.0/0 should be restricted", "open network access"],
    ["RDP access from the Internet should be blocked", "rdp/internet"],
    ["Management port should be closed", "management port"],
    ["Secure transfer to storage accounts should be enabled", "secure transfer"],
    ["Storage accounts should use encryption", "encryption"],
    ["Key vaults should have purge protection enabled", "purge protection"],
  ])("maps %s (%s) to high", (policyName) => {
    expect(severityFor(policyName)).toBe("high");
  });
});

describe("severityFor — known medium-severity policies (Req 6.3)", () => {
  // Missing diagnostic settings, disabled soft delete, or missing tags map to
  // `medium`.
  it.each([
    // --- known built-in policy definition GUIDs ---
    ["b7ddfbdc-1260-477d-91fd-98bd9be789a6", "Blob soft delete"],
    ["7f89b1eb-583c-429a-8828-af049802c1d9", "Audit diagnostic setting"],
    ["871b6d14-10aa-478d-b590-94f262ecfa99", "Require a tag"],
    // --- descriptive display names (keyword fallback) ---
    ["Audit diagnostic setting for selected resource types", "diagnostic setting"],
    ["Storage accounts should have blob soft delete enabled", "soft delete"],
    ["Require a tag on resources", "missing tag"],
  ])("maps %s (%s) to medium", (policyName) => {
    expect(severityFor(policyName)).toBe("medium");
  });
});

describe("severityFor — informational / naming-convention policies (Req 6.4)", () => {
  // Informational or naming-convention policies map to `low`.
  it.each([
    ["Resource naming convention should be followed", "naming convention"],
    ["Informational guidance policy", "informational"],
  ])("maps %s (%s) to low", (policyName) => {
    expect(severityFor(policyName)).toBe("low");
  });
});

describe("severityFor — multi-tier precedence high > medium > low (Req 6.7)", () => {
  it("resolves a name matching both high and medium tiers to high", () => {
    // Contains "diagnostic setting" (medium) AND "encryption" (high) -> high.
    expect(
      severityFor("Audit diagnostic setting for storage encryption"),
    ).toBe("high");
  });

  it("resolves a name matching both high and low tiers to high", () => {
    // Contains "naming" (low) AND "purge protection" (high) -> high.
    expect(
      severityFor("Key vault purge protection naming standard"),
    ).toBe("high");
  });

  it("resolves a name matching both medium and low tiers to medium", () => {
    // Contains "naming" (low) AND "tag" (medium) -> medium.
    expect(severityFor("Require a tag for the resource naming policy")).toBe(
      "medium",
    );
  });

  it("resolves a name matching all three tiers to high", () => {
    // Contains "naming" (low), "soft delete" (medium), and "0.0.0.0" (high).
    expect(
      severityFor("Naming policy: soft delete and 0.0.0.0 access"),
    ).toBe("high");
  });
});
