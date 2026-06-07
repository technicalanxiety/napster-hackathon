// =============================================================================
// Azure Governance Baseline Advisor - Infrastructure entry point
//
// Subscription-scoped template that provisions the demo resource group
// `rg-governance-demo` and deploys the demo resources into it. Running at
// subscription scope lets later tasks attach the Azure Security Benchmark
// initiative assignment (Requirement 2.1) and the least-privilege RBAC role
// assignments (Requirement 8.x) at subscription scope from this same template.
//
// The template is idempotent: every name and property is fixed, so redeploying
// with no source changes produces no diff (Requirement 1.2).
//
// Deploy with:
//   az deployment sub create \
//     --location <region> \
//     --template-file infra/main.bicep \
//     --parameters vmAdminPassword=<pwd> sqlAdminPassword=<pwd>
//
// Requirements: 1.1, 1.2, 1.13, 1.14, 2.1
// =============================================================================

targetScope = 'subscription'

@description('Azure region for the demo resource group and all demo resources.')
param location string = 'eastus'

@description('Local administrator username for the demo virtual machines.')
param vmAdminUsername string = 'demoadmin'

@secure()
@description('Local administrator password for the demo virtual machines.')
param vmAdminPassword string

@description('Administrator login for the demo SQL logical server.')
param sqlAdminLogin string = 'demosqladmin'

@secure()
@description('Administrator password for the demo SQL logical server.')
param sqlAdminPassword string

@description('''Object (principal) ID of the Policy Function App's system-assigned managed identity.
When supplied, the template grants it exactly the Reader and Resource Policy Reader roles at
subscription scope (Requirement 8.x). Leave empty to skip RBAC assignment (e.g. before the
Function App exists). No write-capable role is ever granted.''')
param functionAppPrincipalId string = ''

var resourceGroupName = 'rg-governance-demo'

// -----------------------------------------------------------------------------
// Least-privilege RBAC (Requirement 8.1, 8.2, 8.3, 8.4)
//
// The Policy Function's managed identity needs only read access to query policy
// compliance state. It is granted EXACTLY two built-in roles at subscription
// scope and nothing else:
//   - Reader                  (acdd72a7-3385-48ef-bd42-f606fba81ae7)
//   - Resource Policy Reader  (36243c78-bf99-498c-9df9-86d9f8d28608)
// Both roles are read-only; neither confers create/update/delete permissions
// (Requirement 8.3). No additional roles are assigned (Requirement 8.4).
// -----------------------------------------------------------------------------
var readerRoleDefinitionId = 'acdd72a7-3385-48ef-bd42-f606fba81ae7'
var resourcePolicyReaderRoleDefinitionId = '36243c78-bf99-498c-9df9-86d9f8d28608'
var assignFunctionAppRoles = !empty(functionAppPrincipalId)

// Built-in Azure Security Benchmark initiative (a.k.a. Microsoft cloud security
// benchmark). Referenced at tenant/built-in scope so only a built-in initiative
// is used (Requirement 1.14).
var azureSecurityBenchmarkInitiativeId = subscriptionResourceId('Microsoft.Authorization/policySetDefinitions', '1f3afdf9-d0c9-4c3d-847f-89da613e70a8')

// Requirement 1.1: all demo resources land in `rg-governance-demo`.
resource demoResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

// Requirement 2.1: assign the Azure Security Benchmark initiative at the
// subscription scope so compliance state reflects the deployed demo resources.
// The initiative contains deployIfNotExists/modify policies, so the assignment
// is given a system-assigned managed identity and a location (both required for
// those effects). Name and properties are fixed so redeployment produces no
// diff (Requirement 1.2).
resource azureSecurityBenchmarkAssignment 'Microsoft.Authorization/policyAssignments@2024-04-01' = {
  name: 'demo-asb-assignment'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: 'Azure Security Benchmark (demo governance baseline)'
    description: 'Assigns the built-in Azure Security Benchmark initiative at subscription scope for the governance demo environment.'
    policyDefinitionId: azureSecurityBenchmarkInitiativeId
    enforcementMode: 'Default'
  }
}

module demoResources 'resources.bicep' = {
  name: 'demo-resources'
  scope: demoResourceGroup
  params: {
    location: location
    vmAdminUsername: vmAdminUsername
    vmAdminPassword: vmAdminPassword
    sqlAdminLogin: sqlAdminLogin
    sqlAdminPassword: sqlAdminPassword
  }
}

output resourceGroupName string = demoResourceGroup.name

// Reader role assignment (Requirement 8.1). Deterministic GUID name keeps the
// assignment idempotent across redeployments (Requirement 1.2).
resource readerRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (assignFunctionAppRoles) {
  name: guid(subscription().id, functionAppPrincipalId, readerRoleDefinitionId)
  scope: subscription()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', readerRoleDefinitionId)
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Resource Policy Reader role assignment (Requirement 8.2).
resource resourcePolicyReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (assignFunctionAppRoles) {
  name: guid(subscription().id, functionAppPrincipalId, resourcePolicyReaderRoleDefinitionId)
  scope: subscription()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', resourcePolicyReaderRoleDefinitionId)
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}
output azureSecurityBenchmarkAssignmentId string = azureSecurityBenchmarkAssignment.id
