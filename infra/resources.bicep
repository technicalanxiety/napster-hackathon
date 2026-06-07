// =============================================================================
// Azure Governance Baseline Advisor - Demo resources (resource-group scope)
//
// Declares a deterministic mix of intentionally NON-COMPLIANT resources (the
// "findings") and intentionally COMPLIANT contrast resources, all carrying a
// `demo` naming token. Every name and property is fixed so that redeploying the
// template produces no diff (idempotent). Only built-in resource types are used;
// no custom policy definitions are authored here.
//
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12,
//               1.13, 1.14
// =============================================================================

@description('Azure region for all demo resources.')
param location string

@description('Local administrator username for the demo virtual machines.')
param vmAdminUsername string

@secure()
@description('Local administrator password for the demo virtual machines.')
param vmAdminPassword string

@description('Administrator login for the demo SQL logical server.')
param sqlAdminLogin string

@secure()
@description('Administrator password for the demo SQL logical server.')
param sqlAdminPassword string

// -----------------------------------------------------------------------------
// Deterministic, globally-unique names. Storage accounts disallow hyphens, so
// they embed the `demo` token; Key Vault and SQL server names allow hyphens and
// use the `demo-` prefix form. uniqueString() is deterministic for a given
// resource group, keeping names stable across redeployments (Requirement 1.13).
// -----------------------------------------------------------------------------
var nameToken = uniqueString(resourceGroup().id)
var httpStorageName = 'demohttp${nameToken}'        // non-compliant: HTTP allowed
var noSoftDeleteStorageName = 'demonosd${nameToken}' // non-compliant: soft delete off
var secureStorageName = 'demosecure${nameToken}'     // compliant contrast
var openKeyVaultName = 'demo-kv${nameToken}'         // non-compliant: no purge protect
var hardenedKeyVaultName = 'demo-kvh${nameToken}'    // compliant contrast
var sqlServerName = 'demo-sql${nameToken}'           // non-compliant: no auditing

var vmsSubnetId = '${demoVnet.id}/subnets/demo-subnet-vms'
var privateEndpointSubnetId = '${demoVnet.id}/subnets/demo-subnet-pe'

// =============================================================================
// Networking foundation
// =============================================================================

resource demoVnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: 'demo-vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.10.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'demo-subnet-vms'
        properties: {
          addressPrefix: '10.10.1.0/24'
        }
      }
      {
        name: 'demo-subnet-pe'
        properties: {
          addressPrefix: '10.10.2.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

// NON-COMPLIANT: NSG with an enabled inbound Allow rule from 0.0.0.0/0 to 3389
// (Requirement 1.5).
resource openNsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: 'demo-nsg-open'
  location: location
  properties: {
    securityRules: [
      {
        name: 'demo-allow-rdp-any'
        properties: {
          description: 'Intentionally open RDP from the public internet (demo finding).'
          access: 'Allow'
          direction: 'Inbound'
          priority: 100
          protocol: 'Tcp'
          sourceAddressPrefix: '0.0.0.0/0'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '3389'
        }
      }
    ]
  }
}

// COMPLIANT contrast: NSG whose every inbound rule uses a scoped source
// (Requirement 1.11).
resource scopedNsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: 'demo-nsg-scoped'
  location: location
  properties: {
    securityRules: [
      {
        name: 'demo-allow-rdp-scoped'
        properties: {
          description: 'RDP restricted to the demo virtual network address space.'
          access: 'Allow'
          direction: 'Inbound'
          priority: 100
          protocol: 'Tcp'
          sourceAddressPrefix: '10.10.0.0/16'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '3389'
        }
      }
    ]
  }
}

// =============================================================================
// Storage accounts
// =============================================================================

// NON-COMPLIANT: HTTP traffic allowed (Requirement 1.3).
resource httpStorage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: httpStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: false
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// NON-COMPLIANT: blob soft delete disabled (Requirement 1.4).
resource noSoftDeleteStorage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: noSoftDeleteStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource noSoftDeleteBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: noSoftDeleteStorage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: false
    }
  }
}

// COMPLIANT contrast: HTTPS-only + blob soft delete + private endpoint
// (Requirement 1.10).
resource secureStorage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: secureStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    publicNetworkAccess: 'Disabled'
  }
}

resource secureBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: secureStorage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource secureStoragePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'demo-pe-secure-storage'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'demo-plsc-secure-storage'
        properties: {
          privateLinkServiceId: secureStorage.id
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
}

// =============================================================================
// Key Vaults
// =============================================================================

// NON-COMPLIANT: purge protection disabled. enablePurgeProtection is omitted,
// which leaves purge protection off (Requirement 1.7).
resource openKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: openKeyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
  }
}

// COMPLIANT contrast: both purge protection and soft delete enabled
// (Requirement 1.12).
resource hardenedKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: hardenedKeyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 7
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
  }
}

// =============================================================================
// SQL logical server + database
// =============================================================================

// NON-COMPLIANT: SQL database with auditing not configured (Requirement 1.8).
// No Microsoft.Sql/servers/auditingSettings resource is declared.
resource sqlServer 'Microsoft.Sql/servers@2023-05-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Disabled'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-05-01-preview' = {
  parent: sqlServer
  name: 'demo-sqldb'
  location: location
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
}

// =============================================================================
// Virtual machines
// =============================================================================

resource untaggedNic 'Microsoft.Network/networkInterfaces@2023-09-01' = {
  name: 'demo-nic-untagged'
  location: location
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: {
            id: vmsSubnetId
          }
          privateIPAllocationMethod: 'Dynamic'
        }
      }
    ]
  }
}

resource noDiagNic 'Microsoft.Network/networkInterfaces@2023-09-01' = {
  name: 'demo-nic-nodiag'
  location: location
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: {
            id: vmsSubnetId
          }
          privateIPAllocationMethod: 'Dynamic'
        }
      }
    ]
  }
}

// NON-COMPLIANT: virtual machine with zero resource tags (Requirement 1.6).
// The `tags` property is intentionally omitted so the VM carries no tags.
resource untaggedVm 'Microsoft.Compute/virtualMachines@2023-09-01' = {
  name: 'demo-vm-untagged'
  location: location
  properties: {
    hardwareProfile: {
      vmSize: 'Standard_B1s'
    }
    osProfile: {
      computerName: 'demovmuntag'
      adminUsername: vmAdminUsername
      adminPassword: vmAdminPassword
      linuxConfiguration: {
        disablePasswordAuthentication: false
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: '0001-com-ubuntu-server-jammy'
        sku: '22_04-lts-gen2'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Standard_LRS'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: untaggedNic.id
        }
      ]
    }
    diagnosticsProfile: {
      bootDiagnostics: {
        enabled: false
      }
    }
  }
}

// NON-COMPLIANT: virtual machine with no diagnostic settings configured
// (Requirement 1.9). Boot diagnostics are disabled and no
// Microsoft.Insights/diagnosticSettings resource is attached.
resource noDiagVm 'Microsoft.Compute/virtualMachines@2023-09-01' = {
  name: 'demo-vm-nodiag'
  location: location
  tags: {
    workload: 'demo'
  }
  properties: {
    hardwareProfile: {
      vmSize: 'Standard_B1s'
    }
    osProfile: {
      computerName: 'demovmnodiag'
      adminUsername: vmAdminUsername
      adminPassword: vmAdminPassword
      linuxConfiguration: {
        disablePasswordAuthentication: false
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: '0001-com-ubuntu-server-jammy'
        sku: '22_04-lts-gen2'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Standard_LRS'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: noDiagNic.id
        }
      ]
    }
    diagnosticsProfile: {
      bootDiagnostics: {
        enabled: false
      }
    }
  }
}

// =============================================================================
// Outputs (stable identifiers for downstream tooling / tests)
// =============================================================================

output httpStorageId string = httpStorage.id
output noSoftDeleteStorageId string = noSoftDeleteStorage.id
output secureStorageId string = secureStorage.id
output openNsgId string = openNsg.id
output scopedNsgId string = scopedNsg.id
output openKeyVaultId string = openKeyVault.id
output hardenedKeyVaultId string = hardenedKeyVault.id
output sqlServerId string = sqlServer.id
output sqlDatabaseId string = sqlDatabase.id
output untaggedVmId string = untaggedVm.id
output noDiagVmId string = noDiagVm.id
