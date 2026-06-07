# Azure Governance Baseline Framework

This document is the grounding knowledge base for the Azure Governance Baseline Advisor
(persona "Morgan Cole", senior Azure governance architect). It defines the baseline
controls the advisor assesses, the common violations it surfaces, the remediation it
recommends, and the three-tier prioritization framework it uses to order findings by
real business risk.

The advisor assesses five governance categories: **networking**, **storage**,
**identity**, **compute**, and **logging**. Every finding the advisor reports maps to
exactly one category and exactly one remediation tier (high, medium, or low). The
advisor must explain a finding's business impact and remediation using only the content
in this document. If a finding's category is not covered here, the advisor must say so
rather than fabricate guidance.

---

## How to read this document

Each category section is structured identically so the advisor can ground three things
about any finding:

- **Key controls** — the baseline expectations a compliant environment meets.
- **Common violations** — the non-compliant conditions that produce findings, with the
  business impact of each.
- **Remediation** — the recommended action to bring the resource into compliance.

The closing **Prioritization Framework** section maps every gap to a high, medium, or
low tier so the advisor can present findings in priority order.

---

## 1. Networking

Networking governance controls who and what can reach your resources over the network.
Misconfigurations here are the most directly exploitable, because they expose services
to the public internet before any other control can intervene.

### Key controls

- Inbound traffic is restricted to known, scoped source ranges. No network security
  group (NSG) rule allows traffic from `0.0.0.0/0` (any source) to management ports.
- Management ports — RDP (3389) and SSH (22) — are never open to the public internet.
  Administrative access goes through a bastion host, VPN, or just-in-time access.
- NSG rules follow least privilege: each rule names the narrowest source, destination,
  and port range required for a specific workload.
- Private endpoints are preferred over public network access for platform services.

### Common violations

- **Open inbound rule to `0.0.0.0/0` on a management port.** An enabled inbound NSG rule
  with access `Allow`, source `0.0.0.0/0`, and destination port 3389 (or 22) exposes the
  RDP/SSH service to the entire internet. *Business impact:* this is a primary attack
  vector for brute-force credential attacks, ransomware entry, and automated botnet
  scanning. A single exposed management port can lead to full host compromise and lateral
  movement into the rest of the subscription.
- **Overly broad source ranges.** Rules that allow large CIDR blocks beyond what the
  workload needs widen the attack surface unnecessarily.

### Remediation

- Change the rule's source from `0.0.0.0/0` to a specific corporate IP range, or remove
  the public rule entirely and use Azure Bastion or a VPN for administrative access.
- For platform services, disable public network access and add a private endpoint.
- Adopt just-in-time VM access so management ports are opened only on demand for a limited
  window.

---

## 2. Storage

Storage governance protects data at rest and in transit, and protects against accidental
or malicious data loss.

### Key controls

- **Encryption in transit is enforced.** Storage accounts require secure transfer
  (`supportsHttpsTrafficOnly` enabled), so all access uses HTTPS/TLS.
- **Data recovery is enabled.** Blob soft delete (and container soft delete) retain
  deleted data for a defined retention window so it can be recovered.
- **Network exposure is minimized.** Storage accounts use private endpoints and disable
  public blob access where possible.
- Encryption at rest is enabled (on by default with Microsoft-managed keys; customer-managed
  keys where policy requires).

### Common violations

- **Secure transfer disabled (HTTP allowed).** A storage account with
  `supportsHttpsTrafficOnly` set to `false` permits unencrypted HTTP connections.
  *Business impact:* data and access keys can be intercepted in transit (man-in-the-middle),
  exposing sensitive data and credentials. This is treated as a missing-encryption control.
- **Blob soft delete disabled.** Without soft delete, deleted or overwritten blobs are
  permanently and immediately lost. *Business impact:* a mistaken deletion, a buggy script,
  or a ransomware event destroys data with no recovery path, causing data loss and
  potential business interruption.

### Remediation

- Enable secure transfer (`supportsHttpsTrafficOnly = true`) on the storage account so only
  HTTPS connections are accepted.
- Enable blob soft delete with an appropriate retention period (for example 7–30 days) so
  deleted data can be recovered.
- Add a private endpoint and disable public network access for the account.

---

## 3. Identity

Identity governance protects the secrets, keys, and certificates that everything else
depends on, and controls who can act on them.

### Key controls

- **Key Vault purge protection is enabled**, so a deleted vault or secret cannot be
  permanently purged before its retention period expires — even by an administrator.
- **Key Vault soft delete is enabled**, so deleted vaults, keys, and secrets enter a
  recoverable state rather than being destroyed.
- Access to vaults is governed by least-privilege RBAC (or access policies) and audited.
- Managed identities are used instead of stored credentials wherever possible.

### Common violations

- **Key Vault purge protection disabled.** Without purge protection, a deleted vault or
  secret can be permanently purged, including by a compromised or malicious administrator.
  *Business impact:* permanent loss of encryption keys can render encrypted data
  unrecoverable, and permanent loss of secrets can break dependent applications with no
  recovery path. This is the identity-category equivalent of an irreversible data-loss
  control gap.

### Remediation

- Enable purge protection on the Key Vault (note: this is irreversible once enabled, which
  is the point — it guarantees a recovery window).
- Enable soft delete with an appropriate retention period.
- Review and tighten vault access (RBAC role assignments or access policies) to least
  privilege.

---

## 4. Compute

Compute governance ensures virtual machines and other compute resources are
identifiable, accountable, and managed.

### Key controls

- **Required tags are applied** to every compute resource (for example `owner`,
  `environment`, `costCenter`) so resources are accountable and traceable.
- VMs use managed disks with encryption at rest.
- VMs are covered by a patch/update management process and endpoint protection.
- Diagnostic and monitoring agents are deployed (see Logging).

### Common violations

- **Missing resource tags.** A virtual machine with zero tags cannot be attributed to an
  owner, environment, or cost center. *Business impact:* untagged resources create
  accountability gaps (no clear owner during an incident), cost-allocation blind spots,
  and orphaned resources that linger and accrue cost. Tagging gaps also undermine
  automated governance that relies on tags for policy scoping.

### Remediation

- Apply the organization's required tags to the VM (`owner`, `environment`, `costCenter`,
  and any others the tagging standard mandates).
- Use a tag-inheritance or "modify"/"append" governance policy so required tags are added
  automatically at create time.

---

## 5. Logging

Logging governance ensures that activity on resources is captured so that security
incidents can be detected, investigated, and audited.

### Key controls

- **Diagnostic settings are configured** on resources so platform logs and metrics flow
  to a Log Analytics workspace, storage account, or event hub.
- **Database auditing is enabled** (for example SQL database auditing) and retained for
  the required period.
- Activity logs and resource logs are centralized and retained per compliance policy.
- Alerting is configured on security-relevant log signals.

### Common violations

- **Missing diagnostic settings.** A VM (or other resource) with no diagnostic settings
  emits no centralized logs or metrics. *Business impact:* security incidents go
  undetected, and post-incident investigation has no telemetry to work from, extending
  breach dwell time and weakening the audit trail.
- **Database auditing not configured.** A SQL database without auditing keeps no record of
  who accessed or changed data. *Business impact:* loss of an audit trail for sensitive
  data, which blocks forensic investigation and can break regulatory compliance
  (for example data-access audit requirements).

### Remediation

- Configure diagnostic settings on the resource to send logs and metrics to a Log
  Analytics workspace.
- Enable SQL database auditing and direct audit logs to a Log Analytics workspace or
  storage account with an appropriate retention period.
- Use a policy with `deployIfNotExists` to auto-configure diagnostics on new resources.

---

## Prioritization Framework

The advisor orders every finding into one of three remediation tiers. The tiers
correspond directly to the high, medium, and low severity ratings the Policy Function
assigns. Within the same tier, findings are grouped by category. The advisor presents
high-tier findings first, then medium, then low, and closes with the top recommended
actions ordered high to low.

The tier of a gap reflects **real business risk**, not just the technical violation:
how exploitable it is, how reversible the consequences are, and how directly it leads to
data loss or compromise.

### Tier 1 — High (fix first: exploitable or irreversible)

High-tier gaps are either directly exploitable from the public internet or cause
permanent, unrecoverable loss. Remediate these before anything else.

| Gap | Category | Why it is high |
|-----|----------|----------------|
| Open network access to `0.0.0.0/0` on a management port | networking | Directly exploitable attack vector; can lead to full compromise |
| Missing encryption / secure transfer disabled | storage | Data and credentials exposed in transit |
| Key Vault purge protection disabled | identity | Permanent, irreversible loss of keys/secrets is possible |

### Tier 2 — Medium (fix next: recoverability and accountability gaps)

Medium-tier gaps weaken your ability to recover from mistakes, detect incidents, or hold
resources accountable. They are not immediately exploitable but materially increase risk
and impact.

| Gap | Category | Why it is medium |
|-----|----------|------------------|
| Blob soft delete disabled | storage | No recovery path for deleted/overwritten data |
| Missing diagnostic settings | logging / compute | Incidents go undetected; no telemetry for investigation |
| Database auditing not configured | logging | No audit trail for sensitive-data access |
| Missing resource tags | compute | Accountability, cost-allocation, and ownership gaps |

### Tier 3 — Low (fix when convenient: informational / hygiene)

Low-tier gaps are informational or naming/convention findings. They improve consistency
and hygiene but carry little direct security or recovery risk. Any policy not otherwise
classified defaults to this tier.

| Gap | Category | Why it is low |
|-----|----------|---------------|
| Informational or naming-convention policy findings | any | Hygiene and consistency; minimal direct risk |

### Tier assignment rules

- Every gap maps to **exactly one** tier.
- A gap that could fit more than one tier is assigned to the **highest** applicable tier
  (high over medium over low).
- A finding whose policy is not listed above is treated as **low** by default.
