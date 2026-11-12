# 04 — Governance Model

This document covers how pluvian's rules are actually applied across an
organization's repositories and CI pipelines: repository topology,
defense-in-depth layering, exceptions, and production-approval
workflows. This is operational/process design, distinct from the DSL
itself (`02-spec-dsl.md`) and the CLI mechanics (`03-distribution-and-cli.md`).

## Monorepo vs polyrepo — recommended: monorepo

This is the single highest-leverage recommendation in this document.

### The polyrepo problem

If every service/team owns its own `pluvian.json` and its own copy of
`.pluvian/spec.ts`:

- **Version drift is inevitable.** Team A is on pluvian `1.3.0`, Team B
  never updated from `1.1.0`, Team C's repo has no pluvian at all because
  onboarding was missed. Compliance coverage is a patchwork that nobody
  can state with confidence.
- **Rule updates require N coordinated MRs.** A new mandatory rule (e.g.
  an LGPD data-residency requirement with a compliance deadline) means
  the platform team must open, track, and chase merges of one MR per
  repository. Some repos merge immediately; some take weeks; some never
  merge without escalation.
- **Audit trail is fragmented.** "Show me every governance violation
  across all services in the last 30 days" requires querying N separate
  CI systems with potentially different log-retention policies.
- **New-service onboarding is opt-in and therefore skippable.** A new
  repository must remember to add pluvian; if it doesn't, it is silently
  ungoverned.

### The monorepo solution

```
platform-monorepo/
├── .pluvian/
│   ├── pluvian.json      ← ONE version, for every service
│   └── spec.ts           ← ONE spec, for every service
└── services/
    ├── payments-api/terraform/
    ├── identity-service/terraform/
    ├── data-processor/terraform/
    └── checkout-service/terraform/
```

- **One `pluvian.json` update = every service updated simultaneously.**
  A single MR, one review, one merge. No coordination overhead, no
  stragglers.
- **New services are governed automatically.** A new
  `services/new-service/terraform/` directory is covered by the root
  spec with zero onboarding steps — governance coverage is a property of
  the directory structure, not an opt-in action.
- **Audit trail is a single Git history + single CI pipeline history.**
  One `pluvian check --format json` artifact per pipeline run, in one
  place, queryable via one API.
- **Exceptions are visible and centrally reviewed** — see below.

### Multiple Terraform roots (per-environment / per-service)

Real repos rarely have one flat Terraform directory — they have several
**root modules** (`env/{dev,stg,prd}`, or `services/*/terraform`). Each
root is a separate module with its own variables, so `pluvian.json`'s
`terraform` accepts an **array of roots**, and the engine parses each
independently with an **isolated `var`/`local` scope** (a `var.cidr` in
`dev` and a different one in `prd` never collide). One `pluvian.json` + one
`spec.ts` still governs them all; findings are reported with root-relative
paths so you can tell which environment each came from. `pluvian init`
detects this layout and writes the array. See
`/docs/specs/03-distribution-and-cli.md` for the config shape.

**Different rules per environment** without a second spec: give a root a
declared `environment` (`{ "path": "./env/prd", "environment": "production" }`),
and `.environment(Production)` rules apply to that root by *folder* — no
reliance on per-resource `environment` tags. This is how you make prod
stricter than dev from a single spec. The mapping is a **policy decision
the platform team owns**: `pluvian init` guesses it from folder names, but
it is meant to be edited — e.g. a team that wants **staging held to
production-level rules** maps both `./env/stg` and `./env/prd` to
`production`. For genuinely *independent* rulesets (not just strictness
tiers), give each root its own `pluvian.json` + `spec.ts` and run `check`
per root instead.

### If the organization is already polyrepo

pluvian still functions correctly per-repository. Document the
version-drift and coordination-overhead risks explicitly to the
platform team, but do not block pluvian adoption on a monorepo migration
— that is a separate, larger organizational decision. The
`pluvian.json`-driven version enforcement (see
`/docs/specs/03-distribution-and-cli.md`) still prevents *silent* drift
within any single repo; it just doesn't prevent drift *between* repos
without additional process (Renovate Bot / broadcast notifications —
optional, not core to pluvian).

## Three-layer defense in depth

No single enforcement point needs to be perfect, because the layers
overlap and each catches what the others might miss:

```
1. LOCAL (pre-commit hook)
   npx @erkos/pluvian check
   Static HCL analysis, sub-second, no credentials needed.
   Fail-fast: developer fixes the issue before it's ever committed.
        │
        ▼
2. PIPELINE (CI gate)
   Same engine, same pluvian.json-pinned version.
   Runs again before `terraform plan`/`apply`.
   Cannot be bypassed by a developer skipping their local hook —
   this is the non-negotiable institutional gate.
        │
        ▼
3. PRODUCTION APPROVAL (CI manual job, conditional)
   Triggered only when a rule's effect is `RequireApproval`.
   Human sign-off required before `terraform apply` proceeds.
```

### Example pipeline wiring (GitLab CI)

```yaml
stages: [governance, plan, approval, apply]

pluvian-check:
  stage: governance
  script:
    - npx @erkos/pluvian@2 check --format json > pluvian-report.json
  artifacts:
    paths: [pluvian-report.json]
    expire_in: 90 days

terraform-plan:
  stage: plan
  needs: [pluvian-check]
  script:
    - terraform plan -out=tfplan

human-approval:
  stage: approval
  when: manual
  rules:
    - if: $PLUVIAN_REQUIRES_APPROVAL == "true"

terraform-apply:
  stage: apply
  needs: [human-approval]
  script:
    - terraform apply tfplan
```

`pluvian check` sets `PLUVIAN_REQUIRES_APPROVAL=true` (via a CI variable
file or dotenv artifact) when any evaluated rule has effect
`RequireApproval` and fired. If no such rule fired, the `human-approval`
manual job never appears and the pipeline proceeds straight through —
governance overhead is invisible when nothing requires it.

### Effect → exit-code contract (implemented in v0)

The engine distinguishes effects so CI can react correctly:

- **`block`** → exit **1**. A hard failure; the pipeline stops and
  `terraform apply` cannot proceed.
- **`require_approval`** → exit **0**, plus the approval signal. The check
  itself does *not* fail, so the pipeline proceeds *to* the manual gate
  rather than failing before it. The `--format json` output includes
  `"requiresApproval": true`, and each such violation carries its
  `approvers`.
- **`warn`** → exit **0**. Reported prominently but never fails the build.

The engine emits `PLUVIAN_REQUIRES_APPROVAL=true|false` so a later
manual-approval job can gate on it. It's CI-agnostic: in **GitLab CI** it
writes a dotenv file (default `pluvian.env`, overridable with
`PLUVIAN_ENV_FILE`) that the job exposes via `artifacts:reports:dotenv`; on
**GitHub Actions** it also appends to `$GITHUB_ENV`. GitLab consumer
pipeline:

```yaml
# .gitlab-ci.yml (consumer pipeline governing their Terraform)
governance-check:
  stage: check
  script:
    - npx @erkos/pluvian@2 check   # writes pluvian.env
  artifacts:
    reports:
      dotenv: pluvian.env                       # exposes PLUVIAN_REQUIRES_APPROVAL

approval:
  stage: approve
  needs: [governance-check]
  rules:
    - if: '$PLUVIAN_REQUIRES_APPROVAL == "true"'
  when: manual                                 # blocks the pipeline for sign-off
  allow_failure: false
  script: [echo "approved"]
```

Note this is the *consumer's* pipeline governing their Terraform — not
pluvian's own CI (`/docs/specs/07-development-workflow.md`).

## Exception handling

When a rule genuinely should not apply to a specific resource (e.g. a
legacy system migration temporarily needs SSH access), the exception
must be:

- **Explicit** — expressed as data in the spec, not a silent local edit.
- **Scoped** — tied to a specific resource, not a blanket rule
  disablement.
- **Time-limited** — has an expiry date.
- **Reviewed** — goes through the same MR review as any other spec
  change.
- **Auditable** — visible in Git history indefinitely.

```typescript
// .pluvian/spec.ts — exceptions section, reviewed like any other rule
export const exceptions = [
  exception({
    rule: 'no-public-ssh',
    resource: 'aws_security_group.legacy_migration',
    justification: 'Legacy system migration — scheduled decommission',
    approvedBy: 'security-architect-name',
    expires: '2026-09-01',
  }),
]
```

The engine must warn (not silently allow) when an exception is within
30 days of expiry, and must fail closed (treat the exception as expired,
i.e. re-enforce the rule) once the expiry date passes — never fail open.

## Rule severity guidance

| Effect | When to use | CI behavior |
|---|---|---|
| `Block` | Violates a hard security/compliance requirement with no legitimate exception path (open SSH to the internet, unencrypted PII storage) | Pipeline fails, `terraform apply` cannot proceed |
| `Warn` | Best-practice deviation that may have legitimate exceptions not yet formalized | Pipeline continues, output flagged prominently |
| `RequireApproval` | Legitimate but higher-risk action that should have human sign-off (large production DB instance, cross-region data transfer) | Pipeline pauses at a manual CI job until approved |

Default new rules to `Block` unless there's a specific reason to soften
— a governance tool whose default is `Warn` trains developers to ignore
its output.

## Compliance mapping

Where a rule exists specifically to satisfy an external requirement
(LGPD, SOC2, PCI-DSS, CIS Benchmark), the `.rationale()` should cite the
specific clause or control. This turns the spec file itself into
partial compliance documentation, reviewable by an auditor without a
separate compliance-mapping spreadsheet:

```typescript
rule()
  .resource(AwsResource.SecurityGroup)
  .denyIngress(Port.SSH)
  .message('SSH must not be open to the internet')
  .rationale('CIS AWS Foundations Benchmark v1.4, control 5.2'),
```

## What this document does not cover

Central spec registries, cross-organization compliance dashboards, and
violation-trend analytics are explicitly deferred — see
`/docs/specs/05-future-cloud-layer.md`. This document covers what is
achievable with Git, CI, and a monorepo alone, which is sufficient for
v1.
