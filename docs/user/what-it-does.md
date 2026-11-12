# What pluvian does — and doesn't

> **Audience:** everyone new to pluvian — security reviewers, spec authors, platform engineers. A 5-minute orientation before you read the [tutorial](./tutorial.md) or the [rule reference](./reference/rules/all-rules.md).

## What pluvian is

**pluvian is governance-as-code for Terraform.** It statically analyzes your `.tf` files (HCL) against a readable, strongly-typed rule spec written in TypeScript (`.pluvian/spec.ts`) and reports security, tagging, and compliance violations — **before** `terraform plan` or `apply`. It is designed for the world where AI code-generation tools produce Terraform that compiles but quietly violates your organization's policies.

```bash
npx @erkos/pluvian@2 check
```

Three design commitments shape everything below:

1. **Static-only.** No `terraform plan`, no cloud credentials, no state file. Pure HCL analysis — fast (≈195ms for 1200 resources), runs anywhere Node runs, safe in CI and pre-commit.
2. **Zero-install.** `npx @erkos/pluvian check` pulls a pinned version and runs. No local install, no native binary, no macOS Gatekeeper / Windows SmartScreen prompts. The HCL parser is the official HashiCorp HCL compiled to WASM (`@cdktf/hcl2json`).
3. **Honest, not loud.** When pluvian can't statically resolve a value (a `var` with no default, a computed expression), it reports **"could not evaluate"** — never a guess. A false positive is worse than an honest gap.

## What pluvian does

- **Catches violations across AWS, Azure, and GCP** — network exposure (open SSH/RDP/DB ports), encryption at rest, IAM least-privilege, audit logging, hardcoded secrets, required tags, public access, plaintext protocols, and more. See the [rule catalog](./reference/rules/all-rules.md): **144 rules across 8 composable presets**.
- **Topology-aware rules** — a dependency-graph layer walks multi-hop reference chains that per-resource tools can't express: "no DB in a public subnet" (`denyIfReachable` traverses `db → subnet → route table → internet gateway`), "no security group shared between a public LB and a private DB" (`denyIfSharedWith`), and KMS-key provenance (`denyIfReachableAttr`).
- **Three output formats** — human-readable terminal, machine-readable JSON, and **SARIF 2.1.0** (the OASIS standard for security findings — ingests into GitHub Code Scanning, GitLab security artifacts, Azure DevOps, VS Code).
- **Curated presets** — a `coreSecurity` baseline plus per-cloud CIS packs (AWS/Azure/GCP) and framework packs (PCI DSS, SOC 2, NIST 800-53, data-protection). Spread them into your spec: `export const spec = [...coreSecurity, ...cisAws, /* your rules */]`.
- **A readable rule DSL** — rules are written in TypeScript meant to be reviewable by a security architect who isn't a developer:

  ```ts
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message("SSH and RDP must not be open to the internet")
    .rationale("CIS AWS Foundations Benchmark, control 5.2");
  ```

  Editor autocomplete + a compile-time check catch typos in resource types, attributes, and ports.

- **Three severities** — `block` (fails the build, exit 1), `warn` (visible but non-blocking), `require_approval` (pauses CI for a manual sign-off gate).
- **Inline ignore directives** — suppress a finding on a specific block with a documented reason: `# pluvian:ignore: bastion host — SSH is intentional behind a CIDR allowlist`. Auditable, not silent.
- **Module-aware** — follows local `module {}` calls (threads caller inputs into the module's `var.*`), so a module's findings reflect how it's actually instantiated, not its defaults.
- **Ungoverned-coverage telemetry** — resource types pluvian recognizes but that have no rule surface as `ungoverned`, so you can see your coverage gaps rather than assume "no finding = compliant".

## What pluvian does **not** do

Honest boundaries — knowing these prevents misuse reports and sets the right expectations.

- **No `terraform plan`.** pluvian never runs Terraform, never touches your cloud, never reads state. Everything is derived from HCL. Anything that requires runtime values (a data source lookup, a `terraform plan` output, a conditional that depends on cloud state) is reported as **could-not-evaluate**, not guessed.
- **Not a general secret scanner.** For "find any secret anywhere in the repo," use **gitleaks** (or truffleHog). pluvian does _structural_ hardcoded-secret detection as defense-in-depth — e.g. a `master_password` attribute set to a literal string on an `aws_db_instance` — but it complements, not replaces, a dedicated secret scanner. See `docs/specs/01-product-overview.md`.
- **Cannot resolve dynamic values.** A `var.x` with no default and no module-caller input, a Terraform built-in function pluvian doesn't model, a compound expression — these degrade to could-not-evaluate. This is the honest outcome; pluvian refuses to guess. (The set of modeled expressions grows over time — e.g. `toset`/`concat`/`flatten`/`merge` are statically evaluated as of v1.9.19.)
- **Does not govern every resource type.** pluvian recognizes ~3200 resource/data types across the three clouds but only **~60-70 carry rules** today. The rest are _recognized_ (so they don't inflate false "unknown type" noise) but surface as `ungoverned` so you see the coverage gap. Add custom rules for the types your org cares about.
- **Graph rules are module-scoped.** The dependency graph doesn't yet traverse `module.x.y` output references across module boundaries (a future iteration — see `docs/specs/10-graph-layer.md`). An unresolvable link in a chain (e.g. `subnet_id = var.x` with no default) degrades to could-not-evaluate — never a false pass.
- **Follows local modules only.** Registry/git/HTTP module sources can't be inspected locally, so their internals surface as could-not-evaluate under the stable rule id `pluvian.module-following` (never a silent `0 checks`). Pin and vendor a module, or govern it at its own repo.
- **Not a policy enforcement engine.** pluvian reports findings and sets exit codes; it does not block `terraform apply` itself. Wire it as a CI gate / pre-commit hook / approval step — the [CI templates](../README.md#ci-integration) show how.
- **Not an HCL linter.** It does not check formatting, naming conventions, or style. Use `terraform fmt` / `tflint` for that. pluvian is about _policy_, not _style_.

## Where pluvian fits

The CI/CD governance stack, and where pluvian lives in it:

| Layer                         | Tool                            | What it catches                                                                      |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| **Style / formatting**        | `terraform fmt`, `tflint`       | Style, deprecated syntax, provider quirks                                            |
| **Static policy (this tool)** | **pluvian**                      | Security/compliance/tagging violations in HCL — _resource-aware, organization-aware_ |
| **Plan-time policy**          | OPA / Sentinel / HashiCP policy | Policy over `terraform plan` output (runtime values)                                 |
| **Secret scanning**           | gitleaks, truffleHog            | Hardcoded secrets anywhere in the repo                                               |
| **SAST / supply chain**       | semgrep, CodeQL, Dependabot     | Code vulns, dependency CVEs                                                          |

pluvian sits between style-checks and plan-time policy: **structural, cloud-aware governance of the HCL itself**, credential-free, in CI/pre-commit. It's complementary to OPA/Sentinel (which need a plan) and to gitleaks (which scans everything, not just structured secrets on resources).

### What makes pluvian different from Checkov / TFSec / KICS

Those tools ship a fixed, opinionated rule set baked into the binary. pluvian's rules are **authorable TypeScript you control** — your security team writes (or curates) the policy, in a DSL readable enough to review in a change request. The presets (CIS / PCI / NIST) are a starting point you compose and extend, not a black box. And pluvian's could-not-evaluate discipline means it won't false-positive on a value it can't resolve — it tells you honestly.

## Coverage at a glance

- **Clouds:** AWS, Azure, GCP (single engine, per-cloud vocabulary + CIS presets).
- **Recognized types:** ~3200 across the three clouds.
- **Governed types:** ~60-70 today (the rest surface as `ungoverned`). See the [resource → rules index](./reference/rules/resource-index.md) for exactly which.
- **Rules:** 144 across 8 presets. See the [master table](./reference/rules/all-rules.md).
- **Output:** terminal, JSON, SARIF 2.1.0.
- **Platforms:** anywhere Node ≥18 runs (macOS, Linux, Windows). No native binary.

## Next

- **Try it in 5 minutes** → [tutorial](./tutorial.md).
- **Look up what a rule does** → [rule reference](./reference/rules/all-rules.md).
- **Write your own rule** → [how to add a custom rule](./how-to/add-a-custom-rule.md).
