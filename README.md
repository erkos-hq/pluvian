# pluvian

**Prose as Code.** Governance for AI-generated Terraform — AWS, Azure, and GCP.

*pluvian — the crocodile bird: the little bird that cleans the beast's teeth. An [erkos](https://erkos.dev) tool — we clean your AI's Terraform.*

```bash
npx @erkos/pluvian@2 check
```

![pluvian flagging an EFS mount target placed in a public subnet](https://raw.githubusercontent.com/erkos-hq/pluvian/main/docs/assets/demo.gif)

*One rule, evaluated per mount target: `public_mt` violates (public subnet → Internet Gateway), `private_mt` passes. Walkthrough in [`demo/`](https://github.com/erkos-hq/pluvian/tree/main/demo).*

A zero-install governance layer that catches policy violations in Terraform HCL —
especially the kind AI code-gen tools produce when they don't know your
organization's security, tagging, and compliance requirements. Rules are written
in a readable, strongly-typed TypeScript DSL (`.pluvian/spec.ts`) designed to be
reviewed by a security architect who has never written code:

```ts
rule()
  .resource(AwsResource.SecurityGroup)
  .denyIngress(Port.SSH, Port.RDP)
  .message('SSH and RDP must not be open to the internet')
  .rationale('CIS AWS Foundations Benchmark v1.4, control 5.2')
```

Every finding is **`block`** (fails the build), **`warn`**, or **`require_approval`**
(pauses CI for sign-off). When pluvian can't statically resolve a value, it reports
**`could not evaluate`** instead of guessing — for a governance tool, a false
positive is worse than an honest gap.

It runs wherever Terraform is written — pre-commit hook, CI pipeline, or **inside
the AI coding agent's own loop**: the agent runs `npx @erkos/pluvian@2 check`,
reads the findings, and fixes them before you ever see the PR. Catch violations at
the earliest, cheapest gate.

> **v2.0.0** · 144 rules across 8 presets · 42 rule conditions · ~3,200 resource
> types recognized (3 clouds) · 801 unit + 40 integration tests · published to npm
> with [SLSA provenance](https://docs.npmjs.com/generating-provenance-statements)
> · **0 false positives across 35+ real-world module repos** (3 clouds).

---

## Why pluvian

Organizations are moving from "developers call pre-approved modules" to
"developers generate Terraform with AI (Copilot, ChatGPT, agents)." Once the
developer stops routing through the module, **the module can no longer be the
governance chokepoint** — and the model doesn't know your required tags, banned
ports, data-residency rules, or encryption baseline.

The insight that makes this governable: **AI-generated Terraform is literal and
explicit** — a `0.0.0.0/0` CIDR, a `publicly_accessible = true`, a missing
`encrypted = true` appear as literal values far more often than in hand-written,
parameterized code. So **static analysis of the HCL text** catches the large
majority of real violations — _without_ `terraform plan`, credentials, or state
access. The same directness that creates the risk is what makes it detectable.

### How it's different

|                                  | OPA / Rego              | HashiCorp Sentinel    | tfsec / Checkov               | **pluvian**                                |
| -------------------------------- | ----------------------- | --------------------- | ----------------------------- | ----------------------------------------- |
| Authoring audience               | Engineers who know Rego | Same                  | Nobody — rules hardcoded/YAML | **Security architects**, via readable DSL |
| Local pre-commit check           | High-friction           | Cloud/Enterprise only | Yes                           | **Yes, zero-install `npx`**               |
| Needs credentials / state        | Usually                 | Yes                   | No                            | **No**                                    |
| Org-customizable rules           | Yes                     | Yes                   | Limited                       | **Yes**                                   |
| Topology-aware (multi-hop) rules | —                       | —                     | No                            | **Yes — graph layer**                     |
| Vendor lock-in                   | No                      | Yes                   | No                            | **No**                                    |

> **Same layer as tfsec/Checkov** (static HCL, no creds/state) — pluvian doesn't
> claim a unique layer there. The differentiator vs them is the **readable DSL**,
> the **topology graph**, and **zero-install `npx`**. The "different layer" claim
> is vs **OPA/Sentinel**, which run at the _plan/policy_ layer and need
> credentials + state (or Terraform Cloud).

pluvian's claim isn't "better rule engine." It's **the governance layer designed
for the failure mode of AI-generated infrastructure, with authoring non-engineers
can actually review, at zero adoption friction.**

### Where pluvian fits — defense in depth

pluvian **complements, not replaces**. It occupies one layer in a stack, and the
layers cover each other's blind spots:

```text
 gitleaks /         pluvian                OPA / Sentinel           cloud config /
 secret-scan   →    (static code +    →   (plan + policy,     →   CSPM / Config
 (secrets)          config)               needs auth + state)     (running cloud)
                         ↑
                         pluvian sits here — the fail-fast code layer:
                         no credentials, no state, no terraform plan
```

- **Secrets** — gitleaks/CI secret-scanning (the plaintext key in a var).
- **Code/config (pluvian)** — the `.tf` you're about to commit. No credentials,
  no state, no `terraform plan` — runs in pre-commit, CI, or an agent loop.
- **Plan/policy** — OPA/Sentinel evaluate the resolved plan (needs auth/state;
  catches what static text can't).
- **Deploy** — the running cloud (CSPM, Config).

pluvian is the **fail-fast code layer** — the cheapest place to catch the literal
mistakes AI-generated Terraform makes by default.

---

## Who this is for

Governance tools have a quirk: the person who _uses_ the tool day-to-day
and the person who _champions_ it inside an org are rarely the same
person. pluvian is built around both.

- **The developer generating Terraform via AI** won't add a blocker for
  its own sake — but will happily let their **coding agent** run
  `npx @erkos/pluvian@2 check` in its own loop, read the findings, and
  fix them before a PR ever opens. Fewer review cycles, not "I love
  policy."
- **The security architect** authors and owns the spec. Rego locks them
  out of authoring — someone else writes the policy, they approve on
  trust. `.pluvian/spec.ts` reads like prose they can review and edit
  directly in an MR diff.
- **The platform engineer** wires it into CI and pre-commit. No servers,
  no database, no credentials — one pipeline step.

In most orgs the architect champions it, the platform team mandates it,
and the developer — often already using it via the agent loop — was
never blocked in the first place.

---

## The 30-second demo

From inside any Terraform project that has a `pluvian.json` +
`.pluvian/spec.ts` (e.g. the [`demo/`](demo/) folder in this repo):

```bash
npx @erkos/pluvian@2 check
```

```
── BLOCKING ──
✗ aws_security_group.web  (terraform/main.tf:2)
    SSH and RDP must not be open to the internet
    ↳ CIS AWS Foundations Benchmark v1.4, control 5.2

✗ 1 violation(s), 14 passed, 0 could not be evaluated
```

No install step, no Gatekeeper dialog on macOS, no SmartScreen on Windows, no
cloud credentials. The `could not evaluate` count is the honest-gap signal —
values pluvian can't resolve statically (a `var`-supplied CIDR, an unresolved
`for_each`) rather than a silent pass.

---

## How it works

pluvian is a static-analysis pipeline. The parser is a pure-JS WASM dependency
(`@cdktf/hcl2json`) — **no native binary, no `terraform plan`**, which is what
keeps the local check fast and credential-free.

```text
 .tf HCL files
      │
      ▼
 hcl2json parse
      │
      ▼
 normalize    ← vars · locals · ternary · merge · modules · for_each · dynamic
      │
      ▼
 evaluate     ← 42 conditions + dependency graph
      │
      ▼
   report  ───→  terminal (ANSI)            [default]
           ───→  --format json              [CI artifact]
           ───→  --format sarif 2.1.0       [GitHub Code Scanning / GitLab]
```

Three outcomes, never collapsed: a rule **violates**, **passes**, or **could not
be evaluated**. `couldNotEvaluate` is carried inside the success track — it's not
an error and not a silent pass.

### The graph layer — topology-aware rules (differentiated)

Per-resource rules ("is this RDS encrypted?") cover most CIS controls. A class of
real controls needs **multi-hop traversal** — and no static Terraform tool does
this as authorable rules. pluvian does:

```ts
rule()
  .resource(AwsResource.EfsMountTarget)
  .denyIfReachable(AwsResource.InternetGateway)
  .message('EFS mount targets must not be in a public subnet')
```

The graph walks the reference chain bidirectionally — forward and reverse — to
decide reachability:

```text
 aws_efs_mount_target
      │  subnet_id  (forward)
      ▼
 aws_subnet
      │  who references this subnet?  (reverse hop)
      ▼
 aws_route_table_association
      │  route_table_id
      ▼
 aws_route_table
      │  gateway_id
      ▼
 aws_internet_gateway   ◀── target reached → violation
```

If that chain reaches an Internet Gateway, the mount target is in a public subnet →
**violation**, with the exact chain rendered in the finding detail. Partially-
unresolvable chains (an opaque `var`) degrade honestly to `could not evaluate`,
never a false pass. Three graph conditions ship: `denyIfReachable`,
`denyIfSharedWith` (no shared SG between a public LB and a private DB), and
`denyIfReachableAttr` (e.g. a bucket's KMS key must be customer-managed).

---

## Coverage

- **AWS** (deep): VPC/SG/NACL, RDS/Aurora/DynamoDB/ElastiCache, S3, EBS/EFS,
  KMS/SecretsManager, EKS/ECS, ALB/NLB, Lambda, CloudTrail/Config/IAM, and more.
- **Azure** (CIS L1): NSG, Storage, SQL/PostgreSQL/MySQL, Key Vault, AKS,
  App Service, Functions, VMs (+ the graph-layer VM→NIC→public-IP rule).
- **GCP** (CIS L1): Compute Firewall, GKE, Cloud SQL, KMS, Cloud Run Functions,
  BigQuery, storage.
- **8 presets**: `coreSecurity` + `cisAws` / `cisAzure` / `cisGcp` +
  `pciDss` / `soc2` / `nist80053` / `dataProtection`. Spread what you need.
- **3 output formats**: terminal (default), `--format json`, `--format sarif`.

---

## Quick start

**1. Scaffold.** `init` writes a version-pinned `pluvian.json` + a `.pluvian/spec.ts`
and auto-detects where your Terraform lives:

```bash
npx @erkos/pluvian@2 init                       # default: [...coreSecurity]
npx @erkos/pluvian@2 init --profile enterprise  # curated bundle (startup|enterprise|regulated)
npx @erkos/pluvian@2 init --presets coreSecurity,cisAws,pciDss  # à la carte (any of 8 packs)
```

`--profile` picks a curated bundle; `--presets` adds framework packs
(`coreSecurity`, `cisAws`, `cisAzure`, `cisGcp`, `pciDss`, `soc2`, `nist80053`,
`dataProtection`). They compose: `--profile enterprise --presets pciDss` = the
enterprise bundle + PCI. (Browse/copy templates in
[`examples/`](https://github.com/erkos-hq/pluvian/tree/main/examples) too.)

> **Version pinning:** the install (`@1`) floats within major 1; `pluvian.json`
> is the **enforcement** pin — the engine does an exact match and refuses to run
> on a mismatch, printing the corrective command. That's also what makes `@1`
> safe in CI: a newer `1.x` than `pluvian.json` pins → loud refusal → intentional
> bump, no silent drift. (`@latest` is never used — unbounded across majors.)

**2. Edit** `.pluvian/spec.ts` — add rules / switch presets to fit your org:

```ts
import { coreSecurity, cisAws, rule, AwsResource, Effect } from '@erkos/pluvian'

export const spec = [
  ...coreSecurity, // secure-by-default baseline
  ...cisAws, // CIS AWS Foundations additions

  rule()
    .resource(AwsResource.S3Bucket)
    .mustHaveTags('Application', 'Owner') // use an OrgTag enum in real specs
    .message('Buckets must carry ownership tags'),
]
```

**3. Check.** Run the spec against your Terraform (zero install, no credentials,
no `terraform plan`):

```bash
npx @erkos/pluvian@2 check
```

**4. Wire CI.** Add `npx @erkos/pluvian@2 check` as a GitHub Actions /
GitLab CI step, or upload SARIF via `github/codeql-action/upload-sarif@v3`.

---

## Credibility

- **0 false positives** across **35+ real-world module repos** (terraform-aws-modules,
  terraform-google-modules, Azure/, cloudposse/) on three clouds — dogfooded every
  release since v1.9.6.
- **Honest degradation**: `couldNotEvaluate` for unresolvable values, never a guess
  and never a silent pass.
- **Defense in depth**: structural, resource-aware governance that complements
  (doesn't replace) gitleaks/secret-scanning.

---

## Documentation

The engine is documented deeply in `docs/specs/`:

- [`00-architecture-decision-record`](https://github.com/erkos-hq/pluvian/blob/main/docs/specs/00-architecture-decision-record.md) —
  why Node/TypeScript + `npx` won on adoption friction (decision locked).
- [`01-product-overview`](https://github.com/erkos-hq/pluvian/blob/main/docs/specs/01-product-overview.md) — the problem,
  "Prose as Code," positioning vs OPA/Sentinel/tfsec.
- [`02-spec-dsl`](https://github.com/erkos-hq/pluvian/blob/main/docs/specs/02-spec-dsl.md) — the `.pluvian/spec.ts` language spec.
- [`03-distribution-and-cli`](https://github.com/erkos-hq/pluvian/blob/main/docs/specs/03-distribution-and-cli.md) — `npx`
  mechanics, version pinning, the WASM-parser choice.
- [`10-graph-layer`](https://github.com/erkos-hq/pluvian/blob/main/docs/specs/10-graph-layer.md) — the dependency-graph design.
- [`ROADMAP`](https://github.com/erkos-hq/pluvian/blob/main/docs/ROADMAP.md) — what's shipped and the remaining backlog.

User docs (tutorial, how-tos, auto-generated rule catalog) live in
[`docs/user/`](https://github.com/erkos-hq/pluvian/tree/main/docs/user).

---

## Status

Working, published, provenance-attested. The static-analysis engine is at
diminishing returns on coverage/precision. The levers ahead are adoption
(VS Code extension, broader dogfood data) — see [`ROADMAP`](https://github.com/erkos-hq/pluvian/blob/main/docs/ROADMAP.md).

MIT licensed. Issues and feedback: [github.com/erkos-hq/pluvian](https://github.com/erkos-hq/pluvian).
