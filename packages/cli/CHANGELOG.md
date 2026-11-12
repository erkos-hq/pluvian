# Changelog

All notable changes to this package are documented here. Versions follow
[semver](https://semver.org/). Notably, **new spec DSL vocabulary (new rule
conditions, resource types, or attributes) is treated as a feature release**,
not a patch — even when strictly backward-compatible, consumers should know
whether re-reading their spec is warranted.

> Pre-2.0.0 entries below were published as `@dotzen/dotzen` — the same tool,
> before the rebrand (see 2.0.0).

## 2.2.0

**Failure-track hardening (public API grows).** Operational failures now
always ride the `Result` failure track — no raw exceptions escape the
engine. Follow-up to the railway-oriented-architecture review.

### Added

- New `EngineError` variant `ConfigInvalid { path, detail }` — a malformed
  or unreadable `pluvian.json` (bad JSON, permission error, race) is a
  typed error with a clean message instead of a raw `SyntaxError` with a
  stack trace. Consumers doing exhaustive `switch` on `EngineError` get a
  compile error until they handle it — by design.
- `readEngineConfig` has direct unit coverage for the first time (both
  candidate paths, precedence, malformed JSON, unreadable file).

### Fixed

- An unreadable `.tf` file mid-scan (deleted between discovery and read,
  permission error) now maps to `ParseFailed` instead of crashing the run.
- In the VS Code extension, both failure modes previously surfaced as a
  silent unhandled rejection (status bar stuck); both now render a proper
  message.

### Unchanged

- Verdicts, rule catalog, presets, and CLI behavior are untouched. Dev
  toolchain majors landed since 2.1.0 (vitest 5, Stryker 10, Node 26 CI)
  have no runtime footprint in the published package.

## 2.1.0

**Public engine API.** `check` (and its report/finding types) is now exported
from the package index, so embedders run the exact engine the CLI runs —
in-process, identical verdicts. First consumer: the pluvian VS Code extension
(in-editor diagnostics from the same `check()` the pipeline uses).

### Added

- `check(projectRoot, engineVersion, opts?)` exported from the package index,
  with `CheckReport`, `Violation`, `Unevaluable`, `EngineError`,
  `RuleValidationError`, and `Result` types.
- `readEngineConfig` + `EngineConfig` / `LoadedConfig` / `TerraformRoot`
  exported (embedders read the `pluvian.json` pin themselves).
- New `opts.enforcePin` (default `true`): `false` runs the check even when
  `pluvian.json` pins a different `version` — for surfaces that surface the
  mismatch to the user instead of refusing (the extension notifies and runs;
  the CLI/CI keep refusing).
- `./package.json` subpath export (embedders read the bundled engine version
  for the pin comparison).

### Unchanged

- CLI behavior, verdicts, rule catalog, presets, and outputs are untouched —
  this release only widens the public API surface.

## 2.0.0

**Rebrand: dotzen → pluvian.** Same engine, same verdicts, same discipline —
new name. pluvian (from _Pluvianus aegyptius_, Herodotus's crocodile bird —
the bird that cleans the beast's teeth) is the first tool under the
**erkos** umbrella. The engine, rules, presets, and outputs are unchanged;
only names changed. Migration below.

### Breaking changes (all name-bearing surfaces)

- **Package**: `@dotzen/dotzen` → **`@erkos/pluvian`**. The old package is
  deprecated; install/command invocations change:
  `npx @erkos/pluvian@2 check ./terraform/`.
- **Binary**: `dotzen` → `pluvian` (`pluvian check`, `pluvian init`).
- **Contract files**: `dotzen.json` → **`pluvian.json`**; `.zen/spec.ts` →
  **`.pluvian/spec.ts`** (update the `"spec"` path inside the config).
- **Ignore directive**: `# dotzen:ignore` → **`# pluvian:ignore`** — old
  directives stop matching, so previously-suppressed findings re-fire (the
  loud, safe direction: rename them when you upgrade).
- **CI env vars**: `DOTZEN_REQUIRES_APPROVAL` → `PLUVIAN_REQUIRES_APPROVAL`;
  `DOTZEN_ENV_FILE` → `PLUVIAN_ENV_FILE`; default dotenv artifact
  `dotzen.env` → `pluvian.env` (and SARIF upload file `pluvian.sarif`).
- **Stable ruleIds**: `dotzen.module-following` → `pluvian.module-following`;
  `dotzen.ungoverned` → `pluvian.ungoverned` (SARIF filters keyed on these
  must be updated).
- **SARIF**: `tool.driver.name` is now `@erkos/pluvian`.

### Migration checklist

1. `npx @erkos/pluvian@2 init` in a fresh clone, or manually: rename
   `dotzen.json` → `pluvian.json`, `.zen/` → `.pluvian/`, and fix the
   `"spec"` path inside the config.
2. In your spec, the import is `from '@erkos/pluvian'` (the engine resolves
   it to itself — still no local install needed to run).
3. Update CI: `npx @erkos/pluvian@2 check`, env-var renames, dotenv/SARIF
   artifact names.
4. Rename `# dotzen:ignore` directives in your `.tf` files.
5. Spec DSL API is otherwise unchanged — `rule()`, presets, conditions, and
   effects are identical to 1.9.37.

### No engine change · 144 rules across 8 presets

816 unit + 40 integration green post-rename; zero behavior differences.

## 1.9.37

Docs — **no engine change.** Fixes a Quick Start ordering bug on the npm README.

### Fixed — Quick Start order (init before check)

The Quick Start listed `check` (step 1) before `init` (step 2), but `check` is
spec-driven and errors with no `.zen/spec.ts`. Reordered to the logical flow:
**init** (creates the spec + version-pinned `dotzen.json`) → **edit** →
**check** → **CI**. Folded the version-pinning note into step 1 (init already
pins) and dropped the redundant standalone "pin the version" step.

### No spec DSL API changes · no rule changes · 144 rules across 8 presets

Consumers need not change anything. 816 unit + 40 integration, 0 regressions.

## 1.9.36

Feature — **`dotzen init --profile` / `--presets`**. The scaffold now generates a
ready-to-go spec from the curated profiles and/or à-la-carte presets, instead of
a hand-written sample to edit.

### Added — `init` flags

- `--profile startup|enterprise|regulated` — a curated bundle (presets + bespoke
  rules: ownership tags, prod `prevent_destroy` approval gate, data residency).
- `--presets coreSecurity,cisAws,...` — à la carte, any of the 8 packs
  (`coreSecurity`, `cisAws`, `cisAzure`, `cisGcp`, `pciDss`, `soc2`,
  `nist80053`, `dataProtection`).
- They **compose**: `--profile enterprise --presets pciDss` = the enterprise
  bundle + PCI. The union is **deduped** (duplicate rule IDs are a load error,
  so a preset is never double-spread). Invalid names error cleanly.

```bash
npx @dotzen/dotzen@1 init                       # default: [...coreSecurity]
npx @dotzen/dotzen@1 init --profile enterprise  # curated bundle
npx @dotzen/dotzen@1 init --presets coreSecurity,cisAws,pciDss
```

### Changed — default `init` output; examples are generated

- `dotzen init` with no flags now writes `[...coreSecurity]` (the real
  secure-by-default baseline) instead of the old hand-written 12-rule sample.
  The sample's educational rule catalog is retired in favor of the actual
  baseline spread — find rule patterns in `docs/` + `examples/`.
- `examples/{startup,enterprise,regulated}/.zen/spec.ts` are now **generated**
  from a single profiles-data module (`src/cli/profiles.ts`) via
  `npm run gen-examples` — the `init` output and the example templates can no
  longer drift apart.

### No spec DSL API changes · 144 rules across 8 presets

No new condition kinds or builder methods. Consumers need not change existing
specs. 816 unit + 40 integration, 0 regressions.

## 1.9.35

Docs — **no engine change.** Fixes the README links on npmjs.com.

### Fixed — README links on npm

Relative links (`./examples/`, `./docs/...`) resolve on GitHub but 404 on
npmjs.com (no repo context). Converted all 12 to absolute
`github.com/ealmachado-eng/dotzen` URLs (files → `blob/main`, dirs →
`tree/main`) so they work on both surfaces. With 1.9.34 (ASCII diagrams) this
completes the npm README audit (mermaid / relative links / raw HTML all clear).

### No spec DSL API changes · no rule changes · 144 rules across 8 presets

Consumers need not change anything. 801 unit + 40 integration, 0 regressions.

## 1.9.34

Docs — **no engine change.** Fixes the README diagrams on npmjs.com.

### Fixed — README diagrams on npm

npmjs.com renders README as plain markdown and doesn't execute mermaid (GitHub
does), so the three mermaid diagrams showed as raw code fences on npm. Replaced
all three with ASCII art that renders identically on npm, GitHub, plain text,
and offline — consistent with dotzen's zero-dependency ethos. (1.9.33 shipped
the rewritten README with mermaid; this corrects it for the npm surface.)

### No spec DSL API changes · no rule changes · 144 rules across 8 presets

Consumers need not change anything. 801 unit + 40 integration, 0 regressions.

## 1.9.33

Docs/packaging — **no engine change.** Refreshes npm's README (which had
diverged from the repo) and brings the project docs in line with current reality
ahead of launch.

### Fixed — npm README sync

npm was publishing a stale, divergent `packages/cli/README.md` (npm reads the
package-local README, not the repo root). Added a `prepack` script that syncs
the root README into the package on every `npm pack`/`publish`, so npmjs.com now
shows the current README. (A symlink wouldn't work — npm pack excludes symlink
targets outside the package dir.)

### Changed — launch README rewrite

Rewrote the README: accurate state (was "v0 / ~200 tests / not yet published" —
actually v1.9.x, 801 tests, published with provenance); the AI-generated-
Terraform problem + the static-analysis insight; a 30-second demo; positioning
vs OPA/Sentinel/Checkov/tfsec; Mermaid diagrams (the parse→evaluate pipeline and
the graph reachability chain); a "where dotzen fits" defense-in-depth layering.
Lead with **fail-fast in the AI agent's own loop**. Install commands use a
major-pin (`@1`) — `dotzen.json` remains the exact enforcement pin.

### Changed — doc refresh

- `docs/specs/02-spec-dsl.md` documents the v1.9.26–29 graph conditions
  (`denyIfReachable` / `denyIfSharedWith` / `denyIfReachableAttr`), which were
  missing.
- `docs/specs/10-graph-layer.md` `Proposed` → `Implemented`; reflects the
  shipped edge types, conditional edges, list traversal, path detail, and Azure
  rule.
- `docs/specs/07-development-workflow.md` CI example: Node 20 → 24, actions
  v4 → v5; dropped the stale Windows/macOS matrix (`ci.yml` is Linux-only; the
  engine is cross-platform via pure-JS + the WASM parser).
- `CLAUDE.md` orientation: gate is `.github/workflows/ci.yml` (not
  `.gitlab-ci.yml`); reframed the "v0 vertical slice" to shipped v1.9.x.
- `docs/specs/01-product-overview.md` target users reframed as two entry ramps
  (bottom-up dev via the agent loop; top-down architect + platform).

### No spec DSL API changes · no rule changes · 144 rules across 8 presets

Consumers need not change anything. 801 unit + 40 integration, 0 regressions.

## 1.9.32

Feature — **round-13 vocabulary expansion** (dogfood round 12 follow-up).
Collapses the `ungoverned` noise surfaced by the broader 9-repo round, all
names observed-in-the-wild on real module `.tf` (inherently verified — no
provider-source clone needed).

### Added — recognized vocabulary (auto-collapses ungoverned)

- **AWS resources:** `aws_eks_access_entry`, `aws_eks_access_policy_association`,
  `aws_autoscaling_traffic_source_attachment`, `aws_db_option_group`.
- **AWS read-only data sources → `DataResource`:** `aws_eks_addon_version`,
  `aws_eks_cluster_versions`, `aws_ec2_instance_type`, `aws_iam_session_context`.
- **`UTILITY_TYPES`:** `tls_certificate` data source (TLS provider, not cloud IaC).
- **GCP resources:** `google_compute_subnetwork_iam_member`,
  `google_project_default_service_accounts`, `google_resource_manager_lien`,
  `google_tags_tag_binding`, `google_project_service_identity`,
  `google_service_usage_consumer_quota_override`, `google_project_usage_export_bucket`.

**Heads-up for consumers:** repos using these types will see fewer `ungoverned`
entries. On the round-12 modules this drove eks / autoscaling / cloudposse-rds
ungoverned → 0 and terraform-google-project-factory 12 → 7 (the remainder are
deeper-niche types — diminishing returns). No new violations or could-not-evaluate
findings.

### No spec DSL API changes

No new condition kinds or builder methods. 144 rules across 8 presets unchanged;
consumers need not change anything.

### Tests

801 unit + 40 integration, 0 regressions. Dogfood rounds 11 + 12: 18 distinct
real-world module repos across 3 clouds, 0 false positives on v1.9.30–31.

## 1.9.31

Feature — **dogfood-round-11 follow-ups**: a precision fix that converts
honest gaps to definite verdicts on a flagship module, plus the round-12
vocabulary that collapses the last `ungoverned` noise surfaced by the round.

### Changed — bare resource-attr `member` ref now a definite PASS

`denyValue` now returns a definite **PASS** (was could-not-evaluate) for a GCP
IAM `member` set to a bare `google_service_account.<name>[<idx>].member` /
`.email` / `.name` reference. The provider type-system guarantees these resolve
to a service-account identifier, which can never equal a bare public-principal
scalar (`allUsers` / `allAuthenticatedUsers`). New
`denyValueExcludedByResourceAttr` is the bare-ref analog of the v1.7
literal-prefix rule (`denyValueExcludedByLiteral`).

**Heads-up for consumers:** configs using the `member = google_service_account.x[0].member`
pattern (common in GKE / service-account modules) will see fewer
`couldNotEvaluate` findings where they previously degraded honestly — these now
resolve to PASS. No new violations. On the `terraform-google-kubernetes-engine`
module this dropped CNE from 15 → 3. Conservative guard: stays CNE if a denylist
scalar could itself be a service-account identifier (`serviceAccount:` prefix or
an `@`-email), and is scoped to `google_service_account.*` only.

### Added — round-12 recognized vocabulary (dogfood round 11)

Names taken straight from real module `.tf` (observed-in-the-wild, so
inherently verified — no provider-source clone needed). Added to the resource
enums (`KNOWN_TYPES` derives from them → auto-collapses `ungoverned`):

- `aws_vpc_security_group_rules_exclusive`, `aws_vpc_security_group_vpc_association`
- `azurerm_monitor_data_collection_rule(+_association)`
- `google_service_networking_connection`

Plus `kubernetes_config_map_v1_data` (+ non-v1 sibling) → `UTILITY_TYPES`
(kubernetes provider, not cloud IaC — silently skipped, not surfaced).

**Heads-up for consumers:** repos using these types will see fewer `ungoverned`
entries (coverage-telemetry improvement — no new violations).

### No spec DSL API changes

No new condition kinds, no new builder methods. 144 rules across 8 presets
unchanged; consumers need not change anything.

### Tests

800 unit + 40 integration, 0 regressions. Dogfood round 11 (9 repos, 3 clouds)
confirmed 0 false positives on v1.9.30; these follow-ups dropped GKE CNE 15→3
and cleared the round's remaining ungoverned noise.

## 1.9.30

Feature — **org-profile example specs + round-11 vocabulary expansion**.
Adoption-focused: a copy-paste starting point for every org maturity level,
plus the last round of recognized-but-not-governed AWS vocabulary.

### Added — org-profile example specs

Three standalone `.zen/spec.ts` templates under a new top-level `examples/`
directory, so consumers copy the closest fit instead of authoring from scratch:

- **`examples/startup/`** — `coreSecurity` + one ownership tag (warn). Lean
  secure-by-default baseline.
- **`examples/enterprise/`** — multi-cloud CIS (`cisAws` + `cisAzure` +
  `cisGcp`) + ownership tags (block) + a production `prevent_destroy`
  approval gate (`RequireApproval` → security + SRE sign-off on stateful
  prod resources that lack it).
- **`examples/regulated/`** — the full compliance stack (`pciDss` + `soc2` +
  `nist80053` + `dataProtection`) + GDPR-style data residency
  (`denyNonApprovedRegion`).

Each is a **standalone spec** (copy one, don't stack two — duplicate rule IDs
are a load error, so an exported profile const embedding presets would collide
if a consumer also spread the underlying pack). An `examples/README.md`
documents the profiles, the composition pattern, and the customization points
(org tag keys, approved regions, approvers). A loader test
(`src/spec/examples.test.ts`) loads each via the **real jiti spec loader** +
validates every rule, so the templates track the DSL.

### Added — round-11 AWS vocabulary (recognized, not yet rule-bearing)

Ten AWS resource types verified against the provider Go `ResourcesMap`
(`hashicorp/terraform-provider-aws` per-service `service_package_gen.go`
`TypeName` registrations + `@SDKResource`/`@FrameworkResource` annotations —
the v1.x Azure-audit method; web fetch was unusable since the provider docs
went registry-JS-only). Added to `AwsResource`; since `KNOWN_TYPES` is derived
from the enum, they auto-collapse `ungoverned` noise on repos that use them:

- `aws_elasticache_global_replication_group`, `aws_elasticache_serverless_cache`
- `aws_opensearch_package_association`, `aws_opensearch_vpc_endpoint`
- OpenSearch Serverless: `aws_opensearchserverless_collection` /
  `_security_policy` / `_security_config` / `_access_policy` /
  `_lifecycle_policy` / `_vpc_endpoint`

**Heads-up for consumers:** repos using these types will see fewer
`ungoverned` entries (a coverage-telemetry improvement — no new violations or
could-not-evaluate findings).

### No spec DSL API changes

No new condition kinds, no new builder methods. The new resource types are
available as enum values a spec author could target, but no shipped rule uses
them yet. Consumers need not change anything. 144 rules across 8 presets
unchanged.

### Tests

794 unit + 40 integration, 0 regressions.

## 1.9.29

Feature — **graph-layer hardening + the first Azure graph rule**. Closes the
three open graph-layer gaps from ROADMAP (the NAT false positive, the
unresolved-chain false negative, and missing path detail) and ships the
canonical cross-cloud topology control (Azure VM → NIC → public IP).

### Fixed — NAT `subnet_id` false positive (resource-type-aware edges)

`subnet_id` on an `aws_nat_gateway` was classified as `routing` (it IS a
routing attr name), but semantically it's a **deployment ref** — the NAT is
deployed in a public subnet (it needs a public IP), but transit traffic does
not follow the NAT's deployment subnet; it routes TO the NAT via route tables.
This created a false chain: `private_DB → … → NAT → public_subnet → … → IGW`.

`classifyEdge(attr, resourceType)` now consults a `STRUCTURAL_REF_BY_TYPE`
override map (`aws_nat_gateway.subnet_id` → structural). A private DB egressing
via a NAT deployed in a public subnet no longer false-violates.
`aws_db_instance.subnet_id` stays `routing` (the governed case). The override
map is extensible for future per-type refinements.

### Changed — could-not-evaluate for unresolved graph chains

Previously, an unresolved graph edge (`subnet_id = var.x`, no default) produced
**no edge** → `denyIfReachable` returned a definite **pass** (a false negative).
`ReachResult` now carries a `conditional` flag. The graph records opaque
var/local refs on typed attrs (routing/security/encryption); if a definite BFS
misses the target but traversed a node carrying an opaque edge of a type the
query follows, the result is **could-not-evaluate** (never a false pass).

**Heads-up for consumers:** configs with partially-unresolvable routing/security
chains will now surface `couldNotEvaluate` findings where they previously
passed silently. This is the honest outcome (doc 10 §degradation) — the
discipline of "never a guess, never a false verdict" extended to the graph
layer. Fully-resolved chains are unaffected; the conditional flag is
edge-type-scoped (an opaque security edge does not trigger a routing query).

### Added — violation path detail for all graph conditions

`denyIfSharedWith` and `denyIfReachableAttr` violations now include the
reference chain (previously only `denyIfReachable` did). New
`sharedWithPath` (the two-edge SG-bridge `DB → SG ← LB`) and
`reachableAttrPath` render the chain in the finding detail.

### Added — list-valued reference edges

`buildGraph` now scans `res.lists`, not just scalar attributes. Real Terraform
routes multi-value refs through lists (`vpc_security_group_ids = [...]`,
`network_interface_ids = [...]`); these previously created **no graph edge**.
List items now create real edges, and an opaque whole-list (`= var.sgs`)
degrades to could-not-evaluate. This also makes the existing SG-shared rule
(`no-sg-shared-lb-db`) fire on real `.tf` configs — it previously only worked
on hand-modeled scalar refs.

**Heads-up for consumers:** AWS configs that share a security group between a
DB and a load balancer via list-valued refs will now surface the SG-bridging
finding (previously silently missed). This is the rule working as intended.

### Added — more routing attributes

Route-table targets + cross-cloud reachability edges added to `ROUTING_ATTRS`:
`carrier_gateway_id`, `local_gateway_id`, `core_network_id` (AWS route targets),
and `network_interface_ids` + `public_ip_address_id` (the Azure VM→NIC→PublicIP
chain). Deferred `peer_vpc_id` / `customer_gateway_id` / `vpn_gateway_id` —
they are connection/attachment identifiers, not route-table targets (peering
reachability is already covered via the `vpc_peering_connection_id` route
target).

### Added — Azure graph rule

`no-vm-public-ip-reachable` (`cisAzure`, **warn**): a virtual machine that
reaches a public IP through its NIC
(`network_interface_ids → ip_configuration.public_ip_address_id → public_ip`).
Internet-facing VMs are legitimate for bastions/jumpboxes, so this is a WARN
(visibility for review), not a block. This is the Azure analog of "no DB in a
public subnet" and the first cross-cloud demonstration of the graph layer.
**144 rules** across 8 presets.

### No spec DSL API changes

No new condition kinds, no new builder methods, no new exposed enums. The
`conditional` flag is engine-internal; the new graph methods are internal.
Spec authors need not change anything. `cisAzure` consumers gain one warn rule
automatically.

### Tests

789 unit + 40 integration, 0 regressions.

## 1.9.28

Feature — graph-layer UX + multi-cloud improvements.

### Added — violation path detail

`denyIfReachable` violations now include the **exact reference chain** that
makes a resource public, so the finding is immediately actionable:

```
✗ aws_db_instance.public_db  (terraform/main.tf:3)
    DB instances must not be reachable to an Internet Gateway
    ↳ reachable to aws_internet_gateway via:
      aws_db_instance.public_db (subnet_id) → aws_subnet.public
      ←(subnet_id) aws_route_table_association.rta (route_table_id) →
      aws_route_table.public_rt ←(route_table_id) aws_route.public_igw
      (gateway_id) → aws_internet_gateway.igw
```

New `pathTo()` BFS (shortest-path with parent tracking) + `formatPath()`
formatter. Added `detail` field to the `Violation` interface, wired through
`evaluate()` so all conditions' detail reaches the terminal/JSON/SARIF output.

### Added — Azure NSG edge type

`network_security_group_id` added to `SECURITY_ATTRS`. Enables
`denyIfSharedWith` for Azure network security groups (VM → NSG → other VM
type — lateral-movement prevention across Azure trust boundaries).

### No preset or API changes

The 143 rules are unchanged. The path detail is internal (the evaluator
computes it; the user sees it in the output). No condition signatures changed.

### Tests

769 unit + 40 integration, 0 regressions.

## 1.9.27

Fix — **graph edge types**. The v1.9.26 graph layer treated ALL resource
references as edges (untyped), causing false positives on real VPC topologies:
every resource connected through the VPC node via `vpc_id`, making
`denyIfReachable(InternetGateway)` fire on private resources.

### Fixed — edge-type classification + filtering

Each edge is now classified by its referencing attribute's semantic type:

| Type         | Attributes                                                                             | Followed by                     |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------------- |
| `routing`    | `subnet_id`, `route_table_id`, `gateway_id`, `nat_gateway_id`, `transit_gateway_id`, … | `denyIfReachable`               |
| `security`   | `security_groups`, `vpc_security_group_ids`                                            | `denyIfSharedWith`              |
| `encryption` | `kms_master_key_id`, `kms_key_id`                                                      | `denyIfReachableAttr`           |
| `structural` | `vpc_id`, tags, everything else                                                        | **excluded** from typed queries |

The integration fixture now includes realistic `vpc_id` refs. Before the fix:
both DBs false-violated (connected via the VPC node). After: only the
public-subnet DB violates; `vpc_id` edges are `structural` → filtered.

### Known remaining edge case

`subnet_id` on a NAT gateway is classified as `routing` (it IS a routing
attr), but semantically it's a deployment ref. This can create a false chain
through the NAT to the public subnet. Resource-type-aware classification (a
future refinement) will distinguish these. The `vpc_id` fix covers the most
common false-positive vector by far.

### No preset or API changes

The 143 rules are unchanged. The edge-type filtering is internal (evaluators
pass the correct edge types to the graph queries). No condition signatures
changed.

### Tests

769 unit + 40 integration (the graph fixture now exercises realistic `vpc_id`
topology), 0 regressions.

## 1.9.26

Feature — **v2 graph layer**: multi-hop dependency-graph rules. The first
topology-aware governance controls for Terraform — no other static tool
offers these as authorable rules. Three new conditions traverse chains of
resource references to catch controls that per-resource evaluation cannot
express.

### Added — graph-layer conditions

| Condition                                           | Use case                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `.denyIfReachable(targetType)`                      | "No DB in a public subnet" — traverses `db → subnet → route_table → route → IGW` (5-hop bidirectional BFS). |
| `.denyIfSharedWith(sharedType, otherType)`          | "No shared SG between a public LB and a private DB" — lateral-movement prevention.                          |
| `.denyIfReachableAttr(targetType, attr, ...values)` | "KMS key must be customer-managed" — traverse to a resource + check its attribute.                          |

```ts
rule()
  .resource(AwsResource.DbInstance)
  .denyIfReachable(AwsResource.InternetGateway)
  .message('DB instances must not be in a public subnet')
```

### Added — graph infrastructure

- `buildGraph()` constructs a bidirectional adjacency index over all `resolvedRef` edges (forward + reverse), module-scoped via `assocKey` (same isolation as the v1.9.21 association fix).
- `ResourceGraph.canReach / sharedWith / reachableAttr` — BFS queries with type-matching.
- Wired into `EvalContext` (built alongside the existing association index; additive — no existing condition changes behavior).

### Added — preset rules (3 new, 143 total)

- `cis-aws`: `no-db-in-public-subnet` (block) + `no-sg-shared-lb-db` (warn).
- `data-protection`: `no-aws-managed-kms` (warn).
- New vocabulary: `AwsAttribute.KeyManager`.

### Added — integration + docs

- `.tf` integration fixture (`graph-public-subnet/`) proving the full HCL → normalize → graph → evaluate pipeline.
- DSL reference (`dsl.md`): new "Graph (topology-aware)" section.
- Design spec: `docs/specs/10-graph-layer.md` (369-line architecture doc).

### Known limitation

The current graph treats ALL references as edges (untyped). Structural refs
like `vpc_id` and NAT-gateway `subnet_id` can over-connect resources,
producing false positives on complex VPC topologies. Edge types (Phase 6,
doc 10) will distinguish routing edges from structural ones. The preset
rules are conservative (block on the clearest case, warn on the SG-bridging
case); users can suppress false positives with inline ignore directives.

### Tests

13 new graph tests (8 graph construction + 5 evaluator) + 1 .tf integration
test (40 integration total). Gate: 769 unit + 40 integration, 0 regressions.

## 1.9.25

> **Note on 1.9.24:** version `1.9.24` was skipped on npm. The first attempt
> to publish it via GitHub Actions OIDC hit a workflow bug (Node 20 → npm 10.x,
> too old for trusted publishing — fixed). A manual test-publish of 1.9.24 was
> then unpublished to retry via the workflow, but npm permanently blocks
> republishing a version number once it has been published. `1.9.25` is the
> actual first release published from GitHub via trusted publishing with
> provenance. Same content as the intended 1.9.24.

Meta — the project moved from **GitLab to GitHub** (`github.com/ealmachado-eng/dotzen`, public). No engine, DSL, or rule change for consumers; the package behaves identically. The move unblocks two operational wins and re-homes the CI:

### Changed — repository home + CI

- **Canonical repo** is now `github.com/ealmachado-eng/dotzen` (was `gitlab.com/governance-tools/dotzen`). `package.json` (`repository`/`homepage`/`bugs`), the README Docs links, the CLI's SARIF `informationUri`, and the onboarding/skill docs all point at GitHub. The GitLab repo is archived (read-only) after this release publishes from GitHub.
- **CI** moved from `.gitlab-ci.yml` (GitLab CI) to `.github/workflows/` (GitHub Actions): `ci.yml` (the test/security gate — typecheck, lint, format, test, integration, coverage, check-docs, npm-audit, semgrep, gitleaks) and `release.yml` (publish on `v*` tags). The `.gitlab-ci.yml` file is kept in-tree as a historical reference; the consumer-facing CI templates (`src/templates/ci-templates.ts`) still ship both GitHub Actions + GitLab CI for consumers.
- **npm trusted publishing** reconfigured for GitHub: the publish workflow uses GitHub OIDC (`permissions: id-token: write`) instead of the GitLab OIDC `id_tokens` block. No stored `NPM_TOKEN` either way.

### Added — npm provenance (was blocked on GitLab)

`release.yml` runs `npm publish --provenance`. The repo is now **public**, so sigstore provenance attestations land on the npm page from **v1.9.24 onward**. (On the private GitLab repo, `--provenance` failed with `E422 … private source repository` and was skipped — OIDC publish itself worked, but without the attestation.) Past releases (v1.9.1–v1.9.23) keep their pre-provenance state on npm; provenance is not retroactive.

### Renovate

`renovate.json` swapped the `gitlabci` manager → `github-actions` (now pins/bumps Action SHAs instead of CI image digests). Install the Renovate GitHub App to resume automated dependency + Action bumps.

### No consumer action required

`npx @dotzen/dotzen check` is unchanged. Specs, presets, output formats, and exit codes are identical. The only consumer-visible difference is the npm page now shows provenance attestations on new releases.

## 1.9.23

Fix — correct two SARIF schema-validity bugs in v1.9.22's `--format sarif`
that would have **broken GitHub/GitLab ingestion** on module-followed repos
and project-level rules. Caught by running the published output through the
official `@microsoft/sarif-multitool` validator (an adoption/dogfood round).

### Fixed — module-trace suffix in `artifactLocation.uri` (SARIF1002)

dotzen embeds the `followModules` trace annotation in its `file` field as
`modules/rds/main.tf (db_bad)`. v1.9.22 emitted that string verbatim as the
SARIF `artifactLocation.uri` — but the `(label)` suffix (spaces, parens) is
not a valid RFC 3986 URI reference, and code-scanning dashboards deep-link by
`uri`, so the annotation would 404. Now the `uri` is the clean filesystem
path (`modules/rds/main.tf`) and the full trace round-trips through
`properties.moduleTrace`.

### Fixed — project-level findings emitted `startLine: 0` (SARIF1007)

`requireResource` findings (e.g. the IAM Access Analyzer presence check) carry
the synthetic location `<project>:0`. SARIF requires `region.startLine >= 1`,
so v1.9.22's `startLine: 0` failed validation. These findings now emit zero
`locations` (SARIF §3.27.5 permits it) and carry their context in the message

- `properties` — they appear in the dashboard without a bogus file:line.

### Validation

The fixed output passes `sarif-multitool validate` clean on every shape
exercised: root resources, followed-module resources (trace-suffixed paths),
and project-level findings. 2 new renderer tests pin the trace-stripping and
project-level cases. Gate: 750 unit + 39 integration, 0 regressions.

## 1.9.22

Feature — `--format sarif`. The terminal and JSON formats are joined by
**SARIF 2.1.0** (OASIS-standard JSON for static-analysis findings), making
dotzen a first-class CI security stage: findings land in the GitHub Security
tab / GitLab security artifacts / Azure DevOps / VS Code SARIF viewer with
file:line deep-links, alongside semgrep/gitleaks, instead of a CI log.

```bash
npx @dotzen/dotzen check --format sarif > dotzen.sarif
# GitHub: upload via github/codeql-action/upload-sarif@v3
# GitLab: store dotzen.sarif as a job artifact
```

### Added — `renderSarif`

A new pure renderer maps `CheckReport` → SARIF 2.1.0:

- Each violation → a `results[]` entry with `ruleId`, `level` (Block→`error`,
  Warn/RequireApproval→`warning`), `message`, file:line `locations`, and a
  `properties` bag round-tripping dotzen-specific data (resource, effect,
  rationale, approvers) for filtering/grouping beyond the SARIF baseline.
- Each could-not-evaluate + ungoverned entry → a `note`-level result so the
  engine's "gaps must be visible" discipline carries through (they surface in
  the dashboard but do NOT gate like violations).
- The deduplicated rule set → `tool.driver.rules[]` (id, message, default
  level) so dashboards can group/suppress by rule.

The per-violation output contract is preserved (rule/message/resource/
file:line/severity/rationale). Operational errors (`DotzenError`) stay on the
existing `renderError` + exit-2 path (SARIF is for the success track).

### Changed — `--format` generalized

The binary `--format json` flag is now a `terminal | json | sarif` enum
(`--format sarif` / `--format=sarif`). SARIF + JSON are machine output — no
color, no approval-signal dotenv file (those are for human terminal runs; a
CI sarif upload reads stdout). The exit-code semantics are unchanged
(0 clean / 1 violations / 2 operational error).

### CI templates

`src/templates/ci-templates.ts` ships optional SARIF-upload steps: GitHub
Actions uses `github/codeql-action/upload-sarif@v3` (native); GitLab stores
`dotzen.sarif` as an artifact (the native GitLab security dashboard uses a
different JSON shape — a sarif→gitlab converter is needed for dashboard
ingestion; SARIF remains the cross-tool interchange format).

### Tests

10 new `report.sarif.test.ts` cases (SARIF envelope, tool driver, rule
dedup, effect→level, location+properties, CNE/ungoverned as notes,
require_approval→warning, clean-report) + 1 end-to-end integration test
(real fixture → valid SARIF with file:line). Gate: 748 unit + 39 integration,
0 regressions.

## 1.9.21

Fix — close two **pre-existing false-positive** classes surfaced by a fresh
dogfood round (10 real module repos across AWS/Azure/GCP + cloudposse). The
v1.9.19/v1.9.20 surface (function-eval, list-aware denyValue) was clean —
these were older engine limitations exposed by the complex
`terraform-aws-modules/terraform-aws-eks` repo.

### Fixed — `denyBlockPresence` / `mustHaveBlock` on conditional dynamic blocks

A `dynamic "<name>" { for_each = … }` whose `for_each` could not be statically
resolved (e.g. `for_each = var.remote_access != null ? [var.remote_access] : []`
with a defaultless var) was treated as DEFINITELY present, so `denyBlockPresence`
false-fired (and `mustHaveBlock` would have falsely passed). The block's
presence is genuinely unknown — it may or may not be created at apply time.

New model: `NormalizedResource.conditionalBlocks` records these paths;
`expandDynamicInto` now splits three ways — non-empty `for_each` → `blocks`
(definite), empty `[]` → not recorded (definite absence, was also a false-fire
source), unresolvable → `conditionalBlocks`. `evalDenyBlockPresence` and
`evalMustHaveBlock` degrade to **could-not-evaluate** for conditional blocks.

### Fixed — `denyIfAssociated` / `mustHaveAssociated` cross-module aliasing

The cross-resource association index was keyed by base address (`type.name`).
Resources in different module instances share base addresses — a root
`aws_iam_role.this` and a submodule's `aws_iam_role.this` collide. A
submodule's `aws_iam_role_policy { role = aws_iam_role.this.id }` was
associating onto the root role, false-firing `iam-role-no-inline-policy` on a
role that has only managed-policy attachments.

The index is now scoped by **file-trace** (the module instance): a child's
direct `type.name` ref always points at a parent in its OWN module (cross-
module refs go through `module.x.y` outputs, not bare refs), so the scope key
`${file}\0${addr}` isolates module instances without weakening real catches.

### Dogfood round (validation)

10 fresh repos (terraform-aws-modules/security-group, /rds, /eks, /alb,
/ec2-instance, /s3-bucket; Azure/azurerm-storage, /azurerm-compute;
terraform-google-modules/bigquery, /network). Published v1.9.20 totals:
V=31, CNE=44, UNG=22 — 29 real findings, 2 false positives (both fixed here).
On `terraform-aws-eks`: V=8→6, CNE=23→24 (the two FPs removed, one became a
correct CNE). The other 9 repos: unchanged (no regressions). v1.9.19/v1.9.20
surface produced 0 false positives.

### Tests

4 new block-presence-on-conditional cases + 2 cross-module association-
isolation cases + 1 normalize case for empty-for_each no-record. Gate:
738 unit + 38 integration, 0 regressions.

## 1.9.20

Fix — close the **BigQuery multi-`access{}` block** gap (the last documented
"open" flattener bug). A `google_bigquery_dataset` declaring multiple inline
`access {}` blocks previously had only the FIRST block's fields flattened; a
public grant in a later block was silently invisible to
`bigquery-no-public-access`.

```hcl
resource "google_bigquery_dataset" "ds" {
  access { role = "OWNER"; user_by_email = "owner@example.com" }
  access { special_group = "allAuthenticatedUsers" }  # was MISSED
}
```

### Changed — verdicts (consumers: re-run `dotzen check`)

A multi-block dataset with a public grant in a non-first `access {}` block now
fires `bigquery-no-public-access` (was silently missed). This surfaces real
violations previously hidden by the flattener limitation — expect potentially
new findings on configs using repeated `access {}` blocks.

### Changed — `collect` aggregates repeated nested blocks

`collectNestedBlocks` collects EVERY element of a repeated nested block
(was: `v[0]` only). A key unique to one block stays a scalar attribute
(backward-compatible with single-block rules); a key that recurs across
blocks is aggregated into `NormalizedResource.lists` (order preserved) so no
block's value is lost. General — benefits any future repeated-block
attribute, not just BigQuery `access`.

### Changed — `denyValue` is list-aware

`evalDenyValue` now also inspects `r.lists[attr]`: fires if ANY list item
matches the denylist; degrades to could-not-evaluate if any item is
unresolved (cannot rule out a match); passes only when every item is literal
and none matches. The scalar path (single-block / scalar attribute) is
unchanged — list-awareness activates only when the attr is a list.

### Tests

4 new `normalize.bigquery.test.ts` cases (multi-block capture,
single-block no-regression, recurring-key aggregation, three-block) + 3 new
`evaluate.gcp.test.ts` cases (public-in-later-block, recurring-key list,
unresolved-item CNE). Gate: 731 unit + 38 integration, 0 regressions.

## 1.9.19

Capability — close the **compound caller inputs** gap (the last
"capability, not coverage" item on the roadmap). Statically evaluate the
four list-yielding Terraform built-ins AI-generated Terraform reaches for
most: `toset()` / `tolist()`, `concat()`, and `flatten()`. Previously any
function call in a value position degraded to could-not-evaluate; now a
resolvable list argument yields a definite verdict.

```hcl
# These previously degraded to could-not-evaluate; now they resolve.
for_each    = toset(["dev", "prd"])          # → two real instances (was: 1)
cidr_blocks = concat(var.public, var.private) # → spread into ingress
list_attr   = flatten([var.a, var.b])         # → r.lists for listContains
```

### Changed — verdicts (consumers: re-run `dotzen check`)

This converts some **could-not-evaluate** findings into definite
**violations** or **passes** on existing configs. A rule that previously
stayed silent (could-not-evaluate) on a `for_each = toset([...])` resource
now evaluates that resource per-instance — so a violating config that was
hidden behind the limitation now surfaces real violations. This is the
correct behavior (the old silence was a false sense of compliance), but
expect potentially new findings on configs that used these function calls.

### Added — `tryEvalFunctionCall` + `resolveListExpr`

A new function-call evaluator sits in the `resolveValue` chain and returns
a list-literal `NormalizedValue` for any resolvable list argument
(literal array, sole ref to a list default, or nested function call).
`resolveListExpr` is the single entry point, wired into:

- `expandForEach` / `forEachIsEmpty` — `for_each = toset([...])` expands
  per element; `toset([])` correctly skips (was followed once).
- `collect` — a list-yielding function result routes to
  `NormalizedResource.lists` (never `attributes`, so scalar-attribute
  evaluators never see an array where they expect a scalar).
- ingress cidr extractors — a `concat()` result spreads into one
  `NormalizedValue` per cidr (not a single array-valued literal).

### Added — generalized `resolveMergeMap`

The tag-only `merge()` handling (`tagKeys`) is extracted into a reusable,
value-producing `resolveMergeMap` (returns the merged map + a `complete`
flag). `tagKeys` delegates and projects to keys — no regression to the
partial-key semantic (`merge({ Ou = var.ou }, var.tags)` still proves `Ou`
is present even when its value is unknowable). Produces literal values when
a merged object is fully literal; forward-looking for any future map-valued
condition.

### Changed — `NormalizedValue.literal.value` widened

The literal value type now accepts `readonly Scalar[]` (was scalar-only).
Array literals route exclusively to `NormalizedResource.lists`, so no
scalar-attribute evaluator observes an array; two `String(v.value)` paths
in the engine (`evalMustEqual`, `evalMustBeOneOf`) carry defensive
`!Array.isArray` guards as belt-and-suspenders.

### Fixed — `tryEvalConcat` array-coercion

`tryEvalConcat` (the `prefix${sole_ref}suffix` evaluator) runs before
`tryEvalFunctionCall` in the resolver chain and would match a
single-interpolation function call like `${concat(...)}`, recursively
resolve it to an array, then silently `String(array)`-coerce it to
`"a,b"` — a false value. It now rejects non-scalar inner results and
falls through to `tryEvalFunctionCall`.

### Discipline

Any non-list / unresolvable / unknown-function argument degrades honestly
to unresolved (could-not-evaluate) — never a guess, never a false verdict.
Deeper `flatten()` recursion (Terraform's is recursive; we cover one
level — the common `[var.a, var.b]` shape) and other built-ins
(`keys`/`values`/`length`/`contains`) remain deferred (low ROI).

### Tests

44 new unit tests in `normalize.functions.test.ts` (resolver, routing,
ingress spread, merge generalization). The obsolete `parse.test.ts`
"toset followed once" assertion is rewritten to assert the new (correct)
two-instance expansion. Gate: 723 unit + 38 integration, 0 regressions.

## 1.9.18

Capability — resolve IAM policies re-exported through **nested module
outputs** (passthrough). v1.9.17 resolved a parent consuming a _direct_
child's policy output; this closes the remaining gap where an intermediate
module re-exports a deeper module's policy:

```hcl
# root
resource "aws_iam_policy" "p" { policy = module.outer.policy_json }
# modules/outer — re-exports the inner module's output
output "policy_json" { value = module.inner.policy_json }
# modules/inner — owns the data doc
data "aws_iam_policy_document" "p" { … }
output "policy_json" { value = data.aws_iam_policy_document.p.json }
```

Previously the root's `module.outer.policy_json` degraded to
could-not-evaluate. Now it resolves transitively to the grandchild's parsed
statements (and a child resource's `policy = module.inner.x` resolves too).

### Changed — `followModules` recurses before the child normalizes

The child module's resources are now normalized AFTER its own nested modules
are followed, so the grandchild `moduleOutputPolicies` index is available
when the child normalizes (a child resource can consume a nested module's
output) AND when the child's output index is built (a passthrough re-export
resolves transitively). Works at arbitrary nesting depth. Resource-array
order and trace labels are unchanged; evaluate builds its indexes from all
resources, so verdicts are unaffected. 32 `parse.test.ts` cases (incl. all
prior module-following tests) pass unchanged — no regressions.

### Changed — `buildModuleOutputPolicies` resolves passthrough outputs

Added a `grandchildPolicies` param: an output whose value is a
`module.<label>.<output>` ref (not a data-source ref) now resolves through
the grandchild index — the recursive case complementing the base-case
`data.aws_iam_policy_document.<n>.json` resolution.

### Tests

1 new `parse.test.ts` case (TDD red→green): three-deep passthrough
(root → outer → inner) resolving to `Action "*"`. Gate: 679 unit + 38
integration, 0 regressions.

## 1.9.17

Capability — resolve IAM policies consumed via a **module output**. A common
module pattern exposes a composed policy and the parent wires it in:

```hcl
# child module
data "aws_iam_policy_document" "p" { statement { actions = ["*"] … } }
output "policy_json" { value = data.aws_iam_policy_document.p.json }

# parent
resource "aws_iam_policy" "x" { policy = module.m.policy_json }
```

Previously the parent's `policy = module.<label>.<output>` degraded to
**could-not-evaluate** (module outputs resolved to generic values, not
`PolicyInfo`). Now it resolves to the child's parsed statements, so
`denyIamWildcard` / `denyPublicPrincipal` / `requireSslOnlyPolicy` fire
definitively instead of silently passing.

### Added — module-output policy resolution

- `buildModuleOutputPolicies(roots, childDataPolicies, label)` — indexes a
  followed child's `output`s whose value is a sole
  `data.aws_iam_policy_document.<name>.json`, keyed `<label>.<output>` →
  `PolicyInfo` (the child's own `childDataPolicies` resolves the data ref).
- `policyOf` resolves `${module.<label>.<output>}` refs via the new index,
  parallel to the existing `${data.aws_iam_policy_document.x.json}` path.
- `parseTf` reordered to follow modules **before** normalizing root resources
  (the index must exist when the parent's resources normalize). Returned
  `resources` order is preserved; evaluate builds its indexes from all
  resources, so verdicts are unaffected.

### Scope

Handles **direct-child** outputs (the common case). A child consuming its own
data doc already worked (data sources are module-local). A passthrough output
(`output x = module.inner.y`, a module re-exporting a nested module's policy)
still degrades to unresolved — would need reordering `followModules` to follow
grandchildren before the child's resources normalize. Documented as the
remaining narrow gap.

### Tests

3 new `parse.test.ts` cases (TDD red→green): module-output resolution
(parent `policy = module.m.policy_json` → parsed, with `Action "*"` /
`Principal "*"` assertions), a child-owns-doc regression lock, and a negative
boundary (a non-policy output stays unresolved). Gate: 650 unit + 38
integration, 0 regressions from the `parseTf` reorder.

## 1.9.16

Preset audit complete — the last deferred gap (MSK) is closed. The earlier
round flagged MSK client-broker encryption as risky because its attribute
lives in a **2-level nested block**
(`encryption_info.encryption_in_transit.client_broker`); existing attributes
only used 1-level nesting. Investigation confirmed the flattener (`collect`
in `normalize.ts`) already recurses through nested blocks at arbitrary depth,
so **no normalize change was needed** — verified empirically against a real
3-cluster fixture before release.

### Added — Amazon MSK client-broker encryption (`coreSecurity`)

`aws_msk_cluster` was recognized but ungoverned. Added:

- `MskClientBroker` attribute (`encryption_info.encryption_in_transit.client_broker`) — the flattener resolves the 2-level nesting unchanged
- `MskClientBrokerEncryption` enum (`TLS` / `TLS_PLAINTEXT` / `PLAINTEXT`)
- `msk-no-plaintext-client-broker` rule — **blocking** `denyValue(PLAINTEXT)`

A cluster with `client_broker = "PLAINTEXT"` (TLS disabled) now flags; `TLS`
and the AWS default (block omitted → defaults to TLS) pass. `TLS_PLAINTEXT`
(mixed mode, TLS still available) is intentionally not flagged to avoid noise.

### Net effect

**The preset audit is now 100% complete.** Every DB-cluster type (Aurora /
DocDB / Redshift), every credential surface (RDS/Aurora/DocDB/Redshift/MQ/
Secrets Manager/ElastiCache), OpenSearch, and MSK are governed. No remaining
"everything except …" caveat. Verified: MSK fixture (PLAINTEXT→BLOCKING,
TLS→pass, default→pass, 0 CNE).

## 1.9.15

Preset audit round 2 — close the remaining data-store / credential / exposure
gaps found by a deeper sweep of all eight presets against the vocabulary.
(OpenSearch nested-block flattening verified end-to-end against a real
`encrypt_at_rest {}` fixture before release.)

### Added — OpenSearch domain hardening (`coreSecurity` + `cisAws`)

`aws_opensearch_domain` was recognized but ungoverned. Added three
nested-block attributes and rules:

- `encrypt_at_rest.enabled` → **blocking** at-rest encryption (`coreSecurity`)
- `node_to_node_encryption.enabled` → **warn** inter-node TLS (`coreSecurity`)
- `domain_endpoint_options.enforce_https` → **warn** endpoint HTTPS (`cisAws`)

Verified: a domain missing `encrypt_at_rest` flags BLOCKING; one with all
three set passes; `0` could-not-evaluate (the flattener resolves the nested
blocks to dotted paths).

### Added — Amazon MQ + Secrets Manager credential rules (`coreSecurity`)

- `aws_mq_broker` `admin_password` → **blocking** `denyLiteral`
  (`no-hardcoded-mq-admin-password`)
- `aws_secretsmanager_secret_version` `secret_string` → **warn** `denyLiteral`
  (`no-hardcoded-secret-string`). Secrets Manager is the right _destination_,
  but a literal value still lands in state/VCS — surfaced as a warning rather
  than a hard block.

### Fixed — Aurora/DocDB cluster instances now covered for public exposure

`cisAws`, `pciDss`, and `dataProtection` ran `mustBeFalse(publicly_accessible)`
on `aws_db_instance` only. Aurora/DocDB **instances**
(`aws_rds_cluster_instance`, `aws_docdb_cluster_instance`) carry the same
attribute and could be publicly exposed — now added to all three rules.

### Added — ElastiCache transit encryption (`cisAws`)

`cisAws` governed ElastiCache _at-rest_ encryption only. Added a **warn**
`mustBeTrue(transit_encryption_enabled)` rule for Redis traffic in transit.

### Added — Azure SQL admin password (`cisAzure`)

Cross-cloud parity: `coreSecurity` governs AWS db passwords, `cisGcp` governs
Cloud SQL `root_password`, but `cisAzure` only governed MSSQL TLS. Added a
**blocking** `denyLiteral(administrator_login_password)` rule for Azure SQL.

### Net effect

Cluster-instance public exposure, OpenSearch encryption, MQ/Secrets-manager
credentials, ElastiCache transit, and Azure SQL passwords are now governed.
Presets remain structurally consistent (all eight compile + validate; count
assertions still hold — `coreSecurity` now at ~18 rules). MSK client-broker
encryption intentionally deferred (complex nested structure, needs normalize
work).

## 1.9.14

Preset audit follow-up — close three DB-cluster / credential gaps found by a
systematic cross-reference of all eight presets against the vocabulary (the
same Aurora-style pattern: a sibling cluster resource carries the attribute
but the rule missed it).

### Fixed — `coreSecurity` now governs DocumentDB clusters

`aws_docdb_cluster` carries both `storage_encrypted` and `master_password`
(it is MongoDB-compatible master auth), but was missed by the same blind spot
that previously missed Aurora:

- `rds-cluster-encryption` now targets `aws_rds_cluster` **and** `aws_docdb_cluster`
- `no-hardcoded-cluster-password` now targets `aws_rds_cluster`,
  `aws_redshift_cluster`, **and** `aws_docdb_cluster`

(Redshift still uses a distinct `encrypted` attr for at-rest encryption, kept
in the CIS/PCI/NIST packs.)

### Fixed — Aurora backup retention now governed

`aws_rds_cluster` carries `backup_retention_period`, but the retention rules
targeted only `aws_db_instance`:

- `coreSecurity` baseline (≥7 days) now targets `aws_db_instance` **and** `aws_rds_cluster`
- `pciDss` stricter baseline (≥30 days) now targets both as well

### Fixed — `coreSecurity` now denies plaintext ElastiCache AUTH tokens

Added `no-hardcoded-elasticache-auth-token` governing
`aws_elasticache_replication_group.auth_token` (the Redis AUTH credential).
The CIS pack already governed ElastiCache _at-rest encryption_; the plaintext
AUTH token was a credential surface that previously escaped `coreSecurity`
(the ai-generated example spec already had this rule).

### Net effect

No DB-cluster type now silently escapes storage-encryption, master-password,
or backup-retention governance across the cluster family
(Aurora / DocDB / Redshift). ElastiCache's AUTH credential is now on par with
RDS/Redshift passwords. Presets remain structurally consistent (all eight
compile + validate; the `coreSecurity >= 15` count assertion now holds at 16).

## 1.9.13

Dogfood round 10 follow-up — close the Aurora governance gap across shipped
specs. Round 10 surfaced that the ad-hoc dogfood spec targeted only
`aws_db_instance` for DB encryption/password, so Aurora (`aws_rds_cluster`)
got **no** DB finding. Investigation showed `coreSecurity` already governed
Aurora **encryption** (`rds-cluster-encryption`), but three shipped artifacts
still missed Aurora for either encryption or master-password:

### Fixed — `coreSecurity` now governs Aurora/Redshift master passwords

The `no-hardcoded-db-password` rule targeted only `aws_db_instance.password`.
Added `no-hardcoded-cluster-password` targeting `aws_rds_cluster` and
`aws_redshift_cluster` via the `master_password` attribute (the cluster-level
credential, distinct from `aws_db_instance.password`). Mirrors the pattern
already in the ai-generated example spec. Engine behavior for
`RdsCluster` + `denyLiteral(MasterPassword)` was already covered by
`evaluate.secrets.test.ts`.

### Fixed — scaffold template now Aurora-aware

`dotzen init`'s generated `.zen/spec.ts`:

- Storage-encryption rule now targets `aws_db_instance` **and** `aws_rds_cluster`
- Added an Aurora `master_password` plaintext-secret rule (previously only
  `aws_db_instance.password` was governed)

Users who scaffold a spec (without composing `coreSecurity`) are now protected
against unencrypted / plaintext-password Aurora clusters out of the box.

### Fixed — ai-generated example spec encryption rule

`examples/ai-generated/.zen/spec.ts` storage-encryption rule now targets
`aws_rds_cluster` alongside `aws_db_instance` (its master-password rule
already covered Aurora/Redshift — now encryption matches).

### Net effect

All three shipped spec surfaces (preset, scaffold, example) now govern Aurora
clusters for both storage encryption and master-password plaintext — no
remaining path where an Aurora cluster silently escapes DB governance.

## 1.9.12

Dogfood round 10 — fresh-repo verification follow-up. Ran v1.9.11 against 4
previously-untested module repos (`terraform-aws-rds-aurora`,
`terraform-aws-cloudwatch`, `terraform-aws-route53`,
`terraform-google-cloud-storage`): **zero false positives** (convergence
holds — 0 FPs since round 6). This release closes the 18 vocabulary/utility
gaps surfaced as `ungoverned`.

### Fixed — `data.archive_file` moved to UTILITY_TYPES

`data.archive_file` zips a directory/file at build time (Lambda/ECS
artifacts) — a pure build utility with no security surface. It was surfacing
as ungoverned on `terraform-aws-cloudwatch`. Added to `UTILITY_TYPES` for
silent skipping (matches `local_file` / `cloudinit_config`).

### Added — AWS resource vocabulary (14)

Surfaced on the Aurora, CloudWatch, and Route53 modules:

**Aurora / RDS-cluster / autoscaling / DSQL** (`terraform-aws-rds-aurora`):

- `aws_rds_cluster_activity_stream`, `aws_rds_cluster_parameter_group`, `aws_rds_shard_group`
- `aws_appautoscaling_policy`, `aws_appautoscaling_target` (Aurora auto-scaling)
- `aws_dsql_cluster`, `aws_dsql_cluster_peering` (Aurora DSQL)

**CloudWatch Logs** (`terraform-aws-cloudwatch`):

- `aws_cloudwatch_log_account_policy`, `aws_cloudwatch_log_anomaly_detector`
- `aws_cloudwatch_log_data_protection_policy`, `aws_cloudwatch_log_subscription_filter`

**Route53 DNSSEC / firewall** (`terraform-aws-route53`):

- `aws_route53_hosted_zone_dnssec`, `aws_route53_key_signing_key`, `aws_route53_resolver_firewall_rule`

### Added — Data source vocabulary (3)

- `data.aws_service_principal`, `data.aws_rds_engine_version`, `data.aws_cloudwatch_log_data_protection_policy_document`

### Note — Aurora encryption is already governed

The round-10 dogfood spec (an ad-hoc AWS spec copied from round 9) targeted
only `aws_db_instance` for storage encryption, so Aurora
(`aws_rds_cluster`) showed **no** encryption finding. This is a spec-authoring
choice, **not** an engine gap: the shipped `coreSecurity` preset already
governs Aurora via the `rds-cluster-encryption` rule
(`aws_rds_cluster` → `storage_encrypted`, `core-security.ts:261`). Real
consumers using `[...coreSecurity]` are protected.

### Dogfood round 10 summary

| Repo              | Blocking V | Warn | Passed | CNE | FP  |
| ----------------- | ---------- | ---- | ------ | --- | --- |
| aws-rds-aurora    | 13         | 1    | 1874   | 25  | 0   |
| aws-cloudwatch    | 0          | 5    | 685    | 10  | 0   |
| aws-route53       | 3          | 0    | 287    | 11  | 0   |
| gcp-cloud-storage | 0          | 0    | 60     | 2   | 0   |

All 19 findings real (15 tag-policy, 1 provisioner, 3+ inline-policy warns);
CNE = remote-module-following + var-driven SG ports. With v1.9.12 all four
repos should report **zero ungoverned**.

## 1.9.11

Dogfood round 9 follow-up — close the remaining ungoverned vocabulary gaps
surfaced by the v1.9.10 verification run. All 19 additions are
recognized-but-not-yet-rule-bearing (pure enum-add, no engine work), per
the established ROADMAP item-1 pattern: surfacing them removes `ungoverned`
noise on real module repos, and adding rules later is enum-add only.

### Added — AWS resource vocabulary (10)

**Modern EC2 decomposition** (surfaced on `terraform-aws-ec2`):

- `aws_ec2_tag` — per-tag resource, successor to inline `tags`
- `aws_volume_attachment` — EBS↔instance link
- `aws_network_interface` — ENI
- `aws_ec2_capacity_reservation`

**EventBridge modern families** (surfaced on `terraform-aws-eventbridge`):

- `aws_pipes_pipe` — EventBridge Pipes
- `aws_scheduler_schedule` / `aws_scheduler_schedule_group` — EventBridge Scheduler
- `aws_cloudwatch_log_delivery` / `_destination` / `_source` — account-level log-delivery triplet

### Added — GCP resource vocabulary (5)

Surfaced on `terraform-google-vpc-service-controls`:

- `google_project` — the bare project resource (only `google_project_iam_*` were present)
- `google_project_service` — API enablement
- `google_compute_router_interface` / `_peer` — Cloud Router BGP sub-resources (`google_compute_router` was already present)
- `google_organization_policy` — legacy org-level constraint policy (successor is `google_org_policy_policy`, already present)

### Added — Data source vocabulary (4)

Read-only, no security surface — recognized so they don't surface as ungoverned:

- `data.aws_cloudwatch_event_bus`
- `data.aws_organizations_organization`
- `data.google_project`
- `data.google_projects`

### Dogfood verification (v1.9.11 target)

All three round-9 repos should now report **zero ungoverned** (only
violations/CNE/remote-module-following remain):

| Repo            | Ungov (v1.9.10)  | Ungov (v1.9.11 target) |
| --------------- | ---------------- | ---------------------- |
| AWS EC2         | 4 types          | 0                      |
| AWS EventBridge | 6 types + 2 data | 0                      |
| GCP VPC-SC      | 5 types + 2 data | 0                      |

## 1.9.10

Dogfood round 9 — precision suffix + ungoverned-coverage fixes. Running
v1.9.9 against 3 fresh repos (AWS EC2, AWS EventBridge, GCP VPC-SC)
surfaced a `credentials_path` identifier FP and two large ungoverned-noise
categories on the EventBridge repo.

### Fixed — `_path` identifier + config-flag suffix

`denyInsensitiveVariable` and `denyPlaintextLocalSecret` now skip names
ending in `_path` (e.g. `credentials_path`, `file_path`, `key_path`). A
path is a structural identifier / filesystem location, not a hardcoded
secret or sensitive value. Added to both `CONFIG_FLAG_SUFFIX` and
`IDENTIFIER_SUFFIX`. (Eliminates the `credentials_path` FP on GCP VPC-SC.)

### Added — `aws_iam_policy_attachment` + EventBridge vocabulary

The AWS EventBridge repo surfaced 403 ungoverned resources, 224 of which
were `aws_iam_policy_attachment` — the generic policy attachment (can
attach to roles/users/groups via list attrs). Only the three specific
variants (`aws_iam_role_policy_attachment`, `aws_iam_group_policy_attachment`,
`aws_iam_user_policy_attachment`) were previously in the vocabulary.

Also added the four core EventBridge (formerly CloudWatch Events) resource
types that were missing while their less-common siblings (bus, archive,
permission, bus_policy) were already present:

- `aws_cloudwatch_event_rule`
- `aws_cloudwatch_event_target`
- `aws_cloudwatch_event_connection`
- `aws_cloudwatch_event_api_destination`

These are recognized-but-not-yet-rule-bearing — surfacing them removes
ungoverned noise; adding rules later is enum-add only.

### Dogfood round 9 summary

| Repo            | V   | P   | CNE | Ungov    |
| --------------- | --- | --- | --- | -------- |
| AWS EC2         | 16  | —   | 16  | —        |
| AWS EventBridge | 0   | —   | —   | 403 → ~0 |
| GCP VPC-SC      | 6   | —   | —   | —        |

EC2: 16 violations are resource tags (expected); 16 CNE are variable-driven
SG ports (expected — can't evaluate `var.port` without caller input).
EventBridge: 0 violations; 403 ungoverned → ~0 after the vocabulary
expansion (`aws_iam_policy_attachment` ×224 + EventBridge types).
VPC-SC: 6 violations — `credentials_path` FP (fixed by `_path` suffix),
`vpn_shared_secret` real (legitimate hardcoded secret).

## 1.9.9

Dogfood round 8 — precision + coverage fixes. Running v1.9.8 against 4 fresh
repos (CloudFront, GCP KMS, EKS Blueprints, Auto Scaling Groups) surfaced
local-secret identifier FPs + Kubernetes-provider coverage noise.

### Fixed — local-secret identifier-suffix skip

`denyPlaintextLocalSecret` now skips locals whose name ends in an identifier
suffix (`_name`/`_arn`/`_sa`/`_suffix`/etc.) — a local like
`secretstore_name = "my-store"` is a resource identifier, not a hardcoded
secret, even though the name contains "secret" (inside "secretstore"). The
config-flag suffixes (`_enabled`/`_disabled`/etc.) do NOT apply to locals —
a hardcoded value in a config-flag-named local is still suspicious. (4 FPs
eliminated on the EKS Blueprints.)

### Fixed — `denyInsensitiveVariable` identifier suffixes

Added `_name` and `_suffix` to the config-flag suffix list (e.g.
`aws_secret_manager_git_private_ssh_key_name` — an identifier, not a secret
value; `argocd_secret_manager_name_suffix` — a name suffix). (9 FPs
eliminated.)

### Added — Kubernetes provider + data source coverage

The EKS Blueprints repo uses Kubernetes-provider resources (`helm_release`,
`kubectl_manifest`, `kubernetes_*`) extensively — these are not cloud IaC
(dotzen governs cloud infrastructure, not K8s manifests). Added 40+
Kubernetes provider types to `UTILITY_TYPES` for silent skipping, plus 5
common data sources to `DataResource` (`data.aws_secretsmanager_secret`,
`data.aws_subnets`, `data.aws_route53_zone`, etc.). EKS Blueprints:
111 → 45 ungoverned.

### Dogfood round 8 summary

| Repo               | V   | P    | CNE | Ungov |
| ------------------ | --- | ---- | --- | ----- |
| AWS CloudFront     | 0   | 189  | 11  | 28    |
| GCP KMS            | 0   | 98   | 14  | 6     |
| AWS EKS Blueprints | 6   | 644  | 146 | 45    |
| AWS Auto Scaling   | 1   | 1398 | 5   | 13    |

CloudFront + KMS **fully clean** (0 V). EKS Blueprints: 5 tags + 1 real
(`kubecost_token` not sensitive). Auto Scaling: 1 real (provisioner use).
0 FPs after the fixes.

## 1.9.8

Re-publish of v1.9.7 (the v1.9.7 tag pipeline failed on a CHANGELOG.md
format:check — the format step ran from the wrong cwd in the release chain).
Identical engine code to v1.9.7; the only change is the formatted CHANGELOG.

## 1.9.7

Dogfood round 7 — one config-flag suffix fix. Running v1.9.6 against 3 fresh
module repos (BigQuery, ElastiCache, GCP Memorystore) surfaced 0 false
positives except one config-flag name.

### Fixed — `denyInsensitiveVariable` `_strategy` suffix

Added `_strategy` to the config-flag suffix list (e.g.
`auth_token_update_strategy` — a config method string "ROTATE"/"SET"/"DELETE",
not a secret value). 13 FPs eliminated on the ElastiCache module. The module's
`auth_token` variable (a REAL Redis AUTH password, `string`-typed) is still
correctly flagged.

### Dogfood round 7 summary

| Repo            | V   | P    | CNE | Ungov |
| --------------- | --- | ---- | --- | ----- |
| GCP BigQuery    | 0   | 80   | 17  | 1     |
| AWS ElastiCache | 26  | 1338 | 23  | 15    |
| GCP Memorystore | 0   | 58   | 19  | 8     |

BigQuery + Memorystore **fully clean** (0 violations). ElastiCache: 13 real
(`auth_token` not sensitive) + 13 tags. 0 FPs after the fix. 13 CNE = variable-
driven SG ports (honest). The v1.9 BigQuery public-access rule passes correctly
on the BigQuery module.

## 1.9.6

Dogfood round 5 precision + coverage fixes. Running v1.9.5 against 3 fresh
module repos (ECS, S3, Azure VM) surfaced 0 false positives on governed
resources + one complex-type secret-variable precision gap.

### Fixed — `denyInsensitiveVariable` complex-type skip

Extended the type-based skip from `bool`/`number` only to ALL collection
types (`list`/`set`/`map`/`object`/`tuple`). A collection-typed variable named
`secrets` or `repositoryCredentials` holds a collection of REFERENCES (ARNs,
secret-name mappings, ECS secret configs), not scalar secret values. A secret
is always a `string`; a `list(object({...}))` or `list(string)` named `secrets`
is a config/reference container. The ECS module had 30 FPs (`secrets` =
`list(object(...))`, `repositoryCredentials` = `object(...)`, `credentialSpecs`
= `list(string)`); the Azure VM module had 8 FPs (`secrets` =
`list(object(...))`). All eliminated. A bare `string`-typed variable
(`db_password`) is still evaluated exactly as before.

### Added — vocabulary (S3 companion + data source coverage)

The S3 bucket module surfaced 133 ungoverned on companion resources. Added:

- `AwsResource.S3DirectoryBucket`, `S3BucketAccelerateConfiguration`,
  `S3BucketAnalyticsConfiguration`, `S3BucketMetadataConfiguration`,
  `S3BucketObjectLockConfiguration` — S3 companion resources (no security
  rules yet, but recognized so they don't surface as coverage noise).
- `DataResource.AwsCanonicalUserId` (`data.aws_canonical_user_id`) — common
  read-only data source for S3 ACL configurations.
- S3 module: 147 → 14 ungoverned.

### Dogfood round 5 summary

| Repo     | V   | P    | CNE | Ungov |
| -------- | --- | ---- | --- | ----- |
| AWS ECS  | 11  | 3358 | 36  | 35    |
| AWS S3   | 22  | 2962 | 28  | 14    |
| Azure VM | 0   | 675  | 5   | 19    |

All violations legitimate (tags on example resources). Azure VM: **0
violations** (fully clean). 0 false positives on any repo.

### Migration notes

Backward-compatible. Consumers will see fewer `denyInsensitiveVariable`
violations — complex-typed variables (lists/objects/maps) named `secrets` etc.
are now skipped. A `string`-typed secret variable is still flagged.

## 1.9.5

Dogfood round 4 precision + coverage fixes. Running v1.9.4 against 4 fresh
module repos (RDS, Lambda, GCP network, Azure Key Vault) surfaced 0 false
positives on governed resources + one secret-variable precision gap.

### Fixed — `denyInsensitiveVariable` identifier-suffix precision

Extended the config-flag suffix list with identifier/config suffixes that
caused 216 false positives on the RDS module (4 unique variable names repeated
across 54 module instances): `_arn` (`domain_auth_secret_arn` — an ARN is a
reference, not a secret value), `_duration` (`master_user_password_rotation_
duration`), `_expression` (`..._rotation_schedule_expression`), `_key_id`
(`master_user_secret_kms_key_id` — a KMS key ID is not a secret). All are
metadata ABOUT secrets (rotation config, KMS key, ARN pointer), not the
secret values themselves.

### Added — vocabulary (coverage noise reduction)

Dogfood round 4 surfaced 402 ungoverned on the Lambda module (mostly data
sources + docker provider types). Added to reduce noise:

- `DataResource.AwsIamPolicy` (`data.aws_iam_policy`) + `AwsCloudwatchLogGroup`
  (`data.aws_cloudwatch_log_group`) — common read-only data sources.
- `AwsResource.LambdaFunctionRecursionConfig` (`aws_lambda_function_recursion
_config`) — Lambda config resource.
- `UTILITY_TYPES`: `aws_arn`, `external`, `docker_image`,
  `docker_registry_image` — utility types with no security surface (ARN
  parsing, external-provider queries, container builds). Lambda module:
  402 → 18 ungoverned.

### Dogfood round 4 summary

| Repo            | V   | P     | CNE | Ungov |
| --------------- | --- | ----- | --- | ----- |
| AWS RDS         | 32  | 7533  | 32  | 58    |
| AWS Lambda      | 63  | 12301 | 12  | 18    |
| GCP network     | 0   | 787   | 64  | 29    |
| Azure Key Vault | 0   | 44    | 5   | 6     |

All violations legitimate (tags, RDS encryption, inline-policy, provisioner).
GCP network + Azure Key Vault: **0 violations** (both clean). 0 false positives
on any repo.

### Migration notes

Backward-compatible. Consumers will see fewer `denyInsensitiveVariable`
violations (identifier-named variables) and less ungoverned noise (data
sources + utility types now covered).

## 1.9.4

Dogfood round 3 coverage fixes. Running v1.9.3 against 4 fresh module repos
(terraform-aws-modules/alb, terraform-aws-modules/eks,
Azure/terraform-azurerm-storage, terraform-google-modules/sql-db) surfaced
two coverage gaps. Zero false positives on any repo.

### Added — `aws_vpc_security_group_egress_rule` governance

The modern decomposed egress-rule resource (the egress counterpart of the
already-governed `aws_vpc_security_group_ingress_rule`) was ungoverned —
26x on the EKS module. It is now in `AwsResource` and mapped to the
cloud-neutral `egress` field (same field shape as the ingress rule:
`cidr_ipv4`/`cidr_ipv6`/`from_port`/`to_port`). The existing `denyEgress`
condition governs it unchanged, and the `inScope` special-case lets a
`denyEgress` rule on `aws_security_group` cover it.

### Fixed — utility-type noise on `data.cloudinit_config` + `local_file`

`data.cloudinit_config` (112x) and `local_file` (33x) were surfaced as
ungoverned on the EKS module. Both are utility types with no security surface
(cloud-init config generation; local file writing). Added to `UTILITY_TYPES`
for silent skipping (neither governed nor surfaced as a coverage gap). The
EKS module dropped from 318 → 147 ungoverned.

### Dogfood round 3 summary

| Repo          | V   | P    | CNE | Ungov |
| ------------- | --- | ---- | --- | ----- |
| AWS ALB       | 5   | 408  | 20  | 14    |
| AWS EKS       | 85  | 8053 | 107 | 147   |
| Azure storage | 0   | 54   | 5   | 1     |
| GCP Cloud SQL | 2   | 232  | 31  | 11    |

All violations legitimate (tags, inline-policy, secret-variables). All CNE
legitimate (module-following + unresolved variable-driven values). Zero false
positives. The Azure storage module — exercising the v1.8 niche rules
(infra-encryption, TLS, public access) — passed cleanly (0 violations).

### Added — vocabulary

- `AwsResource.VpcSecurityGroupEgressRule` (`aws_vpc_security_group_egress_rule`)

### Migration notes

Backward-compatible. The egress-rule resource is now governed (was a coverage
gap). Two utility types are silently skipped (were noise). No new violations.

## 1.9.3

### Fixed — `denyInsensitiveVariable` config-flag precision (dogfood round 2, Finding #3)

The rule over-fired on config-flag variables whose names contain a secret-like
word (PASSWORD/SECRET/KEY/TOKEN) but are actually configuration parameters —
not secret values. The AWS IAM module dogfood produced 129 false positives on
names like `max_password_age`, `create_access_key`, `password_reuse_prevention`.

**Three-pronged precision fix** (all skip only `denyInsensitiveVariable`, not
`denyPlaintextLocalSecret` — a hardcoded value in a secret-named local IS
suspicious regardless):

- **Type-based skip** (most principled): a variable whose `type` constraint is
  `bool` or `number` is definitionally not a secret (a secret is always a
  string). The variable's `type` is now threaded through `NormalizedBinding`.
  `string` / `list` / `map` / object-typed variables are still evaluated; a
  variable with no type declared is still flagged (conservative).
- **Verb-prefix skip**: `allow_*`, `create_*`, `attach_*`, `enable_*`,
  `disable_*` describe action/permission toggles, not secret values.
- **Extended config-flag suffix list**: added `_status`, `_policy`, `_arns`,
  `_permission`, `_age`, `_length`, `_required`, `_prevention` to the existing
  `_enabled`/`_disabled`/`_interval`/etc.

**Result:** the AWS IAM module dogfood dropped from 159 → 30 violations (0
secret-variable false positives remain; all 30 are legitimate inline-policy
findings — the module's core purpose is to create IAM roles with inline
policies).

### Added — vocabulary

- `NormalizedBinding.type` (the raw variable `type` constraint, for the
  type-based skip above).

### Migration notes

Backward-compatible. Consumers will see FEWER `denyInsensitiveVariable`
violations — specifically, bool/number-typed variables and verb-prefixed /
extended-suffix config flags are no longer flagged. A `string`-typed secret
variable (e.g. `db_password`) is still flagged exactly as before.

## 1.9.2

Dogfood round 2 fixes. Two issues surfaced running v1.9.1 against real module
repos (terraform-aws-modules/vpc, terraform-google-modules/kubernetes-engine,
Azure/terraform-azurerm-aks, terraform-aws-modules/iam).

### Fixed — `requireEncryptedBackend` false-positive storm on module repos

The rule previously fired a violation on EVERY `.tf` file with no `backend`
block — but module repos intentionally declare no backend (the backend is the
env/layer consumer's concern). This produced 40–63 false "State backend must
be encrypted" violations per module repo (the #1 noise source, an adoption
blocker).

**Changed:** `requireEncryptedBackend` now PASSES when no backend is declared
(absence = pass). It fires only when a backend IS declared but unencrypted
(including `local`, which has no encrypt concept). The "must declare a
backend" concern is `denyLocalBackend`'s job (opt-in, not in `coreSecurity`).
The two rules are now cleanly complementary.

### Added — `aws_security_group_rule` (legacy standalone SG rule) governance

The legacy `aws_security_group_rule` resource (which handles both ingress and
egress via `type = "ingress" | "egress"`) was ungoverned — surfaced as a
coverage gap on the AWS VPC module dogfood. It is now in `AwsResource` and
mapped to the cloud-neutral `ingress` field (filtering on `type = "ingress"`;
egress rules are skipped). The existing `denyIngress` condition governs it
unchanged, and the `inScope` special-case lets a `denyIngress` rule on
`aws_security_group` cover it (same as the modern `aws_vpc_security_group_
ingress_rule`).

### Migration notes

**Behavior change:** consumers composing `coreSecurity` will see FEWER
`requireEncryptedBackend` violations — specifically, the "no backend declared"
violations on module repos are gone (absence is now pass). Users who relied on
`requireEncryptedBackend` to enforce "must declare a backend" should compose
`denyLocalBackend` (which still flags absence/local). Declared-but-unencrypted
backends are still flagged exactly as before.

## 1.9.1

Two module-following resolver improvements (ROADMAP #8 + #9) that convert
could-not-evaluate findings to definite verdicts. Engine internals — no new
spec DSL vocabulary.

### Changed — engine resolution

- **`count = N` per-index expansion** — a resource with a literal `count = N`
  (N > 0) now expands into N instances (was: followed once). Each instance
  gets `count.index` threaded into its scope (resolves to the instance
  number) and `instanceKey = "<i>"`. A `count = var.n` that resolves to a
  literal expands too; an unresolvable count is still followed once honestly
  (`count.index` refs degrade to could-not-evaluate — never a false verdict).
  `count = 0` skip and `count = 1` single-instance behavior are unchanged.
- **`each.value.<field>` field access** — a `for_each` over a MAP of objects
  now resolves dotted field access on the element (`each.value.port`,
  `each.value.cidr`). A for_each over SCALARS has a non-object element, so
  field access degrades to unresolved (honest — a scalar has no fields).
  Compound interpolations like `name-${each.value.env}` resolve too (the
  `tryEvalConcat` helper was generalized to delegate inner resolution to
  `resolveValue`, which handles sole refs, `each.value.<field>`, and
  conservative ternaries).
- `SOLE_REF` now matches `count.index` (so `resolveRaw` handles it for
  association linking too, not just `resolveValue`).

### Migration notes

Backward-compatible. Resources using `count = N` (N > 1) or
`each.value.<field>` that previously produced could-not-evaluate findings
will now produce definite verdicts (pass or violation) where the indexed/
field value is statically resolvable. No new false positives — the
expansion only fires on resolvable literal counts, and unresolved counts/
fields degrade honestly as before.

## 1.9.0

Closes the optional GCP niche remainder (ROADMAP #6): three `cisGcp` rules +
new vocabulary. Reuses existing conditions (including the v1.7
`requireResource` for the audit-config presence check) — no engine change.

### Added — `cisGcp` preset rules (GCP niche, ROADMAP #6)

- **Cloud Audit Logs config presence** (`require-audit-config`) — a
  `google_project_iam_audit_config` must be declared so admin/data access is
  logged. Uses the v1.7 `requireResource` condition (project-level presence).
  `warn`.
- **GKE Shielded Nodes** (`gke-shielded-nodes`) — `google_container_cluster`
  must enable `shielded_nodes.enabled` (integrity verification at the node
  level, complementing per-instance shielded VMs). `mustBeTrue`, `warn`.
- **BigQuery dataset public access** (`bigquery-no-public-access`) — flags a
  `special_group = "allAuthenticatedUsers"` grant on the standalone
  `google_bigquery_dataset_access` resource OR the dataset's inline
  `access {}` block. Two `denyValue` conditions on one rule (each resource
  type trips only its own — the other attr is absent → pass). `block`.
  NOTE: the inline form catches the FIRST `access {}` block only (the
  flattener recurses into `v[0]`); a multi-block dataset where a later block
  is public is a known gap (needs the multi-block `collect` change).

### Added — vocabulary

- `GcpResource.ProjectIamAuditConfig` (`google_project_iam_audit_config`)
- `GcpAttribute.ShieldedNodesEnabled` (`shielded_nodes.enabled`)
- `GcpAttribute.SpecialGroup` (`special_group`) — standalone BigQuery access
- `GcpAttribute.AccessSpecialGroup` (`access.special_group`) — inline access

### Migration notes

Backward-compatible. Consumers composing `[...coreSecurity, ...cisGcp]` will
see new findings: a `warn` for projects with no audit config, a `warn` for GKE
clusters without shielded nodes, and a `block` for BigQuery datasets granting
`allAuthenticatedUsers`. The `cis-gcp-smoke` fixture's compliant GKE cluster
was updated to set `shielded_nodes { enabled = true }` and a compliant
`google_project_iam_audit_config` was added.

## 1.8.0

Closes the optional Azure niche remainder (ROADMAP #5): three `warn`-effect
`cisAzure` rules + two new `AzureAttribute` members. Reuses existing
conditions — no engine change.

### Added — `cisAzure` preset rules (Azure niche, ROADMAP #5)

- **Cosmos DB local auth** (`cosmos-no-local-auth`) — `azurerm_cosmosdb_account`
  must set `local_authentication_disabled = true` (Entra ID/AAD identity-based
  auth; local keys are a long-lived credential surface). `mustBeTrue`, `warn`.
- **App Service min-TLS** (`app-service-min-tls`) — `azurerm_linux_web_app` /
  `windows_web_app` / `linux_function_app` / `windows_function_app` must enforce
  `site_config.minimum_tls_version = "1.2"`. `mustBeOneOf`, `warn`. (Client-cert
  was deliberately skipped — it is not a universal control and would
  false-violate apps that do not use mTLS.)
- **Storage infrastructure encryption** (`storage-infrastructure-encryption`) —
  `azurerm_storage_account` must enable `infrastructure_encryption_enabled` (a
  second platform-managed encryption layer at rest). `mustBeTrue`, `warn`.

### Added — vocabulary

- `AzureAttribute.LocalAuthenticationDisabled` (`local_authentication_disabled`)
- `AzureAttribute.InfrastructureEncryptionEnabled` (`infrastructure_encryption_enabled`)

### Migration notes

Backward-compatible. Consumers composing `[...coreSecurity, ...cisAzure]` will
see new `warn`-effect findings on Cosmos accounts using key auth, App Services
on a weak TLS floor, and storage accounts without infrastructure encryption.
The `cis-azure-smoke` integration fixture's compliant storage account was
updated to set `infrastructure_encryption_enabled = true`.

## 1.7.0

A feature release: a new project-level condition, two engine resolution
improvements that convert could-not-evaluate findings to definite verdicts,
NACL ingress governance, and two C6 association/policy coverage gaps closed.

### Added — new condition

- **`requireResource(type)`** — the first condition that is NOT per-resource.
  It asserts that at least one resource of `type` exists anywhere in the
  scanned project (a project-level presence check). Canonical case: CIS AWS
  §2.4 "ensure IAM Access Analyzer is enabled" (`aws_accessanalyzer_analyzer`
  must be declared). Evaluated once in a PROJECT pass; violations carry a
  synthetic `<project>:0` location. Pair with `.allResources()`; the rule's
  `.environment()`/`.providerAlias()`/`.region()` filters are ignored for
  this condition. Combines freely with per-resource conditions on the same
  rule. The `cisAws` preset ships `require-access-analyzer` (`warn`).

### Added — engine: `data.aws_iam_policy_document` policy resolution

- The idiomatic Terraform pattern for composing an IAM policy — author
  `statement {}` blocks on a `data "aws_iam_policy_document" "x" {}` and
  wire it via `policy = data.aws_iam_policy_document.x.json` — is now
  resolved end-to-end. `policyFromStatements` parses the data-source form
  (`effect`/`actions`/`not_actions`/`principals { type, identifiers }`/
  `condition { test, variable, values }`) into the same `PolicyInfo` a
  literal-JSON/`jsonencode(...)` policy produces. A cross-file index
  (`buildDataPolicies`, scoped per directory — data sources are
  module-local) lets a consuming resource's data-source ref resolve at
  normalize time. `denyIamWildcard`, `denyPublicPrincipal`, and
  `requireSslOnlyPolicy` now fire on data-source-composed policies instead
  of degrading to could-not-evaluate.

### Added — engine: GCP interpolated IAM member resolution (ROADMAP #5)

- Two conservative changes eliminate the
  `member = "serviceAccount:${google_service_account.default.email}"`
  could-not-evaluate pattern (12 of 14 CNE on the GKE module dogfood):
  - **Resolver** (`tryEvalConcat`): `prefix${sole_ref}suffix` where the
    sole var/local/each ref resolves to a literal → concatenated literal.
    Multi-interpolation, compound inner exprs, and resource-attribute refs
    stay unresolved honestly.
  - **`denyValue` literal-prefix rule** (`denyValueExcludedByLiteral`): the
    change that actually eliminates the GKE CNE. A resource-attribute ref
    is not statically resolvable, but the resolved value always starts with
    `serviceAccount:` and so can never equal a bare denylist scalar like
    `allUsers`. `denyValue` now returns a definite PASS (not CNE) when an
    unresolved expr's single `${...}` block has literal prefix/suffix text
    that rules out every denylist scalar.

### Added — Network ACL (NACL) ingress governance

- The stateless subnet-level firewall is now governed by the EXISTING
  `denyIngress` condition — no new condition kind. The normalize layer
  maps three AWS NACL shapes into the cloud-neutral `ingress` field:
  standalone `aws_network_acl_rule`, inline `aws_network_acl` `ingress {}`
  blocks, and `aws_default_network_acl`. Only INGRESS + ALLOW rules are
  openings (literal `egress=true` and `rule_action`/`action="deny"` are
  skipped; absent/unresolved includes honestly). The `cisAws` preset ships
  `nacl-no-public-ssh-rdp` (`warn`) targeting both the standalone and
  inline forms.

### Added — `cisAws` preset rules

- **`require-access-analyzer`** — project-level presence (`requireResource`,
  `warn`). CIS AWS §2.4.
- **`nacl-no-public-ssh-rdp`** — NACL ingress (`denyIngress`, `warn`).
- **`no-public-secret-policy`** — `aws_secretsmanager_secret_policy` must
  not grant `Principal: "*"` (`denyPublicPrincipal`, `block`). The
  secret-store analog of the IAM-policy `Principal: "*"` rule.

### Changed — C6 literal-name association (gap closed)

- `mustHaveAssociated`/`denyIfAssociated` now link a child that references
  its parent by a LITERAL string matching the parent's Terraform label
  (e.g. `bucket = "data"` for `aws_s3_bucket.data`). `buildAssociations`
  indexes literal-string attrs into a `literalLinks` map; the evaluators
  query it as `literalLinks.get(parent.name)?.has(childType|viaAttr)`. The
  `childType|viaAttr` key prevents unrelated attrs/types from cross-linking.
  The status quo was a false violation on the parent; this was a
  documented C6 gap ("rare; documented in the evaluator").

### Migration notes

Backward-compatible at the DSL level (no existing condition/resource/enum
removed or renamed). Consumers composing `[...coreSecurity, ...cisAws]`
will see **new findings** on this version — expected for a feature release:

- **New `warn`/`block` findings** from the three new `cisAws` rules
  (Access Analyzer absence, NACL public SSH/RDP, public secret policy).
- **could-not-evaluate → definite verdict conversions** that may surface
  new violations on existing configs:
  - `data.aws_iam_policy_document`-composed policies now resolve — a
    wildcard/principal-`*` policy that previously CNE'd now violates.
  - `denyValue` compound interpolations with a literal prefix that rules
    out every denylist scalar now PASS (fewer CNE; no new violations).
- **Fewer false violations** from C6 literal-name linking (children
  referencing parents by literal label no longer false-violate
  `mustHaveAssociated`).

## 1.6.3

### Added — ECS container insights + tfRootDirs fix

**`coreSecurity` (1 new rule):**

- **ECS cluster container insights** — `aws_ecs_cluster` must have
  `setting { value = "enabled" }` for containerInsights (warn). Uses the
  existing `mustEqual` condition on the flattened `setting.value`
  attribute — no new engine condition needed.

**Fixed — `tfRootDirs` in `scaffold.ts`:**

- `dotzen init` no longer detects `modules/` subdirectories as separate
  Terraform roots. Same class of bug as the `findTfFiles` recursive scan
  fixed in v1.4.0. The `ignored()` filter now skips `modules` path
  segments. `env/` subdirectories still detected correctly.

### Added — vocabulary

- `AwsAttribute.EcsSettingName` (`setting.name`)
- `AwsAttribute.EcsSettingValue` (`setting.value`)

### Migration notes

Backward-compatible. Users composing `[...coreSecurity, ...cisAws]` will
see new `warn`-effect findings on ECS clusters without container insights
enabled. `dotzen init` on projects with `modules/` subdirectories no
longer creates spurious root entries in `dotzen.json`.

## 1.6.2

### Added — remaining ungoverned VPC types + WAFv2 on ALB (ROADMAP #5)

- **6 VPC-specific resource types** added to `AwsResource` (verified
  against provider docs): `aws_vpc_block_public_access_exclusion`,
  `aws_vpc_block_public_access_options`, `aws_vpc_dhcp_options`,
  `aws_vpc_dhcp_options_association`, `aws_vpn_gateway_attachment`,
  `aws_vpn_gateway_route_propagation`. Eliminates the remaining 6
  ungoverned entries from the AWS VPC module dogfood.

- **WAFv2 Web ACL on ALB** — new `cisAws` rule using
  `mustHaveAssociated(AwsResource.Wafv2WebAclAssociation,
AwsAttribute.ResourceArn)`. No new engine condition needed — the
  existing `resolvedRef` mechanism already handles ARN-based resource
  attribute references (`resource_arn = aws_lb.web.arn` resolves to
  `{type: 'aws_lb', name: 'web'}` via `refAtBottom`).

- New vocabulary: `AwsAttribute.ResourceArn` (`resource_arn`).

### Migration notes

Backward-compatible. Users composing `[...coreSecurity, ...cisAws]` will
see new `warn`-effect findings on ALBs without a WAFv2 Web ACL
association. The VPC types are recognized (not ungoverned) but not
governed by any rule — no new violations from them.

## 1.6.1

### Fixed — blind spots found in AI-generated code testing

Tested dotzen against 3 AI-style Terraform fixtures (deliberately including
common AI mistakes: missing encryption, hardcoded secrets, public resources,
inline IAM policies, missing tags, absent state encryption). Found and fixed
7 blind spots:

**`coreSecurity` (3 new rules + 2 broadened):**

- **`requireEncryptedBackend`** now in `coreSecurity` (was only in
  framework packs). Catches AI configs with no `terraform {}` block.
- **`denyLiteral` on RDS password** — `aws_db_instance.password` must be a
  reference, not a literal. Catches `password = "SuperSecret123!"`.
- **`denyIamWildcard` + `denyPublicPrincipal`** broadened to also target
  `aws_iam_role_policy` and `aws_iam_user_policy` (was only on
  `aws_iam_policy`). Catches wildcard inline policies that previously
  escaped the `denyIamWildcard` rule.

**`cisAzure` (1 new rule):**

- **NSG `denyIngress`** on `azurerm_network_security_group` — Azure NSG
  public SSH/RDP now caught by `cisAzure` (was only in `coreSecurity`
  for AWS `SecurityGroup`).

**`cisGcp` (1 new rule):**

- **Compute instance `denyBlockPresence`** on `access_config` — GCP
  compute instances with public IPs now caught by `cisGcp` (was only in
  the realistic-gcp fixture's local spec).

### AI-style test fixtures

3 new integration test fixtures created:

- `tests/integration/fixtures/ai-style-aws/` — 15 deliberate AI mistakes
- `tests/integration/fixtures/ai-style-azure/` — 15 deliberate AI mistakes
- `tests/integration/fixtures/ai-style-gcp/` — 15 deliberate AI mistakes

### Migration notes

Backward-compatible. Users composing `[...coreSecurity, ...cisAws/Azure/Gcp]`
will now see **new violations** on configs that previously passed silently:
unencrypted state backends, hardcoded RDS passwords, wildcard inline IAM
policies, Azure NSGs with public SSH, and GCP compute instances with public
IPs. Review these — they were real blind spots.

## 1.6.0

### Added — `denyIfAssociated` condition (new engine capability)

New cross-resource condition: `denyIfAssociated(childType, via)` — the
inverse of `mustHaveAssociated`. Flags a resource if a separate
`childType` resource references it via the `via` attribute.

```ts
rule()
  .resource(AwsResource.IamUser)
  .denyIfAssociated(AwsResource.IamUserPolicy, AwsAttribute.User)
  .onViolation(Effect.Warn)
  .message('IAM users must not have inline policies')
```

Reuses the existing association index built by `buildAssociations` — zero
performance cost. Degrades to `couldNotEvaluate` when the `via` attribute
is an unresolvable var/local ref (same honest-degrade behavior as
`mustHaveAssociated`).

### Added — IAM inline policy rules (coreSecurity)

2 new `coreSecurity` rules using `denyIfAssociated`:

- **IAM user no inline policies** — `aws_iam_user` must not have an
  associated `aws_iam_user_policy` (warn). Managed policies are the
  preferred pattern — they're auditable, reusable, and version-controlled.
- **IAM role no inline policies** — `aws_iam_role` must not have an
  associated `aws_iam_role_policy` (warn). Same rationale.

### Added — vocabulary

- `AwsResource.EcrLifecyclePolicy` (`aws_ecr_lifecycle_policy` — from v1.5.3)
- `AwsAttribute.Repository` (`repository` — ECR lifecycle policy links to
  the repository by name)
- `AwsAttribute.User` (`user` — IAM user policy links to the user by name)
- `AwsAttribute.Role` (`role` — IAM role policy links to the role by name)
- `AwsAttribute.Group` (`group` — IAM group policy links to the group by
  name, reserved for future use)

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes.
`denyIfAssociated` is a new condition type, additive to the DSL. Users
composing `[...coreSecurity, ...cisAws]` will see new `warn`-effect
findings on IAM users and roles with inline policies. Review the findings
— inline policies are a legitimate but discouraged pattern; migrate to
managed policies where possible.

## 1.5.3

### Added — batch 3 rules for expanded vocabulary (ROADMAP #6)

3 new preset rules:

**`coreSecurity` (1 new rule):**

- **RDS cluster encryption** — `aws_rds_cluster` must have
  `storage_encrypted = true` (block). Complements the existing RDS
  instance encryption rule — Aurora clusters use `aws_rds_cluster`, not
  `aws_db_instance`.

**`cisAws` (2 new rules):**

- **S3 bucket versioning** — `aws_s3_bucket` must have an associated
  `aws_s3_bucket_versioning` resource (warn). Protects against accidental
  deletes and ransomware.
- **ECR lifecycle policy** — `aws_ecr_repository` must have an associated
  `aws_ecr_lifecycle_policy` resource (warn). Prevents stale vulnerable
  images from accumulating.

### Added — vocabulary

- `AwsResource.EcrLifecyclePolicy` (`aws_ecr_lifecycle_policy`)
- `AwsAttribute.Repository` (`repository` — ECR lifecycle policy links to
  the repository by name)

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The new
rules are additive to the preset packs. Users composing
`[...coreSecurity, ...cisAws]` will see new `warn`-effect findings on S3
buckets without versioning and ECR repos without lifecycle policies, plus
`block` findings on unencrypted RDS clusters.

**Item 6 status:** all feasible rules shipped. Remaining items (IAM user
no inline policies, WAFv2 Web ACL on ALB, ECS container insights) need
new engine condition types — future work.

## 1.5.2

### Fixed — Azure deprecated-resource verification against Go source

Verified all 52 "deprecated but real" Azure enum values against the actual
azurerm provider Go `ResourcesMap` registration files:

- **16 exact match** — confirmed real, kept as-is.
- **10 renamed** — generic type replaced by specific subtypes. Removed the
  generic entry and added the real subtypes:
  - `azurerm_metric_alert` → `azurerm_monitor_metric_alert`
  - `azurerm_policy_assignment` → 4 scoped variants
  - `azurerm_policy_exemption` → 4 scoped variants
  - `azurerm_automation_variable` → `azurerm_automation_variable_string` +
    `azurerm_automation_variable_int` + `azurerm_automation_variable_bool`
  - `azurerm_traffic_manager_endpoint` → 4 endpoint types
  - `azurerm_sentinel_data_connector` → 2 specific data connector types
  - `azurerm_stream_analytics_function` → kept as specific subtypes exist
  - `azurerm_stream_analytics_output` → kept as specific subtypes exist
  - `azurerm_data_factory_*` → kept as specific subtypes exist
- **26 completely removed from provider** — dead enum values that can
  never match real HCL. Removed: `azurerm_mariadb_*` (Azure retired MariaDB),
  `azurerm_mysql_server` (deprecated single-server, replaced by
  `azurerm_mysql_flexible_server`), `azurerm_monitor_log_profile` (API
  changed), `azurerm_key_vault_managed_hsm` + roles (removed from
  provider), `azurerm_hdinsight_ml_services/rserver/storm` (unmaintained
  HDInsight variants), and others.

Net: Azure enum 318 → 302 members, 100% verified against Go source.

**Preset fix:** `cis-azure.ts` `MysqlServer` → `MysqlFlexibleServer`
(the deprecated `azurerm_mysql_server` was removed from the provider;
`azurerm_mysql_flexible_server` is the current resource).

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. If a spec
referenced `AzureResource.MysqlServer`, it would have been a compile error
(the enum member was removed). The preset packs have been updated to
reference `MysqlFlexibleServer` instead. Users who had custom rules on
`azurerm_mysql_server` should update to `azurerm_mysql_flexible_server`.

## 1.5.1

### Added — batch 2 rules for expanded vocabulary (ROADMAP #6)

4 new preset rules governing previously-ungoverned resource types:

**`coreSecurity` (2 new rules):**

- **DynamoDB encryption at rest** — `aws_dynamodb_table` must have
  `server_side_encryption { enabled = true }` (block). Uses existing
  `AwsAttribute.ServerSideEncryptionEnabled`.
- **DynamoDB point-in-time recovery** — `aws_dynamodb_table` must have
  `point_in_time_recovery { enabled = true }` (warn). Uses existing
  `AwsAttribute.PointInTimeRecoveryEnabled`.

**`cisAws` (2 new rules):**

- **S3 access logging** — `aws_s3_bucket` must have an associated
  `aws_s3_bucket_logging` resource (warn). Uses `mustHaveAssociated`
  via the `bucket` attribute.
- **ALB access logging** — `aws_lb` must have `access_logs.enabled = true`
  (warn). Uses existing `AwsAttribute.AccessLogsEnabled`.

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The new
rules are additive to the preset packs. Users composing
`[...coreSecurity, ...cisAws]` will see new `warn`-effect findings on S3
buckets without logging, ALBs without access logs, and DynamoDB tables
without encryption/PITR. Review the new findings — they were silent passes
before.

## 1.5.0

### Fixed — dogfood-driven improvements from real-world Terraform modules

Ran dotzen v1.4.3 against three popular HashiCorp/community Terraform
modules (terraform-aws-vpc, Azure/terraform-azurerm-aks,
terraform-google-kubernetes-engine). Findings drove four fixes:

**False positives eliminated — config-flag variables (breaking for
`denyInsensitiveVariable`):**

Variables whose name contains a secret-like word (PASSWORD, SECRET, KEY,
TOKEN) but ends with a config-flag suffix (`_enabled`, `_disabled`,
`_interval`, `_timeout`, `_count`, `_mode`, `_provider`, `_addon`,
`_via_dns`, `_max_length`, `_min_length`) are now skipped by
`denyInsensitiveVariable`. These are feature flags, not secrets — e.g.
`secret_rotation_enabled`, `enable_secret_manager_addon`,
`dns_enable_k8s_tokens_via_dns`. This eliminates 6 false-positive
violations across the Azure AKS and GCP GKE modules.

`denyPlaintextLocalSecret` is NOT affected — a local named
`secret_rotation_enabled = "my-password"` is still suspicious.

**`UTILITY_TYPES` expanded — `null_resource`, `time_sleep`, `tls_*`:**

Added `null_resource`, `time_sleep`, `tls_private_key`,
`tls_self_signed_cert`, `tls_locally_signed_cert` to `UTILITY_TYPES`.
These are Terraform utility/provider resources with no security surface.
Previously surfaced as ungoverned noise (7 entries on the Azure AKS
module alone). Now silently skipped.

**Data source vocabulary expanded:**

Added 18 new `DataResource` enum members for commonly-used data sources
that previously surfaced as ungoverned:

- AWS: `aws_caller_identity`, `aws_partition`, `aws_region`,
  `aws_availability_zones`, `aws_iam_policy_document`, `aws_eks_cluster`,
  `aws_ssm_parameter`, `aws_sns_topic`, `aws_subnet`, `aws_vpc`,
  `aws_security_group`.
- Azure: `azurerm_client_config`, `azurerm_resource_group`,
  `azurerm_virtual_network`, `azurerm_subnet`,
  `azurerm_log_analytics_workspace`, `azurerm_user_assigned_identity`.
- GCP: `google_compute_zones`, `google_container_engine_versions`,
  `google_compute_subnetwork`, `google_client_config`,
  `google_client_openid_userinfo`.

**Azure vocabulary — `azapi_update_resource`:**

Added `azapi_update_resource` to `AzureResource`. This is a real Azure
provider resource used by AKS modules for imperative post-create API
updates (node pool version, DNS config, proxy config). Previously
surfaced as ungoverned (5 instances on the Azure AKS module).

### Dogfood results (before → after)

| Module    | Violations | CNE         | Ungoverned  |
| --------- | ---------- | ----------- | ----------- |
| AWS VPC   | 0 → 0      | 2 → 2       | 13 → 8      |
| Azure AKS | 5 → 2      | 1 → 1       | 25 → 2      |
| GCP GKE   | 4 → 2      | 14 → 14     | 8 → 4       |
| **Total** | **9 → 4**  | **17 → 17** | **46 → 14** |

- 5 false-positive violations eliminated (config-flag variables).
- 32 ungoverned entries eliminated (utility types + data sources + azapi).
- Remaining CNE: 2 AWS (data-source-based IAM policies — legitimately
  unresolvable), 1 Azure (compound ternary), 14 GCP (interpolated IAM
  members + complex firewall expressions — future improvement).
- Remaining ungoverned: 8 AWS (VPC-specific types like
  `aws_vpc_dhcp_options`, `aws_vpn_gateway_route_propagation`), 2 Azure
  (`azurerm_monitor_data_collection_rule`), 4 GCP (`kubernetes_config_map`
  — Kubernetes provider, not cloud provider).

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The
config-flag suffix skip in `denyInsensitiveVariable` may cause
previously-flagged violations on variables like `secret_rotation_enabled`
to disappear. These were false positives — review to confirm the variable
is indeed a config flag, not a secret value.

## 1.4.3

### Fixed — CHANGELOG formatting

Prettier compliance fix for `CHANGELOG.md` (missing blank line after
list-intro paragraph in the 1.4.2 entry). No code changes.

## 1.4.2

### Fixed — ref-branch ternary resolution (ROADMAP next-steps #2)

The conservative ternary evaluator now resolves sole-ref branches through
scope. Previously, a ternary like `${local.is_prod ? 30 : var.retention}`
where the false branch is a reference (not a scalar literal) degraded to
`couldNotEvaluate` — even when `var.retention` had a default value.

The chosen branch is now resolved via `resolveValue`, which handles:

- Sole `var.*` / `local.*` refs → follows through scope chains
- Nested ternaries → evaluates them
- Comparison locals → resolves via `tryEvalComparison`

Compound branch expressions (`var.x * 2`, `coalesce(...)`, function calls)
stay unresolved — conservative, never a guess.

This eliminates the #1 `couldNotEvaluate` source across all 3 cloud
fixtures. The realistic-rds and realistic-aws fixtures now report
`couldNotEvaluate: 0` (was 1 each).

5 new unit tests pin the behavior: ref branch with default, ref branch
true-path, local chain (var→local→literal), no-default (still unresolved),
compound expression (still unresolved).

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. Configs
that previously produced `couldNotEvaluate` on ternary-with-ref-branch
patterns will now produce **definite verdicts** (passes or violations)
where the ref resolves to a literal. Review newly-surfaced violations —
they reflect values that were always there but previously unresolvable.

## 1.4.1

### Added — first batch of rules for the expanded vocabulary (ROADMAP #1)

7 new preset rules governing previously-ungoverned resource types:

**`coreSecurity` (4 new rules):**

- **CloudWatch log retention** — `aws_cloudwatch_log_group` must set
  `retention_in_days` (warn). AI-generated configs often omit retention,
  leaving logs to accumulate forever.
- **SQS queue KMS encryption** — `aws_sqs_queue` must set
  `kms_master_key_id` (warn). Queue messages should be encrypted at rest.
- **SNS topic KMS encryption** — `aws_sns_topic` must set
  `kms_master_key_id` (warn). Topic messages should be encrypted at rest.
- **EFS encryption** — `aws_efs_file_system` must have `encrypted = true`
  (block). Aligns with the existing EBS/EC2 encryption controls.

**`cisAws` (1 new rule):**

- **EKS node group no direct SSH** — `aws_eks_node_group` must not have a
  `remote_access {}` block (block). SSM Session Manager provides audited
  access without opening SSH to nodes.

**`cisGcp` (1 new rule):**

- **GKE Workload Identity** — `google_container_cluster` must have a
  `workload_identity_config {}` block (block). Pods authenticate as
  their own identity, not the node service account.

### Added — vocabulary

- `AwsAttribute.RetentionInDays` (`retention_in_days`)
- `AwsAttribute.KmsMasterKeyId` (`kms_master_key_id`)
- `Block.RemoteAccess` (`remote_access` — EKS node group SSH block)
- `Block.WorkloadIdentityConfig` (`workload_identity_config` — GKE)

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The new
rules are additive to the preset packs. Users composing
`[...coreSecurity, ...cisAws]` will see new `warn`-effect findings on
CloudWatch/SQS/SNS resources without retention/encryption, and `block`
findings on EKS node groups with SSH or GKE clusters without Workload
Identity. Review the new findings — they were silent passes before.

## 1.4.0

### Added — conservative ternary: bare-ref boolean conditions (ROADMAP #3)

The conservative ternary evaluator now resolves the common AI-generated
pattern `local.is_prod = var.env == "prd"` followed by
`${local.is_prod ? true : false}`. Previously, a bare-ref ternary
condition (no inline `==`/`!=`) degraded to `could-not-evaluate` even
when the local stored a comparison result.

- New `tryEvalComparison()` helper evaluates `${ref (==|!=) scalar}`
  (no ternary) — used when a local's scope entry IS a comparison
  interpolation.
- `tryEvalTernary()` extended: when the inline-compare regex fails, a
  bare-ref condition `^(var|local)\.\w+$` is tried. The ref resolves
  via three fallbacks: (a) scope entry is a comparison interpolation →
  `tryEvalComparison`; (b) scope entry is a boolean literal → use
  truthiness; (c) `resolveRaw` → boolean literal. Non-boolean literals
  (strings/numbers) stay unresolved — Terraform forbids them as
  conditions, so dotzen refuses to guess.
- 5 new unit tests + 3 integration tests pin the behavior.

### Added — `UTILITY_TYPES` silently-skipped set (ROADMAP #4)

Terraform built-in utility resources (`random_password`, `random_string`,
`random_id`, `random_uuid`, `random_shuffle`, `random_pet`,
`random_integer`, `random_bytes`, `terraform_data`) are now silently
skipped in `collectUngoverned` — neither governed nor surfaced as a
coverage gap. These resources have no security surface; reporting them
as ungoverned was noise. 3 unit tests prove: real gaps still surface,
utilities don't, `data.random_*` also skipped.

### Added — vocabulary expansion + aws.ts split (ROADMAP #1/#2)

- **AWS enums extracted to `src/vocabulary/aws.ts`** — mirrors the
  existing `azure.ts`/`gcp.ts`/`data.ts` pattern. `index.ts` halved
  from 325 → 166 lines. Barrel re-exports preserve the public API.
- **`AwsResource` grew from 57 → 484 members** (verified 100% against
  the HashiCorp AWS provider docs — 1678 resources). Covers VPC/network,
  IAM, storage, compute, monitoring, Route53/ACM, EKS/ECS, RDS variants,
  EFS/FSx, KMS/Secrets/SSM, CloudTrail/Config, SQS/SNS/Kinesis,
  EventBridge, ALB/NLB, Lambda, Elastic Beanstalk/AppRunner/Lightsail,
  Glue/Athena/EMR/Step Functions, CloudFront/WAF/Shield/GAX, DynamoDB/
  ElastiCache/MQ/MSK, VPC Lattice/Verified Access/Network Firewall,
  SES/Pinpoint/Connect, Backup/DR, RAM/Macie/GuardDuty/Detective/
  SecurityHub/Inspector, Organizations/SSO/Transfer, AppConfig/Amplify.
- **`AzureResource` grew from 19 → 318 members** (266 verified against
  Azure provider docs, 52 deprecated-but-real kept intentionally).
  Covers networking, compute, storage, databases, containers, IAM,
  key vault, security, backup/recovery, event-grid/service-bus/event-hub,
  API management, app service, resource groups/policy.
- **`GcpResource` grew from 7 → 201 members** (verified 100% against
  GCP provider docs — 1465 resources with IAM expansion). Covers compute,
  networking, storage, IAM, SQL, GKE, KMS, cloud-run, pub-sub/eventarc/
  tasks, bigquery/dataflow/dataproc/composer, spanner/firestore/
  memorystore, cloudbuild/clouddeploy, secret-manager, network-security,
  VPC-SC, apigateway/apigee, logging/monitoring, vertex-AI, binary-
  authorization/artifact-registry.
- **Total recognized types: 1003** (was 83). Ungoverned noise on real
  module repos drops from ~50% to <5%. All enum values verified against
  actual provider documentation.

### Fixed — `findTfFiles` recursive scan causing duplicate violations

`findTfFiles` in `parse.ts` was using `fs.readdirSync(dir, { recursive:
true })` — the recursive scan discovered `.tf` files in `modules/`
subdirectories directly AND `followModules` re-normalized them via
`module {}` calls, producing duplicate violations on governed resources
inside local modules. Fixed: non-recursive scan (top-level `.tf` files
only), matching Terraform's own root-module loading behavior.

### Added — realistic AI-style integration test fixtures (ROADMAP #5/#6)

Four comprehensive AI-generated Terraform fixtures wired as permanent
integration tests in `check.test.ts`:

- **`realistic-rds/`** — RDS + SG + KMS + IAM + CloudWatch + SSM +
  `random_password`, with `local.is_production = var.environment == "prd"`
  ternary pattern, `merge()` tags, and a ref-branch ternary
  `couldNotEvaluate` case.
- **`realistic-aws/`** — VPC + subnet + IGW + SG + RDS + KMS + IAM +
  S3 + CloudWatch + Lambda + `random_password` + local module call +
  `aws_prometheus_workspace` (deliberately ungoverned).
- **`realistic-azure/`** — Resource group + VNet + NSG + storage +
  MSSQL + Key Vault + AKS + web app + Log Analytics + IAM + local
  module + `azurerm_iot_security_solution` (deliberately ungoverned).
- **`realistic-gcp/`** — VPC + subnetwork + firewall + GCS + Cloud SQL +
  GKE + KMS + service account + Cloud Run + Pub/Sub + `random_id` +
  local module + `google_workflows_workflow` (deliberately ungoverned).

Each fixture exercises: ternary evaluation, `UTILITY_TYPES` silent skip,
module-following, tag/label resolution, ungoverned surface, and
`couldNotEvaluate` honest degrade. Pinned assertions per cloud.

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The
ternary extension may cause **previously-`couldNotEvaluate` findings to
become definite verdicts** where `local.is_prod = var.env == "prd"`
patterns now resolve (intended — they were false negatives before). The
vocabulary expansion causes previously-ungoverned resources to be
recognized (not surfaced as coverage gaps) — no new violations unless
a rule targets them. The `findTfFiles` fix eliminates duplicate
violations on resources inside local `modules/` subdirectories.

To adopt:

- Upgrade `version` in `dotzen.json` to `"1.4.0"`.
- Pin CI to `npx @dotzen/dotzen@1.4.0 check`.

## 1.3.0

### Added — stable author-chosen rule IDs

Rules can now have a stable, human-readable ID for use in ignore directives
and JSON output — safe across reorders, unlike the auto-generated positional
`rule-N`:

```ts
rule()
  .id('no-public-ssh')
  .resource(AwsResource.SecurityGroup)
  .denyIngress(Port.SSH)
  .message('SSH must not be open')
```

Then in Terraform:

```hcl
# dotzen:ignore no-public-ssh: bastion host — SSH is intentional
resource "aws_security_group" "bastion" { ... }
```

- `.id()` is **optional** — if not set, dotzen auto-generates `rule-N` (backward compatible).
- Must match `[a-z][a-z0-9-]*` and be unique within the spec (validated at load time).
- The ignore directive regex now accepts any stable ID, not just `rule-\d+`.
- **Why:** positional `rule-N` IDs are fragile — reordering rules shifts IDs,
  silently suppressing the wrong rule. A stable ID makes per-rule ignores safe.

## 1.2.0

### Added — ungoverned-resource telemetry

Resources whose type is not in dotzen's closed vocabulary (`KNOWN_TYPES`)
were previously silently skipped. They are now collected and surfaced as a
**`NOT GOVERNED (vocabulary gap)`** section in terminal output, and as an
`ungoverned` array in JSON output. Each entry shows `{type, name, file, line}`.

A silent skip is worse than an honest gap — users now see exactly which
resources dotzen can and cannot govern. The `CheckReport` interface gains
a `ungoverned` field (additive — existing JSON consumers that ignore
unknown fields are unaffected; the frozen-schema test now includes it).

### Added — per-rule ignore directives

`# dotzen:ignore` now supports an optional ruleId to suppress ONLY that
rule on the block, while keeping other rules' findings:

```hcl
# dotzen:ignore rule-5: bastion host — SSH is intentionally public
resource "aws_security_group" "bastion" {
  ingress { ... }
}
```

- `# dotzen:ignore rule-5: <reason>` — suppresses only `rule-5` on this block.
- `# dotzen:ignore: <reason>` — suppresses ALL rules on this block (unchanged).
- `# dotzen:ignore` — suppresses ALL rules, no reason (unchanged).

The `IgnoreDirective` interface gains an optional `ruleId` field. The
filter in `check.ts` checks all-block ignores first (fast `Set` lookup),
then per-rule ignores by `(file, line, ruleId)` match.

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The new
`ungoverned` field in `CheckReport` is additive. The per-rule ignore syntax
is a superset of the existing syntax (no ruleId = suppress all, as before).

To see ungoverned resources:

```bash
npx @dotzen/dotzen@1.2.0 check
# The output now includes a "NOT GOVERNED (vocabulary gap)" section if any
# resources have types not in dotzen's vocabulary.
```

To suppress a single rule on a block:

```hcl
# dotzen:ignore rule-3: known exception — this bucket hosts a public CDN
resource "aws_s3_bucket" "cdn" { ... }
```

## 1.1.0

### Changed — CIS presets are now composable additions to coreSecurity

**Breaking for CIS preset users.** The three CIS packs (`cisAws`,
`cisAzure`, `cisGcp`) previously contained standalone rules that
duplicated `coreSecurity` (network, encryption, IAM, secrets, tags,
provisioners). Composing `[...cisAws, ...pciDss]` produced **duplicate
violations** — the same resource flagged twice under different ruleIds.

All 8 preset packs now compose on top of `coreSecurity`:

```ts
// Before (v1.0.x) — standalone, duplicating coreSecurity:
import { cisAws } from '@dotzen/dotzen'
export const spec = [...cisAws]

// After (v1.1.0) — composable, no duplicates:
import { coreSecurity, cisAws } from '@dotzen/dotzen'
export const spec = [...coreSecurity, ...cisAws]

// Mix CIS + framework packs without duplicate violations:
import { coreSecurity, cisAws, pciDss } from '@dotzen/dotzen'
export const spec = [...coreSecurity, ...cisAws, ...pciDss]
```

Rule count changes:

- `cisAws`: 23 → 6 (stripped 17 shared with coreSecurity)
- `cisAzure`: 17 → 15 (stripped 2 shared: secrets/provisioners)
- `cisGcp`: 21 → 18 (stripped 3 shared: secrets/provisioners)

New test: `no duplicate messages between coreSecurity and CIS packs` —
guards against regression.

### Migration

If you used a CIS pack standalone in v1.0.x:

```ts
// v1.0.x:
export const spec = [...cisAws]

// v1.1.0 — add coreSecurity to keep the same coverage:
import { coreSecurity, cisAws } from '@dotzen/dotzen'
export const spec = [...coreSecurity, ...cisAws]
```

If you used a framework pack (`pciDss`, `soc2`, etc.) with `coreSecurity`,
no change needed — those were already composable.

## 1.0.1

### Added — composable framework presets + GDPR/LGPD data residency

- **Composable framework preset packs** — five new `Rule[]` exports alongside
  the per-cloud CIS starters, designed to be spread as `coreSecurity` + a
  framework layer:
  - `coreSecurity` (18 rules) — the 80% shared across all frameworks.
  - `pciDss` (14 rules) — PCI DSS v4.0: encrypt ALL stores, S3 block flags,
    backup ≥30d, encrypted state, no drift hiding, DynamoDB PITR.
  - `soc2` (8 rules) — SOC 2 TSC: change mgmt, encrypted state, ECR scan,
    CloudTrail log validation.
  - `nist80053` (15 rules) — NIST 800-53: IAM password policy, additional
    encryption, no drift hiding, version pinning, state encryption.
  - `dataProtection` (12 rules) — GDPR/LGPD: encrypt ALL stores, S3 block,
    RDS not-public, data-class tagging, encrypted state, no drift hiding.
- **`denyNonApprovedRegion(...regions)` condition** — flags a resource whose
  provider region is not in the approved list. Closes the GDPR/LGPD
  data-residency gap. `providerRegions()` extracts `region` from `provider {}`
  blocks; `NormalizedResource.providerRegion` resolves per-alias (incl. module
  `providers` map remapping). Unknown region → could-not-evaluate (never a
  false pass). The `dataProtection` preset includes commented-out examples
  for both GDPR (EU) and LGPD (Brazil).
- **`.region(...approved)` scoping** on `RuleBuilder` — fail-open filter
  (mirror `.environment` / `.providerAlias`).

### Changed — dependency security

- **Upgraded eslint 9 → 10.** `brace-expansion` DoS
  (GHSA-mh99-v99m-4gvg) had no patched 1.x version; the fix required
  `minimatch@10+` → `eslint@10`. `eslint-plugin-security` is incompatible
  with eslint 10 and only produced pre-existing warnings — dropped it.
  `semgrep` + `gitleaks` (the real security gates) remain in CI.
- **npm audit: 0 vulnerabilities.**

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The new
presets + `denyNonApprovedRegion` are additive. To adopt:

```ts
import { coreSecurity, pciDss } from '@dotzen/dotzen'
export const spec = [...coreSecurity, ...pciDss]
```

## 1.0.0

The first stable release. The engine is feature-complete for static Terraform
governance across AWS, Azure, and GCP, with 492 unit + 34 integration tests.
The JSON output schema is frozen (`schemaVersion: 1`); inline ignore
directives suppress known-acceptable findings; curated CIS preset packs drop
into any spec; and CI integration templates ship for GitHub Actions + GitLab CI.

### Added — new rule conditions (20+)

**Resource-surface conditions:**

- `denyProvisioner(...names)` — flags `provisioner "local-exec"` /
  `"remote-exec"` / `"file"` (arbitrary command execution on apply/destroy).
  `Provisioner` enum added (`LocalExec`, `RemoteExec`, `File`).
- `denyIgnoreChanges(...attrs)` — flags `lifecycle { ignore_changes = [...] }`
  hiding drift on security-critical attributes. `LifecycleAttribute` enum
  added (`PreventDestroy`, `CreateBeforeDestroy`, `IgnoreChanges`).
- `denyPlaintextConnectionSecret()` — flags a `connection {}` block with a
  plaintext secret (`private_key` / `password` / `token`). Reuses the
  engine's secret-name pattern.
- `providerAlias(X)` scoping — a rule can target resources pinned to a
  provider alias (`provider = aws.dr` → `.providerAlias('dr')`). Extracted
  on the resource AND threaded through module `providers = { aws = aws.dr }`
  maps (#13, closes #9 across module boundaries).

**Output-surface conditions:**

- `denyInsensitiveSecretOutput(...secretAttrs)` — flags an `output` whose
  `value` references a secret-bearing attribute (e.g.
  `aws_db_instance.master_password`) without `sensitive = true`. Supports
  multi-segment data-source attrs (`data.aws_ssm_parameter.value`).

**Binding-surface conditions (variables + locals):**

- `denyInsensitiveVariable()` — flags a secret-looking `variable` (name
  matches PASSWORD/SECRET/KEY/TOKEN/CREDENTIAL) without `sensitive = true`.
- `denyPlaintextLocalSecret()` — flags a `locals` entry with a secret-shaped
  name and a plaintext literal value.

**Settings-surface conditions (terraform block):**

- `requireExactTerraformVersion()` — `required_version` must be an exact pin
  (`= X.Y.Z`), not floating.
- `denyFloatingProviderVersion(...names)` — each named provider's
  `required_providers` version constraint must be pinned (`=` or `~>`).
- `requireEncryptedBackend()` — the state backend must be declared and
  encrypted (`encrypt = true`).
- `denyLocalBackend()` — forbids `backend "local"` (or absent = local
  default).

**Module-call-surface conditions:**

- `denyFloatingModuleVersion()` — a registry module's `version` must be
  pinned (`=` or `~>`); local modules (`./`/`../`) are never flagged.

### Added — parser & normalization

- **Provider `default_tags` / `default_labels` inheritance.** A provider's
  `default_tags { tags = { … } }` (AWS/Azure) or `default_labels { labels }`
  (GCP) merges into every resource's tag set. Threaded through
  `followModules` so child modules inherit the root's defaults (Terraform
  provider inheritance). Fixes a false-violation on tagless resources whose
  tags come from the provider.
- **Resource `count = 0` / `for_each`-empty skip.** A resource with
  `count = 0` or a `for_each` resolving to an empty collection is skipped
  silently (no false violation on a disabled resource). Unresolvable
  `count`/`for_each` followed once (honest).
- **Resource `for_each` per-element expansion.** A resource with a resolvable
  `for_each` is expanded into one `NormalizedResource` per element, with
  `each.key`/`each.value` threaded into a per-instance scope. Violations
  show `type.name[key]` to distinguish instances. Association logic uses
  the base address (honest — can't statically name an instance).
- **`dynamic` blocks beyond ingress/egress.** A `dynamic "settings" { … }`
  on an App Service / GCP resource is expanded into `settings.*` attributes
  (for any block name except ingress/egress/tags, which have dedicated
  extractors). `mustHaveBlock`/`denyBlockPresence` see the block.
- **Data sources as governed resources.** `data "aws_ami" "x" {}` is
  normalized as a `NormalizedResource` with type `data.aws_ami`. The full
  condition set applies (e.g. `listMustInclude` on `owners`). `DataResource`
  - `DataAttribute` enums added. A `data` block is a READ query — governance
    is over the query (filters/args), not the fetched object.
- **Conservative ternary evaluation.** `resolveValue` now evaluates the safe
  form `${<ref> (==|!=) <scalar> ? <scalar> : <scalar>}` — a strict-equality
  ternary whose ref resolves to a literal and whose branches are both scalar
  literals. Anything compound stays unresolved (could-not-evaluate, never a
  guess). Unblocks definite verdicts on `var.env == "prod" ? true : false`.
- **Meta-arg filtering.** `count`/`for_each`/`depends_on`/`provider` are
  excluded from attribute harvesting (no longer leak as pseudo-attributes).
  `lifecycle` is kept (a nested block → `lifecycle.*` attributes for rules).

### Added — product surface (1.0 blockers)

- **Inline ignore directives (`# dotzen:ignore`).** A `# dotzen:ignore` or
  `// dotzen:ignore` (optionally `: <reason>`) comment suppresses ALL findings
  on the block it precedes (or trails on the same line). Matched by
  `(physicalFile, blockLine)`. Threaded through module files (an ignore in
  a module file suppresses findings from every instantiation).
- **Frozen JSON output schema.** `renderJson` emits `schemaVersion: 1` at the
  top. The top-level fields (`schemaVersion`, `violations`, `passed`,
  `couldNotEvaluate`, `requiresApproval`) and per-entry fields are pinned by a
  schema-stability test. Additive fields are OK; a removal/rename is a bump.
- **Performance verified.** A synthetic benchmark (100 root files, 1000
  direct resources + 100 module calls = 1202 resources) completes in ~195ms.
  No parse cache needed.

### Added — curated preset packs

**Per-cloud CIS starters** (`Rule[]` exports):

- `cisAws` (23 rules) — network exposure, encryption at rest (RDS/EBS/EC2/
  Redshift/ElastiCache), KMS rotation, S3 public access, IAM least privilege,
  CloudTrail audit logging, RDS backup retention + not-public, ECR scan,
  tags, secrets hygiene, provisioners.
- `cisAzure` (17 rules) — storage TLS/public-access/network-default-deny,
  SQL TLS/SSL, Key Vault purge protection, AKS private cluster + local
  accounts, App Service HTTPS, ACR admin, RBAC Owner/Contributor, secrets
  hygiene, provisioners.
- `cisGcp` (21 rules) — storage public-access-prevention/UBLA/versioning,
  Cloud SQL SSL/IPv4/root-password, GKE private nodes + legacy ABAC, KMS
  rotation, compute secure boot + IP forwarding, IAM allUsers/primitive
  roles, Cloud Run Functions ingress + service account, firewall SSH, secrets
  hygiene, provisioners.

**Composable framework packs** — spread a shared base + a framework layer:

- `coreSecurity` (18 rules) — the 80% shared across all frameworks: network
  exposure, encryption at rest (key resources), IAM least privilege, audit
  logging, no hardcoded secrets, required tags, provisioner denial, backup
  retention.
- `pciDss` (14 rules) — PCI DSS v4.0: encrypt ALL data stores, all four S3
  public-access-block flags, backup retention ≥30 days, encrypted + non-local
  state, no drift hiding, DynamoDB PITR.
- `soc2` (8 rules) — SOC 2 TSC: change management (version pinning), encrypted
  - non-local state, ECR scan-on-push, CloudTrail log validation.
- `nist80053` (15 rules) — NIST SP 800-53: IAM password policy
  (length/complexity/reuse/age), additional encryption, no drift hiding,
  version pinning, state encryption.
- `dataProtection` (12 rules) — GDPR/LGPD: encrypt ALL data stores, S3
  public-access block, RDS not-public, data-classification tagging, encrypted
  state, no drift hiding. Data-residency is a documented gap.

Usage:

```ts
import { cisAws } from '@dotzen/dotzen'
export const spec = [...cisAws /* your custom rules */]

// Or compose a framework spec:
import { coreSecurity, pciDss } from '@dotzen/dotzen'
export const spec = [...coreSecurity, ...pciDss]
```

All CIS presets are proven end-to-end against real Terraform fixtures
(violations flagged, compliant resources pass).

### Added — CI integration templates

- **GitHub Actions** — `.github/workflows/dotzen.yml` template: checkout +
  setup-node + `npx @dotzen/dotzen@1 check` + approval-signal export.
- **GitLab CI** — a `dotzen:check` job with `artifacts:reports:dotenv` +
  an optional manual-approval gate on `DOTZEN_REQUIRES_APPROVAL`.
- `dotzen init` prints a pointer to both templates.

### Added — vocabulary

- `Provisioner { LocalExec, RemoteExec, File }`
- `LifecycleAttribute { PreventDestroy, CreateBeforeDestroy, IgnoreChanges }`
- `DataResource { AwsAmi }`, `DataAttribute { AmiOwners }`
- `AwsAttribute.AtRestEncryptionEnabled`, `TransitEncryptionEnabled`

### Migration notes

This release is **backward-compatible** — no existing `.zen/spec.ts` needs
changes. All new conditions are additive (the `evaluate` signature gains
optional params that default to empty). The new parser features (provider
default_tags, resource count=0/for_each, dynamic blocks, ternary eval) may
cause **previously-could-not-evaluate findings to become definite verdicts**
(intended — they were false negatives before). Review newly-surfaced
violations.

To adopt the new surface:

- Upgrade `version` in `dotzen.json` to `"1.0.0"`.
- Optionally import a CIS preset (`import { cisAws } from '@dotzen/dotzen'`).
- Optionally add `# dotzen:ignore: <reason>` to suppress known-acceptable findings.
- Pin CI to `npx @dotzen/dotzen@1 check`.

## 0.3.0

### Added — module-following: nested modules, `for_each`, trace labels, `count`, and DoD surfacing (doc 08)

This release completes `doc 08 — Module-following` beyond the v0.1.0
single-level local-source case. No spec DSL vocabulary changes — the
rule-authoring surface is unchanged. The engine and HCL/parse layer now
follow and evaluate more of the module-based Terraform that real orgs
write, and surface (rather than silently skip) what they cannot.

**New module-following behavior:**

- **Nested modules (module → module).** `followModules` is recursive: a
  followed module's own `module {}` calls are followed too, bounded by a
  path-stack of resolved absolute dirs. A self/mutual cycle is recorded
  as a `could-not-evaluate` skip (ruleId `dotzen.module-following`),
  not infinite recursion. Independent diamond paths (two modules calling
  the same module with different inputs) are still evaluated per-path —
  the cycle guard is a current-path test, not a global visited set.
- **Module `for_each`.** A `for_each` over a resolvable literal map or a
  var-resolved list/set is expanded per element — one module instance
  per key, with `each.value` / `each.key` threaded into the module
  scope. The trace carries a per-key suffix `(module-label[key])`. An
  unresolvable `for_each` (`toset(...)` compound, `var.x` with no
  default) is followed once honestly — refs to `each.*` inside the
  module degrade to `could-not-evaluate` rather than false expansion.
  An empty resolved collection (`toset([])`) skips silently.
- **Per-instantiation trace labels.** Each followed call's findings carry
  `(module-label)` — e.g. `env/prd › modules/rds/main.tf (db_bad)` — so
  two calls of one module are distinguishable. Nested findings name
  every hop: `env/prd › modules/outer/main.tf (db) ›
modules/inner/main.tf (inner_db)`.
- **`count = 0` honored.** A literal `0`, or a `count` that resolves to
  `0` via a sole `var`/`local` ref, disables the module — it is skipped
  silently (correct, no resources to evaluate). An unresolvable `count`
  is followed once (honest; no per-index expansion).

### Changed — non-followed modules now surface (doc 08 DoD), never a silent `0 checks`

Previously, a `module {}` call dotzen could not follow (remote/registry/git
source, a source that escapes the scanned project, or a missing module
dir) was silently skipped — an env layer of only such calls reported
`0 checks` with no explanation. These are now recorded and surfaced as
`couldNotEvaluate` under the stable ruleId `dotzen.module-following`,
with the caller file + line and the source that was not followed.

**Behavioral note for consumers (surfaces NEW findings on existing
configs):** configs that previously reported `0 checks` on a module-based
env layer, or `could-not-evaluate` on a module's `var.*`-dependent
resources, may now produce **definite verdicts** (passes or violations)
where module-following now resolves the caller-supplied values —
including nested-module and `for_each` expansions. Review the new
violations; they reflect values that were always there but previously
unresolvable. Non-followed modules surface as `couldNotEvaluate`
(ruleId `dotzen.module-following`) — filter on that ruleId to see only
the gaps dotzen could not close.

### Internal — `SOLE_REF` resolver accepts `each.value` / `each.key`

The sole-reference resolver in `src/hcl/normalize.ts` (used by
`resolveValue` / `resolveRaw`) now follows `each.value` and `each.key`
in addition to `var.*` / `local.*`, so `each.*` references inside a
module expanded by `for_each` resolve to the threaded element value.
Scopes without `each.*` set are unaffected.

## 0.2.0

### Added — serverless function coverage (AWS Lambda, Azure Functions, GCP Cloud Run Functions)

- **New resource types** (enum members):
  - `AwsResource.LambdaFunction` (`aws_lambda_function`)
  - `AzureResource.LinuxFunctionApp` / `WindowsFunctionApp` / `FunctionApp`
    (`azurerm_linux_function_app`, `azurerm_windows_function_app`,
    `azurerm_function_app`)
  - `GcpResource.Cloudfunctions2Function`
    (`google_cloudfunctions2_function`)
- **New attributes**: `AwsAttribute.TracingMode` /
  `LambdaKmsKeyArn`; `AzureAttribute.SiteConfigMinTlsVersion`;
  `GcpAttribute.IngressSettings` / `ServiceAccountEmail`.
- **New value enums**: `XrayMode` (`Active` / `PassThrough`);
  `IngressSetting` (`AllowAll` / `AllowInternalAndGclb` /
  `AllowInternalOnly`).
- **New nested-block enum**: `Block.Identity` — Azure Functions managed
  identity block (present = use AAD, not a shared/local credential).
- **Governance rules added** to the example spec (`examples/ai-generated/.zen/spec.ts`):
  - AWS Lambda: X-Ray active tracing (`mustEqual`), env-var KMS encryption
    (`mustBeSet`), plaintext env-var secrets (`denyPlaintextEnvSecrets`).
  - Azure Functions: HTTPS-only (`mustBeTrue`), TLS 1.2 floor
    (`mustEqual` on `site_config.minimum_tls_version`), public network
    access (`denyWhenTrue`), managed identity (`mustHaveBlock(Identity)`),
    plaintext `app_settings` secrets (`denyPlaintextEnvSecrets`),
    diagnostic logging (`mustHaveAssociated` on
    `azurerm_monitor_diagnostic_setting`).
  - GCP Cloud Run Functions: unrestricted ingress (`denyValue` on
    `ALLOW_ALL`), runtime service account (`mustBeSet`), plaintext env-var
    secrets (`denyPlaintextEnvSecrets`).
  - Shared ownership tags across all serverless resource types
    (`mustHaveTags`).

### Changed — engine

- **`denyPlaintextEnvSecrets` now scans serverless env-var maps**, not just
  ECS `container_definitions`. The extractor (`envVarsOf` in `normalize.ts`)
  reads `aws_lambda_function.environment.variables`, Azure Functions
  `app_settings`, and `google_cloudfunctions2_function.service_config.
environment_variables`. A whole-map reference (`= var.x`) degrades to
  could-not-evaluate; a mixed literal/reference map yields definite verdicts
  for the literal secrets (same lenient-parse behavior as ECS). The
  `EnvVarsInfo` type (`hcl/model.ts`) mirrors `ContainerInfo`.
- **GCP `labels` tag extraction.** `tagsOf` and `environmentOf` now read
  `labels` (not `tags`) for `google_*` resources, so `mustHaveTags` and
  environment-scoped rules work on GCP resources that use the provider's
  `labels` map. Previously GCP resources with `labels` but no `tags` map
  degraded to unresolved tags (a false could-not-evaluate).

### Migration notes for spec authors

This release is **backward-compatible** — no existing `.zen/spec.ts` needs
changes. The new vocabulary and the `denyPlaintextEnvSecrets` extension are
additive. To use the serverless rules, import the new enums and reference the
new resource types:

```ts
rule()
  .resource(AwsResource.LambdaFunction)
  .mustEqual(AwsAttribute.TracingMode, XrayMode.Active)
  .message('Lambda functions must enable X-Ray active tracing')

rule()
  .resource(AzureResource.LinuxFunctionApp)
  .mustHaveBlock(Block.Identity)
  .message('Azure Functions must use a managed identity')

rule()
  .resource(GcpResource.Cloudfunctions2Function)
  .denyValue(GcpAttribute.IngressSettings, IngressSetting.AllowAll)
  .message('Cloud Run Functions must not allow unrestricted ingress')
```

The `denyPlaintextEnvSecrets` extension may surface **previously-hidden
plaintext secrets** in Lambda / Azure Functions / Cloud Run Functions env-var
maps — these were silent could-not-evaluate findings before. Review any
newly-surfaced findings against your actual configs.

The GCP `labels` fix may cause **previously-could-not-evaluate `mustHaveTags`
findings to become definite violations** on GCP resources that use `labels`
instead of `tags`. This is intended (it was a false negative before).

## 0.1.3

### Added — new rule conditions

- **`denyPlaintextEnvSecrets`** — flags ECS task-definition environment
  variables with secret-like names (`PASSWORD`, `SECRET`, `KEY`, `TOKEN`,
  `CREDENTIAL`) whose value is a plaintext literal, not a reference. Catches
  the common AI-generated anti-pattern of hardcoding secrets in ECS env vars
  instead of using Secrets Manager / SSM Parameter Store references.
- **`requireSslOnlyPolicy`** — requires a `Deny` with
  `Condition Bool aws:SecureTransport=false` in the resource's policy.
  Implements CIS AWS S3 SSL-only bucket-policy control. Passes when no
  policy exists (no false positive on buckets without a policy).
- **`denyPublicPrincipal`** — flags `Principal: "*"` in an Allow statement
  (public access; CIS AWS). A `Deny` with `Principal: "*"` is fine.
- **AWS Config recorder settings** (CIS AWS §3.1 / §3.2) —
  `mustBeOneOf` on `aws_config_configuration_recorder.recording_mode.mode`
  and `mustHaveAssociated` on `aws_config_configuration_recorder` requiring
  a matching `aws_config_configuration_recorder_status` resource.

### Changed — engine

- **Lenient-mode `jsonencode(...)` parsing.** `parseHclString` and
  `parseHclValue` now accept a `lenient` parameter that keeps interpolated
  strings (`${var.x}`) as-is instead of returning `UNRESOLVED`. This lets
  `containersOf` partially evaluate mixed literal/reference ECS
  `container_definitions` — a config with both plaintext secrets and
  referenced secrets now yields definite verdicts for the plaintext ones,
  instead of degrading the whole document to could-not-evaluate.
- **`evalDenyPrivilegedContainers` improved.** A definite
  `privileged = true` violation is now flagged even in a mixed
  `container_definitions` config (previously, any interpolation suppressed
  the violation). An interpolated `privileged = "${var.x}"` is tracked via
  `privilegedUnresolved` and degrades to could-not-evaluate for that
  container, as before.
- **`denyIamWildcard` / `denyPublicPrincipal` / `requireSslOnlyPolicy`**
  now parse IAM / S3 bucket policies written as
  `jsonencode(...)` (not just literal-JSON heredocs). `Condition` blocks
  are parsed too. `jsonencode(var.x)` / variable policies still degrade to
  could-not-evaluate (no false violation).

### Migration notes for spec authors

This release is **backward-compatible** — no existing `.zen/spec.ts` needs
changes. The new conditions are additive. To use them:

```ts
rule().resource(AwsResource.EcsTaskDefinition).denyPlaintextEnvSecrets()
rule().resource(AwsResource.S3Bucket).requireSslOnlyPolicy()
rule().resource(AwsResource.S3BucketPolicy).denyPublicPrincipal()
```

The lenient-parser change may cause **previously-could-not-evaluate
findings to become definite violations** on configs that mix literal and
referenced ECS env vars. This is intended (it was a false negative before)
— review any newly-surfaced `denyPrivilegedContainers` or
`denyPlaintextEnvSecrets` findings against your actual configs.
