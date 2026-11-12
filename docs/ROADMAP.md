# Roadmap — resource/check backlog

> *Historical note: the tool was renamed dotzen → **pluvian** (v2.0.0, 2026-09-01,
> under the erkos umbrella — see `docs/REBRAND.md`). "dotzen" below refers to the
> pre-rebrand tool; the log is kept as history.*

## Status at a glance

**144 rules across 8 presets** (`coreSecurity`, `cisAws`, `cisAzure`, `cisGcp`,
`pciDss`, `soc2`, `nist80053`, `dataProtection`) · **~3,200 resource/data
types** recognized across AWS, Azure, and GCP · **822 unit + 45 integration
tests** · **0 false positives since dogfood round 6**, across 35+ real
module repos (terraform-aws-modules, terraform-google-modules, Azure/,
cloudposse) · 3 output formats (terminal, JSON, SARIF 2.1.0) · a working
**graph layer** for multi-hop topology rules (e.g. "no DB in a public
subnet") — the one class of control static per-resource tools don't cover ·
since **v2.1.0** the engine is also a **public library** (`check` + report
types from the package index) and ships an in-editor **VS Code extension**
(`packages/vscode`, spec 11 — Marketplace/Open VSX publish pending).

The engine is feature-complete for static Terraform governance. What
follows is the detailed dogfood log that got it there — useful for
understanding *why* a given precision fix exists, not required reading to
evaluate the tool. Skip to "Future directions" at the bottom for what's
still open.

---

Prospective governance checks for dotzen's AWS vocabulary, from the
EKS / ECS / Route 53 / ALB-NLB / ACM / Secrets Manager review. This is a
**backlog to pull from**, not committed design (that lives in
`docs/specs/*`). Each item is tagged:

- **Priority**: High / Med / Low (AI-gen frequency × security impact).
- **Fit**: _fits today_ (enum-add reusing an existing condition) or
  _needs Cn_ (a cross-cutting capability below).

Definition of Done for any item (per `docs/specs/07-development-workflow.md`):
written test-first, violating **and** passing fixtures, all gate subagents
green.

---

## Post-publish dogfooding findings (real module repos)

Running v0.0.x on real AWS module repos surfaced these, in priority order:

- ✅ **DONE (v0.0.2)** `npx`-scaffolded specs couldn't resolve the
  `@dotzen/dotzen` import — engine now aliases it to itself (spec loader).
- ✅ **DONE (v0.0.3)** Tag resolution through `var`/`local` refs and
  `merge(<literal>, var.tags)` — the ubiquitous module tag pattern. Reads
  the literal keys as a *partial* set (pass when required ⊆ literal;
  could-not-evaluate otherwise; never a false violation).
- ✅ **DONE (v0.1.2)** Full `merge()` tag resolution — parses `merge()`'s
  top-level args, so a caller-threaded **concrete** `var.tags` map makes the
  set *complete* and a genuinely-missing required tag becomes a real
  **violation** (not could-not-evaluate). Refs inside object *values* are no
  longer mistaken for map args; opaque/unresolvable args still degrade
  honestly. Surfaced by an env-layer simulation of the real module pattern.
- ✅ **DONE (v0.1.0, Tranche 1) — Module-following** (doc 08). Local
  `module {}` calls are followed: each call's inputs thread into the
  module's `var.*`, so caller-supplied cidrs/tags become concrete verdicts,
  traced as `env/prd › modules/rds/main.tf`. Also fixed: `cidr_blocks =
  var.list` (whole-list ref) now resolves (and honestly degrades instead of
  a silent pass).
- ✅ **DONE (v0.3.0, Tranche 2) — Module-following hardening** (doc 08). (a) Per-instantiation trace labels: each
  followed call's findings carry `(module-label)` — `env/prd ›
  modules/rds/main.tf (db_bad)` — so two calls of one module are
  distinguishable. (b) `count = 0` (literal, or a var that resolves to it)
  disables the module and it is skipped silently (correct, no resources to
  evaluate); an unresolvable `count` is followed once (honest, no key
  expansion). (c) Doc 08 DoD: non-followed modules (remote/registry/git
  source, source that escapes the scanned project, missing module dir) are
  recorded and surfaced as `couldNotEvaluate` under the stable ruleId
  `dotzen.module-following` — never a silent `0 checks`.
- ✅ **DONE (v0.3.0, Tranche 5) — Nested modules + module `for_each`** (doc 08).
  (a) `followModules` is now recursive: a followed module's own `module {}`
  calls are followed too, bounded by a path-stack of resolved absolute dirs
  — a cycle (module → module → itself, mutually or self-referential) is
  recorded as a `could-not-evaluate` skip rather than recursing forever.
  The trace accumulates the full call chain: `env/prd › modules/outer/main.tf
  (db) › modules/inner/main.tf (inner_db)` so a finding on a deep module
  names every hop. (b) Module `for_each` over a resolvable literal map or
  var-resolved list is expanded per element: one module instance per key,
  `each.value`/`each.key` threaded into the module scope (the `SOLE_REF`
  regex in `normalize.ts` now accepts `each.value`/`each.key`, so
  `resolveValue` follows them). The trace carries the per-key suffix
  `(db[bad])` / `(db[good])`. An unresolvable `for_each` (`toset(...)`,
  `var.x` no default) is followed once honestly — `each.*` inside degrades
  to `could-not-evaluate` via the engine, no false expansion. An empty
  resolved collection (`toset([])`) skips silently (like `count = 0`).
  Per-instance isolation preserved at every depth: each call's scope and
  trace label are independent.
  **Remaining (harder, lower-frequency):** caller inputs that are
  themselves unresolved compound expressions beyond sole refs — would
  require modeling Terraform built-in functions (`concat()`, `flatten()`,
  `toset()` for non-empty collections) across all attrs. Only `merge()`
  is partially handled (for tags). Deferred (broad effort, diminishing
  returns — the common case is sole-ref caller inputs, which already work).
  ✅ **DONE (v1.9.1):** `count` per-index expansion and `each.value.field`
  on objects — see below.
- ✅ **DONE (v0.1.3)** `mustHaveAssociated` through `local`/`var` indirection.
  Real modules route the parent ref through a local
  (`bucket = local.bucket_id`, where `local.bucket_id = aws_s3_bucket.main.id`).
  `resolveValue` already follows the chain — the bottom expr IS the resource
  ref — so the resolvable case already linked correctly. The actual gap was
  the **unresolvable** chain (`bucket = var.bucket_id` with no default and no
  module-caller input): the index keyed on `var.bucket_id` and never matched,
  producing a false violation on well-built modules. Fix: normalize now
  surfaces an explicit `resolvedRef` on the `unresolved` NormalizedValue
  (structured data, so the engine does not inspect var/local prefix
  conventions), and `buildAssociations` records unresolvable sole
  `${var.x}`/`${local.y}` exprs in a second index so
  `evalMustHaveAssociated` degrades to **couldNotEvaluate** instead of a
  false violation — the formal "omitted" outcome, matching `evalMustHaveTags`
  / `evalMustEqual`. Direct refs and resolvable chains still link via the
  same `resolvedRef` signal. The "companion resource that points at its
  parent by a literal name" gap is closed in v1.7 via the `literalLinks`
  index (a literal `via` value matching the parent's Terraform label links
  them, keyed by `childType|viaAttr` so unrelated attrs/types don't
  cross-link).
- ✅ **DONE** Open tag taxonomy — `mustHaveTags` accepts `(Tag | (string &
  {}))[]`, so org-specific tag keys work via a consumer's own enum (e.g.
  `enum OrgTag { ApmId = 'apm_id', CmdbAppId = 'cmdb_app_id' }`), keeping
  typo-safety without forcing a closed taxonomy. The `env-layer` integration
  fixture exercises a custom `OrgTag` enum with a missing-tag violation.
- ✅ **DONE (v0.1.3)** `jsonencode(...)` policy parsing — the top remaining IAM
  could-not-evaluate. Most real Terraform uses `jsonencode`, not literal JSON,
  for IAM policies and ECS `container_definitions`. The parser now extracts
  the HCL object/array literal inside `jsonencode(...)`: a recursive-descent
  parser (`parseHclValue`) handles nested objects, arrays, quoted strings
  (with escapes), booleans, numbers, and `null`; any interpolated value
  (`${var.x}` inside a string) or non-literal inner (`jsonencode(var.policy)`)
  degrades to `unresolved` → could-not-evaluate (consistent with the
  literal-JSON path). `Condition` blocks are now parsed too (keyed by
  operator then key, with string-list values), unblocking the [Low] S3
  SSL-only `aws:SecureTransport` check as a future condition. ECS
  `container_definitions = jsonencode([...])` is also parsed. Reuses
  `kind: 'parsed'` — zero engine changes except updated couldNotEvaluate
  reason strings.

---

## Cross-cutting capabilities (build these — they unlock multiple checks)

- ✅ **C1 — `denyValue(attr, values)`** (value-in-set) — DONE. (Kept
  `denyAcl` as-is rather than refactoring it onto `denyValue`; a
  `mustBeOneOf` allowlist variant remains a future option.)
- ✅ **C2 — `denyLiteral(attr)`** (literal-vs-reference) — DONE. A literal
  value is the violation; an unresolved `var`/`data` reference passes.
- ✅ **C3 — list-valued attributes + `listContains` / `listMustInclude`**
  — DONE. `normalize` now extracts arrays-of-scalars (nested → dotted key)
  into a `lists` map.
- ✅ **C4 — embedded-JSON inspection** — DONE for ECS `container_definitions`
  (reuses the IAM literal-JSON parser). Parsing the object argument of
  `jsonencode(...)` is still open (both IAM and ECS degrade to
  could-not-evaluate on it).
- ✅ **C5 — nested `default_action` inspection** — DONE (captured as the
  dotted attribute `default_action.type`; used by `denyPlaintextListener`).
- ✅ **C6 — cross-resource + same-resource presence** — DONE. Two
  conditions: `mustHaveAssociated(childType, via)` (a separate resource of
  `childType` must reference this one via `via` — association is by
  resource reference, built into an index once per run) and
  `mustHaveBlock(block)` (this resource must declare a given nested block,
  detected via the flattened dotted keys).

---

## Per-service checks

### ECS — worth building
- ✅ **DONE** `aws_ecs_service` → `network_configuration.assign_public_ip = true`
  → `denyWhenTrue` on the nested boolean. Public-IP Fargate tasks.
- ✅ **DONE** `aws_ecs_task_definition` → `container_definitions` privileged
  containers (`privileged = true`) via `denyPrivilegedContainers`. Plaintext
  env secrets still open.

### EKS — high value, mostly gated on C3
- ✅ **DONE** `aws_eks_cluster` → `vpc_config.endpoint_public_access` must be
  false → `mustBeFalse` (a new condition — `endpoint_public_access` defaults
  to *true*, so absent must violate; `denyWhenTrue` would silently pass it).
- ✅ **DONE** `vpc_config.public_access_cidrs` contains `0.0.0.0/0` via
  `listContains`.
- ✅ **DONE** `enabled_cluster_log_types` includes `audit`/`api` via
  `listMustInclude`.
- ✅ **DONE** `encryption_config` present (secrets envelope encryption) via
  `mustHaveBlock` (C6, same-resource block presence).

### ALB / NLB (`aws_lb`, `aws_lb_listener`) — worth building
- ✅ **DONE** `aws_lb` → `access_logs.enabled = true` → `mustBeTrue`
  (nested boolean).
- ✅ **DONE** `aws_lb` → `drop_invalid_header_fields = true` → `mustBeTrue`.
- ✅ **DONE** `aws_lb_listener` → weak `ssl_policy` (TLS 1.0/1.1) via
  `denyValue`.
- ✅ **DONE** `aws_lb_listener` → plaintext `protocol` via
  `denyPlaintextListener`, exempting HTTP→HTTPS redirect listeners
  (`default_action.type = "redirect"`).

### Secrets Manager — one high-value flagship
- ✅ **DONE** hardcoded-secret detection via `denyLiteral` across
  `aws_secretsmanager_secret_version.secret_string`,
  `aws_db_instance.password`, `aws_rds_cluster`/`aws_redshift_cluster`
  `master_password`, and `aws_elasticache_replication_group.auth_token`.
  Complements gitleaks/CI secret scanning as defense-in-depth (structural,
  precise, resource-aware). General "any secret anywhere" scanning stays
  out of scope (that's gitleaks' job — doc 01).
- ✅ **DONE** `aws_secretsmanager_secret` → rotation enabled (the separate
  `aws_secretsmanager_secret_rotation` resource must reference it) via
  `mustHaveAssociated` (C6, `warn`).
- ✅ **DONE (v1.7)** secret resource-policy wildcard (reuses IAM parsing).
  `denyPublicPrincipal` already parses any resource's inline `policy` via
  `policyOf` and flags an `Allow` + `Principal: "*"`; a rule targeting
  `aws_secretsmanager_secret_policy` governs it unchanged — no new
  condition, no engine change. The `cisAws` preset ships
  `no-public-secret-policy` (`block`) — the secret-store analog of the
  IAM-policy `Principal: "*"` rule. 4 `evaluate.secret.test.ts` cases pin
  the contract (public flag, least-privilege pass, Deny+"*" pass,
  unresolved→CNE).

### Logging / audit (CIS AWS §3) + IAM baseline (§1) — Tier A, DONE
- ✅ **DONE** `aws_cloudtrail` → `is_multi_region_trail` +
  `enable_log_file_validation` (`mustBeTrue`) and KMS encryption
  (`kms_key_id` present, via the new `mustBeSet`). CIS §3.1/3.2/3.7.
- ✅ **DONE** `aws_iam_account_password_policy` → length >= 14 +
  reuse-prevention >= 24 (`mustBeAtLeast`), full complexity (`mustBeTrue`),
  and `max_password_age <= 90` (`mustBeAtMost`).
  CIS §1.8/1.9/1.11.
- ✅ **DONE** IAM over-permission depth: `denyIamWildcard` now also flags
  `NotAction` on `Allow` (over-broad grant) and sharpens the message for
  `Action:"*"` + `Resource:"*"`. Flagging `Resource:"*"` *alone* was
  deliberately NOT added — it is legitimate in most Allow statements, so it
  would be false-positive-prone.
- ✅ **DONE (v0.1.3 / v1.7)** AWS Config recorder settings —
  `aws_config_configuration_recorder` with `mustBeTrue` on
  `recording_group.all_supported` (CIS §3.1) and
  `recording_group.include_global_resource_types` (CIS §3.2). Reuses existing
  conditions with new vocabulary; no engine changes. **IAM Access Analyzer
  presence (v1.7)** — the `aws_accessanalyzer_analyzer` vocabulary was already
  present, but the useful check ("does an analyzer exist?") is a project-level
  presence assertion the engine did not support. Added the `requireResource`
  condition (the first non-per-resource condition): evaluated once in a
  PROJECT pass, violates with a synthetic `<project>:0` location when no
  resource of the required type exists anywhere in the scanned project.
  CIS AWS §2.4 is now in the `cisAws` preset. Pair with `.allResources()`;
  environment/alias/region filters are ignored for this condition (it is
  about the project as a whole). Combines freely with per-resource
  conditions on the same rule.
- ✅ **DONE (v0.1.3)** S3 SSL-only bucket policy (`aws:SecureTransport`) —
  the new `requireSslOnlyPolicy` condition inspects the now-parsed
  `Condition` blocks for a `Deny` with `Bool["aws:SecureTransport"]`
  including `"false"` (case-insensitive). Passes when no policy exists
  (combine with `mustHaveAssociated` to require a policy); unresolved
  policies degrade to could-not-evaluate. CIS AWS.

### VPC / networking
- ✅ **DONE** `aws_vpc` → flow logging enabled (a separate `aws_flow_log`
  must reference it via `vpc_id`) via `mustHaveAssociated` (C6, `warn`).
- ✅ **DONE** `aws_subnet` → `map_public_ip_on_launch` (`block`) and
  `assign_ipv6_address_on_creation` (`warn`) via `denyWhenTrue`.
- ✅ **DONE (v1.7)** Network ACL rules (`aws_network_acl_rule`,
  `aws_network_acl`, `aws_default_network_acl`) — the stateless subnet-level
  firewall. Different shape from SG ingress (`rule_number`, `egress`,
  `rule_action`/`action`, `cidr_block` singular), so a new normalize path —
  BUT no new evaluator: the three NACL shapes map into the cloud-neutral
  `ingress` field that the EXISTING `denyIngress` condition already reads.
  `naclRuleToIngress` (standalone) filters on `egress = false` + literal
  `rule_action = "allow"` (a deny rule is restrictive — skip; absent/unresolved
  includes honestly, matching the AWS provider's `egress` default of false).
  `naclInlineIngress` (`aws_network_acl` / `aws_default_network_acl` inline
  `ingress {}` blocks) applies the same action filter via the shared
  `naclEntryToIngress`. `cidr_block` + `ipv6_cidr_block` both feed
  `cidrBlocks`. The `cisAws` preset ships `nacl-no-public-ssh-rdp` (`warn`)
  targeting both the standalone and inline forms — the subnet-edge analog of
  the SG `denyIngress` rule one layer up. 8 `normalize.nacl.test.ts` +
  5 `evaluate.nacl.test.ts` cases pin both halves.
- **Skip — needs a graph layer** public-vs-private subnet checks ("no DB in
  a public subnet"). Requires a multi-hop join
  (`subnet → route_table_association → route → internet gateway`), which
  the per-resource + single-hop (C6) engine deliberately does not do.
  A genuine v2 architectural decision, not a rule.

---

## Multi-cloud (Terraform/HCL, so the whole pipeline is reused)

The engine is provider-neutral. Adding a cloud is per-provider **vocabulary
+ rules**, plus a small `normalize` mapper only for structures that don't
already flatten generically (network rules, mainly). Decision (recorded in
doc 02): each provider gets its own vocabulary module (`AzureResource` /
`GcpResource` and their `*Attribute` companions) behind shared
`AnyResource`/`AnyAttribute` unions — not one giant enum.

### Azure (azurerm) — initial CIS slice, DONE
- ✅ NSG SSH/RDP inbound from internet — `denyIngress`, via an Azure NSG →
  ingress `normalize` mapper (`*`/`Internet` → `0.0.0.0/0`; inline
  `security_rule` + standalone `azurerm_network_security_rule`).
- ✅ Storage: public blob (`allow_nested_items_to_be_public`, `mustBeFalse`),
  `min_tls_version` = TLS1_2 (`mustEqual`), public network access
  (`denyWhenTrue`, warn).
- ✅ MSSQL: hardcoded `administrator_login_password` (`denyLiteral`), weak
  `minimum_tls_version` (`denyValue`), public network access (warn).
- ✅ Key Vault `purge_protection_enabled` (`mustBeTrue`); AKS
  `private_cluster_enabled` + `local_account_disabled` (warn); ownership
  tags (`mustHaveTags`).
- ✅ **CIS-L1 tranche 1:** App Service `https_only`; PostgreSQL/MySQL
  single-server `ssl_enforcement_enabled` + `public_network_access_enabled`;
  Container Registry `admin_enabled`; Cosmos DB `public_network_access_enabled`.
- ✅ **CIS-L1 tranche 2:** RBAC over-permission — `role_definition`
  `permissions.actions` contains `*` (`listContains`, the analog of AWS
  `Action:"*"`) and `role_assignment` Owner (`denyValue`, warn). Needed
  **no new parse shape** — the `permissions` block flattens to a list.
- ✅ **CIS-L1 breadth:** storage + Key Vault `network(_rules|_acls).default_action`
  = Deny (`mustEqual`, warn); managed-disk `disk_encryption_set_id` CMK
  (`mustBeSet`, warn); Key Vault diagnostic-logging presence
  (`mustHaveAssociated` on `azurerm_monitor_diagnostic_setting`, warn).
- **Azure ~ CIS L1 reached.** ✅ **DONE (v1.8.0)** — the optional niche
  remainder is shipped: storage infrastructure-encryption, App Service
  min-TLS (client-cert deliberately skipped — not a universal control),
  Cosmos DB local-auth. Three `warn` `cisAzure` rules reusing existing
  conditions; two new `AzureAttribute` members.

### GCP (google) — initial CIS slice, DONE
- ✅ `google_compute_firewall` SSH/RDP from `0.0.0.0/0` — `denyIngress`, via
  a GCP firewall → ingress `normalize` mapper (INGRESS-only; `allow` blocks
  over `source_ranges`; empty `ports` = all ports).
- ✅ `google_storage_bucket`: `public_access_prevention` = enforced
  (`mustEqual`), `uniform_bucket_level_access` (`mustBeTrue`).
- ✅ Public-IAM anti-pattern: `google_storage_bucket_iam_member` /
  `google_project_iam_member` — `allUsers`/`allAuthenticatedUsers` members
  and primitive `roles/owner` (block) / `roles/editor` (warn) via
  `denyValue`. This is the concept-not-parity analog of AWS `Action:"*"`.
- ✅ `google_compute_instance` broad `cloud-platform` scope (`listContains`,
  warn); Cloud SQL hardcoded `root_password` (`denyLiteral`) + public IPv4
  (`mustBeFalse` on the *deep-nested* `settings.ip_configuration.ipv4_enabled`
  — confirms the flattener recurses past one level).
- ✅ **CIS-L1 tranche 1:** GKE `enable_legacy_abac` (block) +
  `private_cluster_config.enable_private_nodes` + `network_policy.enabled`
  (warn); instance `can_ip_forward` (block) + Shielded-VM
  `shielded_instance_config.enable_secure_boot` (warn); Cloud SQL `ssl_mode`
  (via the new `mustBeOneOf` allowlist condition, warn); KMS
  `rotation_period` (`mustBeSet`).
- ✅ **CIS-L1 tranche 2:** instance no-public-IP — `access_config` present
  via the new `denyBlockPresence` + normalize block-path tracking (catches
  even an empty `access_config {}`).
- ✅ **CIS-L1 breadth:** subnetwork VPC flow logs (`mustHaveBlock(log_config)`,
  warn); bucket versioning (`mustBeTrue`, warn) + access logging
  (`mustHaveBlock(logging)`, warn).
- **GCP ~ CIS L1 reached.** ✅ **DONE (v1.9.0)** — the optional niche
  remainder is shipped: Cloud Audit Logs config presence
  (`requireResource` — uses the v1.7 project-level condition), GKE Shielded
  Nodes, and BigQuery dataset public access (standalone + inline first-block;
  multi-block inline is a known flattener gap, documented). Three `cisGcp`
  rules reusing existing conditions; new vocab:
  `GcpResource.ProjectIamAuditConfig`, `GcpAttribute.ShieldedNodesEnabled`,
  `GcpAttribute.SpecialGroup`, `GcpAttribute.AccessSpecialGroup`.

### API Gateway (beyond CIS L1 — Well-Architected security)
Not part of any cloud's CIS Foundations L1, added as demand-driven breadth.
- ✅ **AWS** `aws_api_gateway_method` `authorization` != `NONE` (`denyValue`,
  warn — CORS `OPTIONS` is the known exception); `aws_api_gateway_stage` /
  `aws_apigatewayv2_stage` access logging (`mustHaveBlock(access_log_settings)`,
  warn); stage `xray_tracing_enabled` (`mustBeTrue`, warn).
- ✅ **Azure** `azurerm_api_management` legacy protocol toggles
  (`security.enable_frontend_tls10/tls11`, `enable_backend_ssl30` via
  `denyWhenTrue`, block) + `public_network_access_enabled` (warn).
- **Skip — GCP.** `google_api_gateway_*` puts auth/security in the OpenAPI
  `api_config` document, not in statically-inspectable HCL attributes — so
  there's little to check without parsing an embedded spec. Apigee is heavy
  and rarely AI-generated. Revisit only if a customer needs it.

### Certificate Manager (ACM) — deprioritized (low value)
Thin governance surface; ACM-managed certs auto-renew. Only minor,
compliance-flavored candidates: `validation_method = "DNS"`, certificate
transparency logging enabled, key-algorithm strength. **Skip** unless a
specific compliance requirement demands it.

### Route 53 — deprioritized (low value)
No common "AI writes dangerous Route 53" pattern. Only minor items:
DNSSEC enabled, query logging. **Skip** unless a compliance need arises.

### Serverless functions (v0.2.0) — DONE
First cross-cloud serverless tranche: AWS Lambda, Azure Functions, GCP
Cloud Run Functions. All reuse existing conditions (no new condition kinds);
the engine work was extending `denyPlaintextEnvSecrets` to serverless
env-var **maps** (not just ECS `container_definitions` JSON) and fixing GCP
`labels` tag extraction.
- ✅ **AWS Lambda** (`aws_lambda_function`) — X-Ray active tracing
  (`mustEqual` on `tracing_config.mode`, warn), env-var KMS encryption
  (`mustBeSet` on `kms_key_arn`, warn), plaintext env-var secrets
  (`denyPlaintextEnvSecrets`).
- ✅ **Azure Functions** (`azurerm_linux_function_app` /
  `azurerm_windows_function_app` / `azurerm_function_app`) — HTTPS-only
  (`mustBeTrue`), TLS 1.2 floor (`mustEqual` on
  `site_config.minimum_tls_version`, warn), public network access
  (`denyWhenTrue`, warn), managed identity (`mustHaveBlock(Identity)`,
  warn — present = use AAD, not a shared/local credential), plaintext
  `app_settings` secrets (`denyPlaintextEnvSecrets`), diagnostic logging
  (`mustHaveAssociated` on `azurerm_monitor_diagnostic_setting`, warn).
- ✅ **GCP Cloud Run Functions** (`google_cloudfunctions2_function`) —
  unrestricted ingress (`denyValue` on `ALLOW_ALL`), runtime service
  account (`mustBeSet` on `service_config.service_account_email`, warn),
  plaintext env-var secrets (`denyPlaintextEnvSecrets`).
- ✅ **Shared ownership tags** across all serverless resource types
  (`mustHaveTags`).
- ✅ **Engine: `denyPlaintextEnvSecrets` extended to env-var maps.** New
  `EnvVarsInfo` model + `envVarsOf` extractor handles
  `environment.variables` (Lambda), `app_settings` (Azure Functions),
  `service_config.environment_variables` (Cloud Run Functions). A
  whole-map reference (`= var.x`) degrades to could-not-evaluate; a mixed
  literal/reference map yields definite verdicts for the literal secrets.
- ✅ **Engine: GCP `labels` tag extraction.** `tagsOf` / `environmentOf`
  now read `labels` for `google_*` resources (was `tags`-only — a false
  could-not-evaluate on GCP resources that use `labels`).

---

## Suggested sequencing

1. ✅ **DONE — cheap wins** — ECS `assign_public_ip`, EKS
   `endpoint_public_access` (via the new `mustBeFalse`), ALB
   `access_logs.enabled` + `drop_invalid_header_fields`.
2. ✅ **DONE — C3** list attributes → EKS public CIDRs + control-plane logging.
3. ✅ **DONE — C1** `denyValue` → ALB weak TLS policy.
4. ✅ **DONE — C5** `default_action` → ALB HTTP→HTTPS listener check.
5. ✅ **DONE — C4** embedded-JSON → ECS `container_definitions` (privileged).
6. ✅ **DONE — C2** `denyLiteral` → Secrets Manager `secret_string` + DB
   passwords.

**All planned capabilities (C1–C6) are built.**

Post-roadmap additions (done): EC2 `root_block_device.encrypted` +
`associate_public_ip_address`; S3 bucket-policy `Action: "*"` (reuses the
IAM parser on `aws_s3_bucket` / `aws_s3_bucket_policy`); **C6 cross-resource
presence** → S3 server-side encryption (`block`) + versioning (`warn`), EKS
`encryption_config`, Secrets Manager rotation (`warn`).

Tier A (CIS logging/audit + IAM baseline) is built: CloudTrail hardening,
IAM password policy, IAM `NotAction`/full-admin depth, plus the `mustBeSet`
capability. AWS now reads as credibly CIS-aligned; **multi-cloud (Azure/GCP)
is the natural next move** — both are Terraform/HCL, so the whole pipeline
(hcl2json → normalize → conditions → report) carries over and expansion is
almost pure vocabulary + rules.

Still open (secondary):
ACM / Route 53 (deprioritized). Note on C6: association is by *resource reference*
(`bucket = aws_s3_bucket.x.id`), the idiomatic wiring — and a `var`/`local`
chain that bottoms out at a resource ref is followed (via `resolvedRef`).
A companion resource that references its parent by a LITERAL string
matching the parent's Terraform label (`bucket = "data"` for
`aws_s3_bucket.data`) is now ALSO linked via the `literalLinks` index
(v1.7) — a heuristic for the common pattern of naming a resource to
match its cloud identifier. An *unresolvable* chain (`var.x` with no
default and no module input) degrades to could-not-evaluate rather than
a false violation.

---

## 1.0.0 — engine feature-complete + product surface

### Terraform structure coverage (DONE)

- ✅ **Provider `default_tags`/`default_labels` inheritance** — a provider's
  default tags merge into every resource's tag set; threaded through module
  following (nested modules inherit the root's defaults). Fixes a false
  violation on tagless resources whose tags come from the provider.
- ✅ **Resource `count = 0` / `for_each`-empty skip** — disabled resources
  are skipped silently (no false violation). Unresolvable `count`/`for_each`
  followed once (honest).
- ✅ **Resource `for_each` per-element expansion** — a resolvable `for_each`
  expands into one `NormalizedResource` per element, with `each.*` threaded
  into a per-instance scope. Violations show `type.name[key]`.
- ✅ **`dynamic` blocks beyond ingress/egress** — a `dynamic "settings" {}`
  on any block (except ingress/egress/tags) is expanded into `<name>.*`
  attributes. `mustHaveBlock`/`denyBlockPresence` see the block.
- ✅ **Data sources as governed resources** — `data "aws_ami" "x" {}`
  normalized with type `data.aws_ami`; existing conditions apply.
- ✅ **Provider alias scoping + module `providers` map remapping** —
  `.providerAlias(X)` scopes a rule to a provider alias; a module call's
  `providers = { aws = aws.dr }` remaps the child's default to the parent
  alias.
- ✅ **Conservative ternary evaluation** — `${ref (==|!=) scalar ? scalar
  : scalar}` resolves to a literal; anything compound stays unresolved.
- ✅ **Meta-arg filtering** — `count`/`for_each`/`depends_on`/`provider`
  excluded from attribute harvesting; `lifecycle` kept as nested block.

### New rule conditions (DONE — 20+)

- Resource: `denyProvisioner`, `denyIgnoreChanges`,
  `denyPlaintextConnectionSecret`, provider-alias scoping.
- Output: `denyInsensitiveSecretOutput` (multi-segment data-source attrs).
- Binding: `denyInsensitiveVariable`, `denyPlaintextLocalSecret`.
- Settings: `requireExactTerraformVersion`, `denyFloatingProviderVersion`,
  `requireEncryptedBackend`, `denyLocalBackend`.
- Module-call: `denyFloatingModuleVersion`.
- Lifecycle: `mustBeTrue`/`denyWhenTrue` on `lifecycle.prevent_destroy` /
  `create_before_destroy` (via `LifecycleAttribute` enum — no new condition).

### New vocabulary (DONE)

- `Provisioner { LocalExec, RemoteExec, File }`
- `LifecycleAttribute { PreventDestroy, CreateBeforeDestroy, IgnoreChanges }`
- `DataResource { AwsAmi }`, `DataAttribute { AmiOwners }`
- `AwsAttribute.AtRestEncryptionEnabled`, `TransitEncryptionEnabled`

### Product surface (DONE)

- ✅ **Inline ignore directives** (`# dotzen:ignore[: reason]`) — suppress
  findings on a block; anchored regex (no false match on string values).
- ✅ **Frozen JSON schema** (`schemaVersion: 1`) — top-level + per-entry
  fields pinned by a schema-stability test.
- ✅ **Curated CIS presets** — `cisAws` (23 rules), `cisAzure` (17),
  `cisGcp` (21). Each proven end-to-end on real Terraform fixtures.
- ✅ **CI integration templates** — GitHub Actions + GitLab CI YAML.
- ✅ **Performance verified** — ~195ms for 1200 resources.
- ✅ **Scaffold updated** — shows presets, new conditions, ignore directives.

**The engine is feature-complete for static Terraform governance across
AWS, Azure, and GCP.** 492 unit + 34 integration tests. Build, typecheck,
lint, format all green.

### Vocabulary breadth — DONE

Running dotzen against a **realistic RDS fixture** (variables, locals,
ternaries, supporting resources) revealed that 50% of a real deployment's
resources are NOT in the vocabulary — `aws_iam_role`,
`aws_iam_role_policy_attachment`, `aws_cloudwatch_metric_alarm`,
`aws_db_subnet_group`, `aws_db_parameter_group`, `aws_ssm_parameter`. The
ungoverned telemetry surfaces these correctly, but the coverage gap is
real. The first batch (7 types) was added and cut ungoverned from 8 → 1
on the fixture.

**DONE:**

1. ✅ **DONE — Add the full AWS supporting-resource vocabulary** —
   `AwsResource` grew from 57 → 521 members across VPC/network, IAM,
   storage, compute, monitoring, Route53/ACM, EKS/ECS, RDS variants,
   EFS/FSx, KMS/Secrets/SSM, CloudTrail/Config, SQS/SNS/Kinesis,
   EventBridge, ALB/NLB, Lambda, Elastic Beanstalk/AppRunner/Lightsail,
   Glue/Athena/EMR/Step Functions, CloudFront/WAF/Shield/GAX, DynamoDB/
   ElastiCache/MQ/MSK, VPC Lattice/Verified Access/Network Firewall,
   SES/Pinpoint/Connect, Backup/DR, RAM/Macie/GuardDuty/Detective/
   SecurityHub/Inspector, Organizations/SSO/Transfer, AppConfig/Amplify,
   and more. Also: AWS enums extracted to `src/vocabulary/aws.ts` (mirrors
   azure.ts/gcp.ts/data.ts pattern), halving `index.ts` from 325 → 166
   lines.

2. ✅ **DONE — Add Azure + GCP supporting resources** —
   `AzureResource` grew from 19 → 318, `GcpResource` from 7 → 227.
   Azure covers networking (VNet/subnet/NIC/LB/DNS/Frontdoor/CDN),
   compute (VM/VMSS), storage, databases (MSSQL/PostgreSQL-flexible/
   MySQL-flexible/CosmosDB/DataFactory/Databricks/Synapse), containers
   (AKS/container-app/service-fabric), IAM, key vault, security (sentinel/
   security-center), backup/recovery, event-grid/service-bus/event-hub/
   IoT/SignalR, API management, app service, resource groups/policy.
   GCP covers compute (disk/image/snapshot/instance-group/autoscaler/
   target-pool/proxy/url-map/backend-service/forwarding-rule/health-check/
   ssl-cert/security-policy/router/vpn), networking (VPC/shared-VPC/DNS),
   storage (bucket-object/acl/IAM/filestore), IAM (project/org/folder/
   service-account/workload-identity), SQL, GKE, KMS, cloud-run,
   pub-sub/eventarc/tasks, bigquery/dataflow/dataproc/composer,
   spanner/firestore/memorystore, cloudbuild/clouddeploy, secret-manager,
   network-security, VPC-SC, apigateway/apigee, logging/monitoring,
   cloud-trace, identity-platform, billing, vertex-AI, binary-authorization/
   artifact-registry.

3. ✅ **DONE — Add the comparison-in-local eval pattern** — new
   `tryEvalComparison()` helper in `normalize.ts` evaluates
   `${ref (==|!=) scalar}` (no ternary). `tryEvalTernary()` extended to
   accept bare-ref conditions `${local.is_prod ? a : b}` where
   `local.is_prod` resolves to a boolean (directly or via a comparison
   stored in a local). Non-boolean literals (strings/numbers) stay
   unresolved — Terraform forbids them as conditions, so we refuse to
   guess. 5 new unit tests + 3 integration tests pin the behavior.

4. ✅ **DONE — `UTILITY_TYPES` silently-skipped set** — new
   `UTILITY_TYPES` set in `normalize.ts` covering `random_password`,
   `random_string`, `random_id`, `random_uuid`, `random_shuffle`,
   `random_pet`, `random_integer`, `random_bytes`, `terraform_data`.
   Silently skipped in `collectUngoverned` — neither governed nor
   surfaced as a coverage gap. 3 unit tests prove: real gaps still
   surface, utilities don't, `data.random_*` also skipped.

5. ✅ **DONE — Realistic fixture as a permanent integration test** —
   `realistic-rds/` wired into `check.test.ts` with pinned assertions:
   3 violations, 1 couldNotEvaluate, 0 ungoverned (random_password
   silently skipped), 32 passed.

6. ✅ **DONE — Dogfood via AI-style fixtures × 3 clouds** — three
   comprehensive AI-generated Terraform fixtures created
   (`realistic-aws/`, `realistic-azure/`, `realistic-gcp/`), each ~25-40
   resources with variables, locals, ternaries, `random_*` utilities,
   local module calls, deliberately ungoverned resource types, and
   couldNotEvaluate cases. Pinned integration tests assert v/p/cne/
   ungoverned counts per cloud. Results:
   - AWS: 1 violation, 55 passed, 1 CNE, 1 ungoverned.
   - Azure: 4 violations, 13 passed, 1 CNE, 1 ungoverned.
   - GCP: 4 violations, 9 passed, 1 CNE, 1 ungoverned.
   Total recognized types: 1003 (was 83). Ungoverned noise on real
   module repos should drop from ~50% to <5%.

**Bug fix:** `findTfFiles` in `parse.ts` was using `fs.readdirSync(dir,
{ recursive: true })` — recursive scan discovered `.tf` files in
`modules/` subdirectories directly AND `followModules` re-normalized
them via `module {}` calls → duplicate violations on governed resources
inside local modules. Fixed: non-recursive scan (top-level `.tf` files
only), matching Terraform's own root-module loading behavior.

**Vocabulary verification:** All 1003 enum values verified against the
actual HashiCorp Terraform provider documentation (AWS 1678 resources,
Azure 1103, GCP 1465 with IAM expansion). Results: AWS 484/484 (100%),
GCP 201/201 (100%), Azure 266/318 (84% — the 52 unverified are
deprecated-but-real resources like `azurerm_app_service`,
`azurerm_function_app`, `azurerm_mariadb_*`, `azurerm_mysql_server`,
`azurerm_postgresql_server` that are still in the provider but not in
current docs; kept intentionally). 63 fabricated/wrong-named values
removed (37 AWS + 26 GCP); 7 AWS `transit_gateway` values renamed to
`ec2_transit_gateway` (correct Terraform resource type includes the
`ec2_` prefix).

---

## Next steps (post-verification)

1. ✅ **DONE — Rules for the new vocabulary (first batch)** — added 7
   new preset rules governing previously-ungoverned resource types:
   - `coreSecurity`: CloudWatch log group retention (`mustBeSet`,
     warn), SQS queue KMS encryption (`mustBeSet`, warn), SNS topic KMS
     encryption (`mustBeSet`, warn), EFS file system encryption
     (`mustBeTrue`).
   - `cisAws`: EKS node group no direct SSH (`denyBlockPresence` on
     `remote_access` block — use SSM Session Manager instead).
   - `cisGcp`: GKE Workload Identity (`mustHaveBlock` on
     `workload_identity_config`).
   New vocabulary: `AwsAttribute.RetentionInDays`, `KmsMasterKeyId`;
   `Block.RemoteAccess`, `Block.WorkloadIdentityConfig`. CIS GCP smoke
   fixture updated (good_gke cluster now has `workload_identity_config`).
   Remaining: ~910 types still ungoverned-by-rule — future batches by
   security impact (S3 access logging, IAM user inline policies, ECS
   container insights, Route53 DNSSEC, etc.).

2. ✅ **DONE — Ref-branch ternary resolution** — `tryEvalTernary` now
   resolves sole-ref branches through scope. The pattern
   `${local.is_prod ? 30 : var.retention}` where `var.retention` has a
   default now resolves to the default value instead of degrading to
   could-not-evaluate. The chosen branch is resolved via `resolveValue`,
   so ref chains (var→local→literal), nested ternaries, and comparison
   locals all resolve. Compound branch expressions (arithmetic, function
   calls) stay unresolved (conservative). 5 new unit tests; realistic-rds
   and realistic-aws fixtures updated (CNE 1→0).

3. ✅ **DONE — Real-world dogfood (3 clouds)** — ran v1.4.3 against
   `terraform-aws-modules/terraform-aws-vpc` (5 .tf files),
   `Azure/terraform-azurerm-aks` (8 .tf files), and
   `terraform-google-modules/terraform-google-kubernetes-engine` (12 .tf
   files). Results: 1192 checks, 4 real violations (AKS private endpoint,
   Contributor role, GKE private nodes, GKE legacy ABAC), 17 CNE
   (legitimately unresolvable: data-source IAM policies, interpolated IAM
   members, compound firewall expressions), 46 ungoverned → 14 after
   fixes. Zero false positives after the config-flag suffix skip. Drove
   4 fixes (landed in v1.5.0): false-positive elimination, UTILITY_TYPES
   expansion, data source vocabulary, azapi_update_resource. Noise floor:
   2.6% (was ~50% pre-vocabulary expansion).

4. ✅ **DONE — Azure deprecated-resource verification** — cloned the
   azurerm provider Go source and grep'd the `ResourcesMap` registration
   files for all 52 "orphan" type strings. Results: 16 exact match (kept),
   10 renamed (generic type replaced with specific subtypes — `azurerm_metric_alert`
   → `azurerm_monitor_metric_alert`, `azurerm_traffic_manager_endpoint` →
   `azurerm_traffic_manager_external_endpoint` + 3 others, `azurerm_policy_exemption`
   → 4 scoped variants, `azurerm_automation_variable` → 5 typed variants),
   26 completely removed from the provider (dead enum values that match
   no real HCL). Removed 36 dead values, added 20 verified subtypes.
   Azure enum: 318 → 302 (303 actual after format). 1 preset fix:
   `cis-azure.ts` MysqlServer → MysqlFlexibleServer (the deprecated
   single-server was removed from the provider; flexible server is the
   current resource). All 4 gates green: 577 tests, typecheck, lint, format.

---

## Post-dogfood improvements

5. ✅ **DONE — GCP interpolated IAM member resolution** — eliminates the
   `member = "serviceAccount:${google_service_account.default.email}"`
   pattern (12 of 14 couldNotEvaluate on the
   `terraform-google-kubernetes-engine` dogfood) via two conservative
   changes:
   - **Resolver** (`normalize.ts` `tryEvalConcat`): the form
     `prefix${sole_ref}suffix` — exactly one interpolation that is a
     sole `var.x`/`local.y`/`each.*` reference surrounded by bare literal
     text — resolves to the concatenated literal when the ref resolves
     through scope. Multi-interpolation strings, compound inner exprs
     (ternaries, function calls), and resource-attribute refs (no scope
     entry) stay unresolved honestly.
   - **`denyValue` literal-prefix rule** (`evaluate.ts`
     `denyValueExcludedByLiteral`): the change that actually eliminates
     the GKE CNE. A resource-attribute ref (`google_service_account.x.email`)
     is *not* resolvable statically, so the resolver cannot help — but the
     resolved value always starts with `serviceAccount:` and so can never
     equal a bare denylist scalar like `allUsers`. The evaluator now
     returns a definite PASS (not couldNotEvaluate) when an unresolved
     expr's single `${...}` block has literal prefix/suffix text that
     rules out every denylist scalar (`D.startsWith(prefix) &&
     D.endsWith(suffix) && D.length >= prefix.length + suffix.length`).
     Conservative limits fall back to CNE: multiple interpolations, a
     dynamic denylist scalar containing `${`, no literal text outside the
     interpolation, or a prefix that is consistent with a denylist scalar
     (e.g. `allUser${var.s}` could resolve to `allUsers`).
     11 new `evaluate.compound.test.ts` cases + 10 new
     `normalize.resolve.test.ts` cases pin both halves.

  5b. ✅ **DONE (v1.9.31-pre) — Bare resource-attr `member` ref (dogfood round 11).**
     The bare-ref analog of item 5: `member = google_service_account.<name>[<idx>].member`
     has NO literal text, so the prefix/suffix rule can't help — but the
     provider type-system guarantees the value is a service-account identifier,
     which can never equal a bare public-principal scalar (`allUsers` /
     `allAuthenticatedUsers`). New `denyValueExcludedByResourceAttr` returns a
     definite PASS (not CNE) for `google_service_account.*.{member,email,name}`
     refs when no denylist scalar could itself be a service-account identifier
     (conservative `serviceAccount:` / `@` guard). Dropped the
     terraform-google-kubernetes-engine module from 15 CNE → 3 (the 12
     `.member`-ref IAM members now PASS). 5 new `evaluate.compound.test.ts` cases.

6. ✅ **DONE — More rules for the governed surface (batches 2+3)** —
   batch 2 (v1.5.1): DynamoDB encryption + PITR, S3 access logging, ALB
   access logging. Batch 3 (v1.5.3): RDS cluster encryption, S3 bucket
   versioning (`mustHaveAssociated`), ECR lifecycle policy
   (`mustHaveAssociated`). Total rules added across all batches: 14.
   Remaining items not feasible with existing conditions: IAM user no
   inline policies (needs "deny if associated" — inverse of
   `mustHaveAssociated`), WAFv2 Web ACL on ALB (needs ARN-based
   association matching — engine only does address-based), ECS container
    insights (complex `setting` block with name/value pair — needs new
    condition type). These are future engine enhancements.

7. ✅ **DONE — `data.aws_iam_policy_document` policy resolution** — the
   idiomatic Terraform pattern for composing an IAM policy (author
   `statement {}` blocks on a `data "aws_iam_policy_document" "x" {}`
   and wire it via `policy = data.aws_iam_policy_document.x.json`) now
   resolves end-to-end. The normalize layer parses the data source's
   statement blocks (data-source form: `effect`/`actions`/`not_actions`/
   `principals { type, identifiers }`/`condition { test, variable,
   values }`) into the same `PolicyInfo` a literal-JSON/jsonencode policy
   produces. A cross-file index (`buildDataPolicies`, scoped per
   directory — data sources are module-local) lets a consuming
   resource's data-source ref resolve at normalize time. Engine
   unchanged — `denyIamWildcard`/`denyPublicPrincipal`/
   `requireSslOnlyPolicy` now fire on data-source-composed policies
   instead of degrading to could-not-evaluate. 9 new
   `normalize.datapolicy.test.ts` + 3 `evaluate.datapolicy.test.ts`
   cases pin both halves.

8. ✅ **DONE (v1.9.1) — `count` per-index expansion + `each.value.<field>`
   resolution** — two module-following resolver improvements that convert
   could-not-evaluate findings to definite verdicts:
   - **`count = N` (literal N > 0) expansion**: the resource loop now
     expands into N instances (was: followed once). Each instance gets
     `count.index` threaded into its scope and `instanceKey = "<i>"`. A
     `count = var.n` that resolves to a literal expands too; an
     unresolvable count is still followed once honestly (count.index refs
     degrade to CNE — never a false verdict). `count = 0` skip and
     `count = 1` single-instance behavior unchanged.
   - **`each.value.<field>` field access**: a `for_each` over a MAP of
     objects now resolves dotted field access on the element
     (`each.value.port`, `each.value.cidr`). A new `EACH_VALUE_FIELD`
     regex + resolver branch extracts the named field from the `each.value`
     scope entry; a for_each over SCALARS has a non-object element → field
     access degrades to unresolved (honest). The `tryEvalConcat` helper was
     generalized to delegate inner resolution to `resolveValue` (handles
     sole refs, `each.value.<field>`, and conservative ternaries), so
     compound interpolations like `name-${each.value.env}` resolve too.
   `SOLE_REF` now also matches `count.index` (so `resolveRaw` handles it
   for association linking too). 10 new `normalize.count.test.ts` cases
   pin both behaviors.

9. ✅ **DONE (v1.9.2) — Dogfood round 2 fixes** — running v1.9.1 against 4
   real module repos (terraform-aws-modules/vpc,
   terraform-google-modules/kubernetes-engine, Azure/terraform-azurerm-aks,
   terraform-aws-modules/iam) surfaced two issues:
   - **`requireEncryptedBackend` false-positive storm**: fired 40–63x per
     module repo (every `versions.tf` with no backend). Module repos
     intentionally declare no backend — the backend is the env/layer
     consumer's concern. Fixed: absence is now a PASS; the rule fires only
     on a declared-but-unencrypted backend. The "must declare a backend"
     concern is `denyLocalBackend`'s job.
   - **`aws_security_group_rule` ungoverned**: the legacy standalone SG rule
     (handles both ingress/egress via `type`) was not in the vocabulary.
     Added + mapped to the cloud-neutral `ingress` field (filtering on
     `type = "ingress"`); `denyIngress` governs it unchanged.
   **Confirmed wins** (v1.7–v1.9 features working in production): the v1.7
   GCP IAM member fix eliminated all `serviceAccount:${...}` CNE on the GKE
   module (was 12 of 14 in v1.5.0); the v1.7 `data.aws_iam_policy_document`
   resolution kept the IAM module at 2 total CNE; NACL governance produced
   no false violations on the VPC module.

10. ✅ **DONE (v1.9.3) — `denyInsensitiveVariable` config-flag precision**
    (dogfood round 2, Finding #3) — the rule over-fired on config-flag
    variables whose names contain a secret-like word (the AWS IAM module
    produced 129 false positives on names like `max_password_age`,
    `create_access_key`). Three-pronged fix: (1) **type-based skip** — a
    `bool`/`number`-typed variable is definitionally not a secret (the
    `type` constraint is now threaded through `NormalizedBinding`); (2)
    **verb-prefix skip** — `allow_*`/`create_*`/`attach_*`/`enable_*`/
    `disable_*`; (3) **extended config-flag suffix list** — added `_status`,
    `_policy`, `_arns`, `_permission`, `_age`, `_length`, `_required`,
    `_prevention`. The IAM module dropped from 159 → 30 violations (0
    secret-variable false positives remain; all 30 are legitimate inline-
    policy findings).

---

## Dogfood-driven precision + vocabulary + preset audit (v1.9.4 → v1.9.16)

Items 9–10 (round 2) introduced config-flag precision on
`denyInsensitiveVariable`. Rounds 3–11 extended that precision, closed the
vocabulary gaps that surfaced as `ungoverned`, and completed a full preset
audit. **Convergence: 0 false positives from round 6 onward** across 25+ real
module repos (terraform-aws-modules / terraform-google-modules / cloudposse).

### Precision hardening — secret-detection rules (v1.9.4–v1.9.9, rounds 3–8)

`denyInsensitiveVariable` / `denyPlaintextLocalSecret` over-fired on
identifier-shaped and config-flag names. Layered, conservative skips added
(each eliminated single-suffix false positives on a fresh repo without
weakening real catches):

- **Type-based skip** — a `bool`/`number` and any collection-typed variable is
  definitionally not a secret (`NormalizedBinding.type` threaded through
  normalize → evaluate).
- **Verb-prefix skip** — `allow_*`/`create_*`/`attach_*`/`enable_*`/`disable_*`.
- **Config-flag suffix list** — grew to 27 suffixes (`_enabled`, `_disabled`,
  `_interval`, …, `_strategy`, `_path`).
- **Identifier suffix (locals only)** — `_name`/`_arn`/`_sa`/`_path`/…: a
  local like `secretstore_name` is a resource identifier, not a hardcoded
  secret. Config-flag suffixes deliberately do NOT apply to locals.

### `UTILITY_TYPES` + `DataResource` expansion (v1.9.4–v1.9.9)

Silent-skip / recognized-read-only additions that collapsed `ungoverned`
noise on real module repos: `cloudinit_config`, `local_file`, `aws_arn`,
`external`, `docker_*`, `terraform_remote_state`, 40+ Kubernetes-provider
types (Helm / kubectl / native K8s — not cloud IaC), `archive_file`; data
sources `aws_iam_policy`, `aws_cloudwatch_log_group`, `aws_canonical_user_id`,
`aws_secretsmanager_secret(_version)`, `aws_subnets`, `aws_route53_zone`,
`aws_ecrpublic_authorization_token`, etc.

### Ungoverned-vocabulary closure rounds (v1.9.10–v1.9.12, rounds 9–10)

Recognized-but-not-yet-rule-bearing enum-adds driven directly by dogfood
`ungoverned` output — each round drove a repo's ungoverned to 0:

- **v1.9.10** — `_path` suffix; `aws_iam_policy_attachment` (the generic form)
  + EventBridge legacy (`event_rule`/`event_target`/`event_connection`/
  `event_api_destination`).
- **v1.9.11** — EC2 modern (`aws_ec2_tag`, `aws_volume_attachment`,
  `aws_network_interface`, `aws_ec2_capacity_reservation`), EventBridge modern
  (`aws_pipes_pipe`, `aws_scheduler_schedule(_group)`,
  `aws_cloudwatch_log_delivery*`), GCP (`google_project`,
  `google_project_service`, `google_compute_router_interface`/`_peer`,
  `google_organization_policy`), 4 data sources.
- **v1.9.12** — `data.archive_file` → `UTILITY_TYPES`; Aurora
  (`aws_rds_cluster_activity_stream`/`_parameter_group`, `aws_rds_shard_group`,
  `aws_appautoscaling_*`, `aws_dsql_cluster(_peering)`), CloudWatch Logs
  (`log_account_policy`/`log_anomaly_detector`/`log_data_protection_policy`/
  `log_subscription_filter`), Route53 (`hosted_zone_dnssec`/`key_signing_key`/
  `resolver_firewall_rule`), 3 data sources.

### Preset audit — DB-cluster / credential / data-store coverage (v1.9.13–v1.9.16)

A systematic cross-reference of all eight presets against the vocabulary
closed the cluster-family blind spots (the "Aurora pattern": a sibling
cluster resource carries the attribute but the rule missed it):

- **v1.9.13** — Aurora governance gap: `coreSecurity` gained
  `no-hardcoded-cluster-password` (`aws_rds_cluster`/`aws_redshift_cluster` →
  `master_password`); scaffold + ai-generated example specs made Aurora-aware
  for storage encryption.
- **v1.9.14** — DocDB cluster added to encryption + cluster-password rules;
  Aurora backup retention (`coreSecurity` ≥7, `pciDss` ≥30) now targets
  `aws_rds_cluster`; ElastiCache `auth_token` plaintext (`coreSecurity`).
- **v1.9.15** — OpenSearch (`encrypt_at_rest` / `node_to_node_encryption` /
  `enforce_https`), Amazon MQ `admin_password`, Secrets Manager
  `secret_string` (warn), ElastiCache transit (warn), Azure SQL
  `administrator_login_password`, Aurora/DocDB cluster-instance
  `publicly_accessible` (cis-aws / pci / data-protection). OpenSearch
  nested-block flattening verified end-to-end.
- **v1.9.16** — MSK `client_broker` (deny `PLAINTEXT`). The flagged risk
  (2-level nested `encryption_info.encryption_in_transit.client_broker`)
  needed **no normalize change** — the flattener already recurses at
  arbitrary depth; verified empirically.

**The preset audit is 100% complete.** Every DB-cluster type (Aurora / DocDB /
Redshift), every credential surface (RDS/Aurora/DocDB/Redshift/MQ/Secrets
Manager/ElastiCache), OpenSearch, and MSK are governed.

---

## Current state (v1.9.37) & still-open

Engine feature-complete for static HCL governance: 801 unit + 40 integration
tests (90 unit files), 0 false positives since dogfood round 6 across 35+ real
module repos, ~3,200 resource/data types recognized across AWS/Azure/GCP, three
output formats (terminal, JSON, SARIF 2.1.0), **144 rules across 8 presets
including the v2 graph layer** (multi-hop dependency-graph rules — the first
topology-aware static Terraform controls). **Repo + CI on GitHub**
(`github.com/ealmachado-eng/dotzen`, public) — npm provenance attestations on
every release, with a `gate` job the `publish` job depends on so a correctness
regression can't ship.
`coreSecurity` + the per-cloud CIS packs are the shipped baselines;
`dotzen init --profile {startup,enterprise,regulated}` scaffolds a ready-to-go
org spec (the same profiles that seed `examples/`).

**v1.9.28 → v1.9.37 (launch hardening):** graph-layer edge precision (NAT
structural-ref override, CNE for opaque graph edges, list-edge traversal so
`buildGraph` scans `res.lists`, Azure VM→NIC→PublicIP reachability, violation
path detail for `denyIfSharedWith`/`denyIfReachableAttr`); `denyValueExcludedByResourceAttr`
(bare GKE `google_service_account.*.{member,email,name}` refs → definite PASS,
dogfood round 11 — module dropped 15 CNE → 3); vocabulary rounds 11–13 +
example-spec generation via `npm run gen-examples`; launch README rewrite
(ASCII diagrams, absolute links, Quick Start reordered, `prepack` copies root
README into the tarball); `dotzen init --profile/--presets`; CI release gate
(`publish needs: [gate]`); Stryker mutation testing evaluated (engine 74.82% /
profiles 52.85% — no real verdict-logic gaps found, kept periodic not gated);
ADR documenting the archived `@cdktf/hcl2json` supply-chain risk + the
own-the-WASM future mitigation.

**Genuinely open — capability, not coverage:**

- **Compound caller inputs** — ✅ **DONE (post-v1.9.18).** Terraform built-in
  function modeling for the four list-yielding functions AI-generated
  Terraform reaches for most: `toset()` / `tolist()` (identity-on-list — the
  `for_each = toset([...])` pattern), `concat()` (N lists → one), and
  `flatten()` (single-level flatten of a list-of-lists). A new
  `tryEvalFunctionCall` evaluator sits in the `resolveValue` chain and returns
  a list-literal `NormalizedValue` for any resolvable list argument;
  `resolveListExpr` is the single entry point wired into `expandForEach` /
  `forEachIsEmpty` / `dynamicBlocks` (so `for_each = toset(["dev","prd"])`
  now expands to two real instances — was: one honest follow) and into
  `collect` (list-attr routing: a function-call result lands in
  `NormalizedResource.lists`, never `attributes`, so scalar-attr evaluators
  never see an array) and the ingress cidr extractors (a `concat()` result
  spreads into one `NormalizedValue` per cidr). `merge()` was generalized too:
  the tag-only `tagKeys` path now delegates to a reusable, value-producing
  `resolveMergeMap` (returns the merged map + a `complete` flag; object
  literals with ref VALUES keep key-presence — the partial-key semantic tags
  rely on — while marking values undefined). Any non-list / unresolvable /
  unknown-function argument degrades honestly to unresolved
  (could-not-evaluate) — never a guess, never a false verdict. The
  `NormalizedValue.literal.value` type widened to `Scalar | readonly Scalar[]`
  (Phase 0 plumbing) with defensive `!Array.isArray` guards on the two
  `String(v.value)` engine paths. 44 new unit tests in
  `normalize.functions.test.ts` + the obsolete `parse.test.ts` "toset followed
  once" assertion rewritten to assert the new (correct) expansion. Remaining
  niche: deeper `flatten()` recursion (Terraform's is recursive; we cover one
  level — the common `[var.a, var.b]` shape) and other built-ins
  (`keys`/`values`/`length`/`contains`) — low ROI, add on demand.
- **`data.aws_iam_policy_document` through `followModules`** — ✅ **DONE
  (v1.9.17 / v1.9.18).** A child module consuming its OWN data doc
  (`policy = data.aws_iam_policy_document.x.json`) already resolved (data
  sources are module-local — `childDataPolicies` in `followModules`). v1.9.17
  added the **module-output** path: a PARENT resource consuming a child's
  exposed policy (`policy = module.m.policy_json`) resolves via a
  `<label>.<output>` index built while following. v1.9.18 closed the
  **nested passthrough** case — `module.outer` re-exporting `module.inner`'s
  policy output (`output x = module.inner.y`): `followModules` now recurses
  into nested modules BEFORE the child normalizes, so a child resource's
  `policy = module.inner.x` AND a child's passthrough output both resolve
  transitively through the grandchild `moduleOutputPolicies` index (arbitrary
  depth). `policyOf` resolves `data.aws_iam_policy_document.x.json`,
  `module.<label>.<output>`, and transitive passthroughs.
- **BigQuery multi-access-block inline flattener** — ✅ **DONE (v1.9.20).**
  Inline `access {}` blocks are all collected now (was: first block only via
  `v[0]`). `collect` aggregates repeated nested blocks: a key unique to one
  block stays a scalar attribute (backward-compatible), a key that recurs
  across blocks is aggregated into `lists`. `denyValue` is list-aware — fires
  if ANY block's value matches the denylist, degrades to could-not-evaluate
  if any item is unresolved. A public grant in a later `access {}` block is
  no longer missed.

**Open — low priority:**

- ✅ **DONE (v1.9.30-pre) — Round-11 minor ungoverned enum-adds.** Verified
  the candidate names against the AWS provider Go `ResourcesMap` (cloned
  `hashicorp/terraform-provider-aws`, grepped the per-service
  `service_package_gen.go` `TypeName` registrations + `@SDKResource` /
  `@FrameworkResource` annotations — the method the v1.x Azure audit used;
  web fetch was unusable since the provider docs went registry-JS-only). All
  candidates were real, added to `AwsResource` (which `KNOWN_TYPES` derives
  from, so they auto-collapse ungoverned): `aws_elasticache_global_replication_group`,
  `aws_elasticache_serverless_cache`, `aws_opensearch_package_association`,
  `aws_opensearch_vpc_endpoint`, and the OpenSearch Serverless family
  (`aws_opensearchserverless_collection` / `_security_policy` /
  `_security_config` / `_access_policy` / `_lifecycle_policy` / `_vpc_endpoint`).
  Recognized, not yet rule-bearing.
- ✅ **DONE (v1.9.31-pre) — Round-12 minor ungoverned enum-adds** (dogfood
  round 11). Names taken straight from real module `.tf` (observed-in-the-wild
  = inherently verified, no provider clone needed): `aws_vpc_security_group_rules_exclusive`,
  `aws_vpc_security_group_vpc_association`, `azurerm_monitor_data_collection_rule(+_association)`,
  `google_service_networking_connection`. Plus `kubernetes_config_map_v1_data`
  (+ non-v1 sibling) → `UTILITY_TYPES` (k8s provider, not cloud IaC).
- ✅ **DONE (v1.9.32-pre) — Round-13 minor ungoverned enum-adds** (dogfood
  round 12). Observed-in-the-wild on terraform-aws-modules/eks + autoscaling,
  cloudposse/rds, terraform-google-modules/project-factory. AWS resources:
  `aws_eks_access_entry`, `aws_eks_access_policy_association`,
  `aws_autoscaling_traffic_source_attachment`, `aws_db_option_group`. AWS
  read-only data sources → `DataResource`: `aws_eks_addon_version`,
  `aws_eks_cluster_versions`, `aws_ec2_instance_type`, `aws_iam_session_context`.
  `tls_certificate` data source → `UTILITY_TYPES` (TLS provider, not cloud IaC).
  GCP resources: `google_compute_subnetwork_iam_member`,
  `google_project_default_service_accounts`, `google_resource_manager_lien`,
  `google_tags_tag_binding`, `google_project_service_identity`,
  `google_service_usage_consumer_quota_override`, `google_project_usage_export_bucket`.
  Drove eks/autoscaling/cp-rds ungoverned → 0; gpf 12 → 7 (the remainder are
  deeper-niche — essential_contacts, access_context_manager perimeters,
  cloud_armor_tier — diminishing returns).
- ACM / Route 53 — deprioritized (thin / no dangerous AI-gen surface).

---

## Future directions (post-engine-feature-complete)

The static-analysis engine is at diminishing returns on coverage/precision.
The levers below are either a genuine new capability, an adoption unlock, or
a strategic pivot — listed by category, not priority.

### Architectural — the next real capability

- **v2 graph layer (dependency-graph rules).** The engine is deliberately
  per-resource + single-hop association (`mustHaveAssociated`). A class of
  real controls needs a multi-hop join the engine does not do:
  - **Public-vs-private subnet classification** — `subnet → route_table_association → route → internet_gateway` (the documented skip under VPC/networking above). Unlocks "no DB / no IGW in a public subnet", prod-VPC isolation rules.
  - **Resource dependency chains** — e.g. "an SG attached to a public ALB must not be attached to a private DB", KMS-key-to-bucket provenance, load-balancer-to-target reachability.
  This is a v2 architectural decision (a graph index over `NormalizedResource[]`), not a rule. It adds a new condition family (`denyIfReachable`, `mustBeInPrivateSubnet`) and a build pass after normalize. Scope it as its own design doc before coding.
  ✅ **DONE (v1.9.26–27).** Design doc `docs/specs/10-graph-layer.md`. Three
  conditions shipped (`denyIfReachable`, `denyIfSharedWith`, `denyIfReachableAttr`)
  with edge-type classification (routing/security/encryption/structural),
  bidirectional BFS, module-scope isolation, violation path detail, and 3
  preset rules (cis-aws ×2, data-protection ×1). 769 unit + 40 integration.

  **Remaining graph-layer improvements (prioritized):**
  - ✅ **DONE (v1.9.29) — Resource-type-aware edge classification.** `subnet_id`
    on a NAT gateway was classified as `routing` (it IS a routing attr name),
    but semantically it's a deployment ref — it created the false chain
    `private_DB → … → NAT → public_subnet → … → IGW`. `classifyEdge` now takes
    the resource type and consults a `STRUCTURAL_REF_BY_TYPE` override map
    (`aws_nat_gateway.subnet_id` → structural). Extensible per-type. A private
    DB egressing via a NAT deployed in a public subnet no longer false-violates;
    `aws_db_instance.subnet_id` stays routing (the governed case).
  - ✅ **DONE (v1.9.29) — CNE for unresolved graph edges.** If a chain is
    partially unresolvable (`subnet_id = var.x` no default), the query now
    degrades to could-not-evaluate instead of pass. `ReachResult` gains
    `conditional`; `buildGraph` records opaque var/local refs on typed attrs
    (routing/security/encryption) in a `conditionalEdges` index. If a definite
    BFS misses the target but traversed a node carrying an opaque edge of a type
    the query follows → CNE (never a false pass). Edge-type-scoped: an opaque
    security edge does not trigger a routing query's CNE. Closes doc 10
    §degradation.
  - ✅ **DONE (v1.9.29) — Violation path detail for denyIfSharedWith +
    denyIfReachableAttr.** New `sharedWithPath` (the two-edge SG-bridge
    `DB → SG ← LB`) and `reachableAttrPath` (chain to the matching target) render
    the reference chain in violation detail, matching `denyIfReachable`.
  - ✅ **DONE (v1.9.29) — More routing attributes.** Added route-table targets
    + cross-cloud reachability edges to `ROUTING_ATTRS`: `carrier_gateway_id`,
    `local_gateway_id`, `core_network_id` (AWS route targets) and
    `network_interface_ids` + `public_ip_address_id` (the Azure VM→NIC→PublicIP
    chain). Deferred `peer_vpc_id` / `customer_gateway_id` / `vpn_gateway_id` —
    they are connection/attachment identifiers, not route-table targets, and
    following them adds topology noise without improving the reachability rules
    (peering reachability is already covered via the `vpc_peering_connection_id`
    route target). Also: `buildGraph` now scans list-valued attrs
    (`res.lists`), not just scalar attributes — list refs like
    `vpc_security_group_ids = [aws_sg.x.id]` and
    `network_interface_ids = [azurerm_network_interface.nic.id]` now create real
    edges (this also makes the SG-shared rule fire on real `.tf`, not just
    hand-modeled scalars); an opaque whole-list (`= var.sgs`) degrades to
    could-not-evaluate.
  - ✅ **DONE (v1.9.29) — Azure graph conditions.** Shipped the canonical
    Azure multi-hop control: `no-vm-public-ip-reachable` (`cis-azure`, warn) —
    a VM that reaches a public IP through its NIC
    (`network_interface_ids → ip_configuration.public_ip_address_id`).
    Internet-facing VMs are legitimate for bastions, so it is a WARN
    (visibility for review). The cross-cloud capability (list-edge traversal +
    Azure reachability attrs classified) is the deliverable; the rule
    demonstrates it.
  - **GCP** — the graph model is less applicable (no per-resource SGs;
    firewall rules are VPC-level; routing is implicit). GCP's public-access
    controls are better served by existing per-resource conditions
    (`denyBlockPresence` on `access_config`, `mustBeFalse` on `ipv4_enabled`).

### Adoption — output & integration (cheap, high-leverage)

- **SARIF output (`--format sarif`).** ✅ **DONE (v1.9.22).** The terminal +
  JSON formats are joined by SARIF 2.1.0 — the OASIS-standard JSON schema
  consumed by GitHub Code Scanning (`github/codeql-action/upload-sarif@v3`),
  GitLab security report artifacts, Azure DevOps, and VS Code's SARIF viewer.
  A new `renderSarif` maps `CheckReport` → SARIF: each violation → an
  error/warning result at file:line with a `properties` bag round-tripping
  resource/effect/rationale/approvers; could-not-evaluate + ungoverned entries
  surface as `note`-level results (visible gaps, not gating); rules
  deduplicated into `tool.driver.rules[]`. CI templates ship optional
  upload-sarif steps (GitHub native; GitLab as artifact). Output contract
  preserved per the engine-dev skill.
- **VS Code extension (inline `.tf` findings).** Larger lift; surfaces violations in-editor as the author writes Terraform — the highest-friction-reduction lever for spec adoption. Reuses the engine's JSON output; the work is the extension shell (diagnostics provider, debounce, `.zen/` detection). Consider only if SARIF + adoption traction warrants the investment.

### Adoption — ecosystem (non-code)

- **Dogfood breadth.** Run v1.9.20 across more real module repos (cloudposse, terraform-aws-modules, FaztWeb, etc.) and publish the noise-floor / catch-rate. The engine has had 0 false positives since round 6 across 35+ repos — broader data strengthens the adoption story.
- **Spec registry / community specs.** ✅ **DONE (v1.9.30-pre → v1.9.36):
  seeded `examples/` with three org-profile spec templates** — `startup/` (lean
  baseline + ownership tag), `enterprise/` (multi-cloud CIS + ownership
  tags + a prod `prevent_destroy` approval gate), `regulated/` (the full
  compliance stack + GDPR-style data residency). Standalone copy-paste
  templates (not exported profile consts — duplicate rule IDs are a load
  error, so a profile const embedding presets would collide if a consumer
  also spread the underlying pack). A loader test
  (`src/spec/examples.test.ts`) loads each via the real jiti loader +
  validates every rule, so the templates track the DSL. **v1.9.36** wired the
  same profiles into `dotzen init --profile {startup,enterprise,regulated}`
  + `--presets coreSecurity,cisAws,...` (profiles as data in
  `src/cli/profiles.ts`; `gen-examples` regenerates the example trees from
  that single source). The hosted-registry angle in
  `05-future-cloud-layer.md` remains future work.
- **README / docs story.** ✅ **DONE (v1.9.35).** Launch README rewrite:
  ASCII architecture diagrams (mermaid doesn't render on npm), absolute links
  (relative links 404 on npm), Quick Start reordered (init before check —
  check needs a spec), "Who this is for" framing, and a `prepack` hook that
  copies the root README into the tarball so npm ships the current version.
  ROADMAP gained a "Status at a glance" header for the 30-second read.

### Niche (on-demand only)

- **Recursive `flatten()`** (we cover one level — the common `[var.a, var.b]` shape; Terraform's is recursive) and other built-ins (`keys()` / `values()` / `length()` / `contains()`). Add only when a real fixture demands it.
- **More clouds** (Oracle/IBM/Alibaba) — unlikely demand; the multi-cloud architecture makes this vocabulary+rules work if it ever lands.
