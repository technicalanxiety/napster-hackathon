import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

// =============================================================================
// Bicep synthesis / snapshot tests for the demo Azure environment.
//
// APPROACH: source-text assertions (not compiled ARM JSON).
//   The `az` and `bicep` CLIs are NOT installed in this environment, so
//   `az bicep build` cannot be run to compile the templates to ARM JSON.
//   Instead these tests parse the .bicep SOURCE TEXT directly and assert the
//   required resources, key properties, naming tokens, the built-in initiative
//   GUID, and the exact role-definition GUIDs. A lightweight brace-matching
//   helper isolates each `resource <symbol> '<type>@<api>' = { ... }` block so
//   property assertions are scoped to the correct resource rather than matched
//   loosely across the whole file.
//
// Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11,
//            1.12, 1.13, 1.14, 2.1, 8.1, 8.2, 8.3, 8.4
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainBicep = readFileSync(join(__dirname, "main.bicep"), "utf8");
const resourcesBicep = readFileSync(join(__dirname, "resources.bicep"), "utf8");

/** Built-in role / initiative GUIDs the template must reference exactly. */
const READER_ROLE_ID = "acdd72a7-3385-48ef-bd42-f606fba81ae7";
const RESOURCE_POLICY_READER_ROLE_ID = "36243c78-bf99-498c-9df9-86d9f8d28608";
const AZURE_SECURITY_BENCHMARK_INITIATIVE_ID =
  "1f3afdf9-d0c9-4c3d-847f-89da613e70a8";

/**
 * Extracts the body of a `resource <symbol> '<type>@<api>' = ... { ... }`
 * declaration by matching braces from the first `{` after the symbol. Returns
 * the inner text (between the outermost braces) or "" if the symbol is absent.
 */
function resourceBlock(bicep: string, symbol: string): string {
  const declRe = new RegExp(`resource\\s+${symbol}\\s+'[^']+'\\s*=`);
  const declMatch = declRe.exec(bicep);
  if (!declMatch) return "";
  const start = bicep.indexOf("{", declMatch.index);
  if (start === -1) return "";
  let depth = 0;
  for (let i = start; i < bicep.length; i++) {
    const ch = bicep[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return bicep.slice(start + 1, i);
    }
  }
  return "";
}

/** Returns the resource TYPE string declared for a given symbol, or "". */
function resourceType(bicep: string, symbol: string): string {
  const m = new RegExp(`resource\\s+${symbol}\\s+'([^']+)'\\s*=`).exec(bicep);
  return m ? m[1] : "";
}

// -----------------------------------------------------------------------------

describe("Bicep template: scope and resource group (Req 1.1)", () => {
  it("main.bicep targets subscription scope", () => {
    expect(mainBicep).toMatch(/targetScope\s*=\s*'subscription'/);
  });

  it("deploys all demo resources into resource group rg-governance-demo (Req 1.1)", () => {
    expect(mainBicep).toMatch(/resourceGroupName\s*=\s*'rg-governance-demo'/);
    const rg = resourceBlock(mainBicep, "demoResourceGroup");
    expect(resourceType(mainBicep, "demoResourceGroup")).toMatch(
      /^Microsoft\.Resources\/resourceGroups@/,
    );
    expect(rg).toMatch(/name:\s*resourceGroupName/);
    // The demo resources module is deployed into that resource group.
    const moduleBlock = (() => {
      const idx = mainBicep.indexOf("module demoResources");
      return idx === -1 ? "" : mainBicep.slice(idx, idx + 400);
    })();
    expect(moduleBlock).toMatch(/scope:\s*demoResourceGroup/);
  });
});

describe("Non-compliant resources and key properties", () => {
  it("storage account allows HTTP traffic — supportsHttpsTrafficOnly false (Req 1.3)", () => {
    const block = resourceBlock(resourcesBicep, "httpStorage");
    expect(resourceType(resourcesBicep, "httpStorage")).toMatch(
      /^Microsoft\.Storage\/storageAccounts@/,
    );
    expect(block).toMatch(/supportsHttpsTrafficOnly:\s*false/);
  });

  it("storage account has blob soft delete disabled (Req 1.4)", () => {
    const svc = resourceBlock(resourcesBicep, "noSoftDeleteBlobService");
    expect(resourceType(resourcesBicep, "noSoftDeleteBlobService")).toMatch(
      /^Microsoft\.Storage\/storageAccounts\/blobServices@/,
    );
    // deleteRetentionPolicy.enabled is false → soft delete disabled.
    expect(svc).toMatch(/deleteRetentionPolicy:\s*{[\s\S]*?enabled:\s*false/);
  });

  it("NSG has an enabled inbound Allow rule from 0.0.0.0/0 to port 3389 (Req 1.5)", () => {
    const block = resourceBlock(resourcesBicep, "openNsg");
    expect(resourceType(resourcesBicep, "openNsg")).toMatch(
      /^Microsoft\.Network\/networkSecurityGroups@/,
    );
    expect(block).toMatch(/access:\s*'Allow'/);
    expect(block).toMatch(/direction:\s*'Inbound'/);
    expect(block).toMatch(/sourceAddressPrefix:\s*'0\.0\.0\.0\/0'/);
    expect(block).toMatch(/destinationPortRange:\s*'3389'/);
  });

  it("virtual machine carries zero resource tags (Req 1.6)", () => {
    const block = resourceBlock(resourcesBicep, "untaggedVm");
    expect(resourceType(resourcesBicep, "untaggedVm")).toMatch(
      /^Microsoft\.Compute\/virtualMachines@/,
    );
    // No `tags:` property declared on the untagged VM resource block.
    expect(block).not.toMatch(/(^|\n)\s*tags:/);
  });

  it("Key Vault has purge protection disabled (Req 1.7)", () => {
    const block = resourceBlock(resourcesBicep, "openKeyVault");
    expect(resourceType(resourcesBicep, "openKeyVault")).toMatch(
      /^Microsoft\.KeyVault\/vaults@/,
    );
    // enablePurgeProtection is omitted (purge protection off) — must not be set true.
    expect(block).not.toMatch(/enablePurgeProtection:\s*true/);
  });

  it("SQL database has auditing not configured (Req 1.8)", () => {
    expect(resourceType(resourcesBicep, "sqlServer")).toMatch(
      /^Microsoft\.Sql\/servers@/,
    );
    expect(resourceType(resourcesBicep, "sqlDatabase")).toMatch(
      /^Microsoft\.Sql\/servers\/databases@/,
    );
    // No auditingSettings resource is DECLARED anywhere in the template.
    // (Match a resource declaration of that type, not mere mentions in comments.)
    expect(resourcesBicep).not.toMatch(
      /resource\s+\w+\s+'Microsoft\.Sql\/servers\/auditingSettings@/,
    );
  });

  it("virtual machine has no diagnostic settings configured (Req 1.9)", () => {
    const block = resourceBlock(resourcesBicep, "noDiagVm");
    expect(resourceType(resourcesBicep, "noDiagVm")).toMatch(
      /^Microsoft\.Compute\/virtualMachines@/,
    );
    // Boot diagnostics disabled and no diagnosticSettings resource attached.
    expect(block).toMatch(/bootDiagnostics:\s*{[\s\S]*?enabled:\s*false/);
    // (Match a resource declaration of that type, not mere mentions in comments.)
    expect(resourcesBicep).not.toMatch(
      /resource\s+\w+\s+'Microsoft\.Insights\/diagnosticSettings@/,
    );
  });
});

describe("Compliant contrast resources and key properties", () => {
  it("storage account is HTTPS-only with soft delete and a private endpoint (Req 1.10)", () => {
    const block = resourceBlock(resourcesBicep, "secureStorage");
    expect(block).toMatch(/supportsHttpsTrafficOnly:\s*true/);

    const blob = resourceBlock(resourcesBicep, "secureBlobService");
    expect(blob).toMatch(/deleteRetentionPolicy:\s*{[\s\S]*?enabled:\s*true/);

    expect(resourceType(resourcesBicep, "secureStoragePrivateEndpoint")).toMatch(
      /^Microsoft\.Network\/privateEndpoints@/,
    );
    const pe = resourceBlock(resourcesBicep, "secureStoragePrivateEndpoint");
    expect(pe).toMatch(/privateLinkServiceId:\s*secureStorage\.id/);
  });

  it("NSG has every inbound rule scoped to a non-0.0.0.0/0 source (Req 1.11)", () => {
    const block = resourceBlock(resourcesBicep, "scopedNsg");
    expect(resourceType(resourcesBicep, "scopedNsg")).toMatch(
      /^Microsoft\.Network\/networkSecurityGroups@/,
    );
    expect(block).not.toMatch(/sourceAddressPrefix:\s*'0\.0\.0\.0\/0'/);
    expect(block).toMatch(/sourceAddressPrefix:\s*'10\.10\.0\.0\/16'/);
  });

  it("Key Vault has both purge protection and soft delete enabled (Req 1.12)", () => {
    const block = resourceBlock(resourcesBicep, "hardenedKeyVault");
    expect(block).toMatch(/enablePurgeProtection:\s*true/);
    expect(block).toMatch(/enableSoftDelete:\s*true/);
  });
});

describe("Naming token and built-in-only policy usage", () => {
  it("assigns every demo resource a name carrying a `demo` token (Req 1.13)", () => {
    // Hyphenated `demo-` prefix names declared directly on resources.
    const hyphenNames = [
      "demo-vnet",
      "demo-nsg-open",
      "demo-nsg-scoped",
      "demo-pe-secure-storage",
      "demo-sqldb",
      "demo-nic-untagged",
      "demo-nic-nodiag",
      "demo-vm-untagged",
      "demo-vm-nodiag",
    ];
    for (const name of hyphenNames) {
      expect(resourcesBicep, `expected resource named "${name}"`).toContain(
        `'${name}'`,
      );
    }

    // Storage / Key Vault / SQL names disallow or constrain hyphens, so they
    // embed a `demo` token in their globally-unique name variables.
    const tokenNameVars = [
      /httpStorageName\s*=\s*'demohttp\$\{nameToken\}'/,
      /noSoftDeleteStorageName\s*=\s*'demonosd\$\{nameToken\}'/,
      /secureStorageName\s*=\s*'demosecure\$\{nameToken\}'/,
      /openKeyVaultName\s*=\s*'demo-kv\$\{nameToken\}'/,
      /hardenedKeyVaultName\s*=\s*'demo-kvh\$\{nameToken\}'/,
      /sqlServerName\s*=\s*'demo-sql\$\{nameToken\}'/,
    ];
    for (const re of tokenNameVars) {
      expect(resourcesBicep).toMatch(re);
    }

    // The policy assignment in main.bicep also carries the demo token.
    expect(mainBicep).toMatch(/name:\s*'demo-asb-assignment'/);
  });

  it("uses only built-in policy definitions / initiatives (Req 1.14)", () => {
    // No custom policy definitions or initiatives are authored anywhere.
    expect(mainBicep).not.toMatch(/Microsoft\.Authorization\/policyDefinitions/);
    expect(mainBicep).not.toMatch(
      /Microsoft\.Authorization\/policySetDefinitions@/,
    );
    expect(resourcesBicep).not.toMatch(
      /Microsoft\.Authorization\/policy(Set)?Definitions@/,
    );
    // The only policy set definition reference is the built-in ASB initiative,
    // referenced via subscriptionResourceId (built-in scope).
    expect(mainBicep).toMatch(
      new RegExp(
        `subscriptionResourceId\\('Microsoft\\.Authorization/policySetDefinitions',\\s*'${AZURE_SECURITY_BENCHMARK_INITIATIVE_ID}'\\)`,
      ),
    );
  });
});

describe("Azure Security Benchmark initiative assignment (Req 2.1)", () => {
  it("assigns the built-in ASB initiative at subscription scope", () => {
    expect(resourceType(mainBicep, "azureSecurityBenchmarkAssignment")).toMatch(
      /^Microsoft\.Authorization\/policyAssignments@/,
    );
    const block = resourceBlock(mainBicep, "azureSecurityBenchmarkAssignment");
    expect(block).toMatch(/policyDefinitionId:\s*azureSecurityBenchmarkInitiativeId/);
    // Assigned from a subscription-scoped template (targetScope = 'subscription'),
    // so the assignment applies at subscription scope.
    expect(mainBicep).toMatch(/targetScope\s*=\s*'subscription'/);
    // The initiative variable resolves to the built-in ASB GUID.
    expect(mainBicep).toContain(AZURE_SECURITY_BENCHMARK_INITIATIVE_ID);
  });
});

describe("Least-privilege RBAC — exactly {Reader, Resource Policy Reader} (Req 8.1–8.4)", () => {
  it("grants the Reader role on the subscription scope (Req 8.1)", () => {
    expect(mainBicep).toMatch(
      new RegExp(`readerRoleDefinitionId\\s*=\\s*'${READER_ROLE_ID}'`),
    );
    expect(resourceType(mainBicep, "readerRoleAssignment")).toMatch(
      /^Microsoft\.Authorization\/roleAssignments@/,
    );
    const block = resourceBlock(mainBicep, "readerRoleAssignment");
    expect(block).toMatch(
      /roleDefinitionId:\s*subscriptionResourceId\([\s\S]*?readerRoleDefinitionId\)/,
    );
  });

  it("grants the Resource Policy Reader role on the subscription scope (Req 8.2)", () => {
    expect(mainBicep).toMatch(
      new RegExp(
        `resourcePolicyReaderRoleDefinitionId\\s*=\\s*'${RESOURCE_POLICY_READER_ROLE_ID}'`,
      ),
    );
    expect(resourceType(mainBicep, "resourcePolicyReaderRoleAssignment")).toMatch(
      /^Microsoft\.Authorization\/roleAssignments@/,
    );
    const block = resourceBlock(mainBicep, "resourcePolicyReaderRoleAssignment");
    expect(block).toMatch(
      /roleDefinitionId:\s*subscriptionResourceId\([\s\S]*?resourcePolicyReaderRoleDefinitionId\)/,
    );
  });

  it("both role assignments are scoped to the subscription (Req 8.1, 8.2)", () => {
    expect(resourceBlock(mainBicep, "readerRoleAssignment")).toMatch(
      /scope:\s*subscription\(\)/,
    );
    expect(resourceBlock(mainBicep, "resourcePolicyReaderRoleAssignment")).toMatch(
      /scope:\s*subscription\(\)/,
    );
  });

  it("grants NO write-capable role (Req 8.3)", () => {
    // Only the two read-only role GUIDs may appear; assert known write-capable
    // built-in role GUIDs are absent.
    const writeCapableRoleIds = [
      "8e3af657-a8ff-443c-a75c-2fe8c4bcb635", // Owner
      "b24988ac-6180-42a0-ab88-20f7382dd24c", // Contributor
      "f58310d9-a9f6-439a-9e8d-f62e7b41a168", // Resource Policy Contributor
      "18d7d88d-d35e-4fb5-a5c3-7773c20a72d9", // User Access Administrator
    ];
    for (const id of writeCapableRoleIds) {
      expect(mainBicep, `write-capable role ${id} must not be granted`).not.toContain(
        id,
      );
    }
  });

  it("grants EXACTLY the {Reader, Resource Policy Reader} role set and no other (Req 8.4)", () => {
    // Count roleAssignment resource declarations — must be exactly two.
    const assignmentCount = (
      mainBicep.match(/resource\s+\w+\s+'Microsoft\.Authorization\/roleAssignments@/g) ??
      []
    ).length;
    expect(assignmentCount).toBe(2);

    // The only role-definition GUIDs referenced are the two read-only roles.
    const guidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
    const roleDefGuids = new Set<string>();
    // Capture GUIDs used as role definition ids (reader / resource policy reader vars).
    for (const m of mainBicep.matchAll(
      /(?:reader|resourcePolicyReader)RoleDefinitionId\s*=\s*'([0-9a-f-]{36})'/g,
    )) {
      roleDefGuids.add(m[1]);
    }
    expect(roleDefGuids).toEqual(
      new Set([READER_ROLE_ID, RESOURCE_POLICY_READER_ROLE_ID]),
    );
    // Sanity: the GUID regex compiles and matches the known role ids.
    expect(READER_ROLE_ID).toMatch(guidRe);
  });
});
