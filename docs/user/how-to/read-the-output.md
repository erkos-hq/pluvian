# How to read the output

> **Audience:** CI/platform engineers + security reviewers. Three formats, exit codes, and how to pipe findings into your security dashboard.

## Three output formats

```bash
npx @erkos/pluvian@2 check                      # terminal (default; human-readable)
npx @erkos/pluvian@2 check --format json        # machine-readable JSON
npx @erkos/pluvian@2 check --format sarif       # SARIF 2.1.0 for security dashboards
```

### Terminal (default)

Color when on a TTY (honors `NO_COLOR`), grouped by severity:

```
── BLOCKING ──
✗ aws_security_group.web  (terraform/main.tf:2)
    SSH and RDP must not be open to the internet
    ↳ CIS AWS Foundations Benchmark v1.4, control 5.2

── COULD NOT EVALUATE ──
? aws_s3_bucket.data  (terraform/main.tf:10): tags is an unresolved reference (require-org-tags)

── NOT GOVERNED (vocabulary gap) ──
• aws_widget.g  (terraform/x.tf:1)

✗ 1 violation(s), 3 passed, 2 could not be evaluated
```

Use it for: local runs, pre-commit, human review.

### JSON

Stable schema (`schemaVersion: 1`) for CI artifacts, custom dashboards, wrapping tools. Top-level fields: `schemaVersion`, `violations`, `passed`, `couldNotEvaluate`, `ungoverned`, `requiresApproval`. Each violation carries `ruleId`, `message`, `rationale`, `effect`, `resource`, `file`, `line`, and optional `approvers`. See `report/report.ts` for the frozen shape.

Use it for: building a custom dashboard, post-processing in a script, storing as a CI artifact.

### SARIF 2.1.0

The OASIS-standard interchange format for static-analysis findings. pluvian's SARIF passes the official `@microsoft/sarif-multitool validate` clean (verified per release).

- Each `block` violation → `level: "error"`; `warn` / `require_approval` → `"warning"`.
- Each could-not-evaluate + ungoverned entry → `level: "note"` (visible gap, does not gate).
- Module-trace annotations and pluvian-specific data (resource, effect, rationale, approvers, moduleTrace) round-trip through `properties`.
- Project-level findings (e.g. "no Access Analyzer exists") carry no `locations` (SARIF-permitted) — context in the message.

Use it for: GitHub Code Scanning, GitLab security report artifacts, Azure DevOps, VS Code SARIF viewer.

## Exit codes

pluvian's exit code makes the three outcomes distinguishable for CI:

| Exit  | Meaning                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| **0** | Ok — no `block` violations (warnings / could-not-evaluate / require_approval do not fail)                         |
| **1** | Ok run, but one or more `block` violations fired — **CI fails**                                                   |
| **2** | Operational error (config not found, version mismatch, spec invalid, parse failure) — pluvian could not do its job |

Note: `warn` and `require_approval` do **not** fail the build (exit 0). `require_approval` instead emits a signal for a downstream manual-approval gate (see below).

## Severity levels (effects)

Each rule has an **effect** — what happens when it fires:

| Effect             | Terminal marker | CI behavior                                                                            |
| ------------------ | --------------- | -------------------------------------------------------------------------------------- |
| `block`            | ✗ red           | Fails the build (exit 1)                                                               |
| `warn`             | ‼ yellow        | Visible; non-blocking                                                                  |
| `require_approval` | ⏸ yellow        | Non-blocking, but emits `PLUVIAN_REQUIRES_APPROVAL=true` for a downstream approval gate |

## require_approval — the manual gate

When a `require_approval` rule fires, pluvian writes `PLUVIAN_REQUIRES_APPROVAL=true` for CI:

- **GitLab CI** → a `dotenv` artifact (`pluvian.env`) a downstream job gates on.
- **GitHub Actions** → appended to `$GITHUB_ENV`.

Pair it with a `when: manual` job / an environment-required check so a human signs off before `terraform apply`. See the [tutorial](../tutorial.md#9-wire-it-to-ci) and the CI templates in `packages/cli/src/templates/ci-templates.ts`.

## SARIF → GitHub Security tab

The highest-leverage integration: findings appear inline on PRs with file:line deep-links, in the repo's Security tab, alongside CodeQL/semgrep/gitleaks.

```yaml
# .github/workflows/pluvian.yml
name: pluvian check
on: [pull_request, push]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npx @erkos/pluvian@2 check --format sarif > pluvian.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: pluvian.sarif
          category: pluvian
```

## SARIF → GitLab

GitLab's native security dashboard uses a different JSON shape; SARIF is stored as a job artifact (use a sarif→gitlab converter if you want dashboard ingestion):

```yaml
pluvian:check:
  image: node:20
  script:
    - npx @erkos/pluvian@2 check
    - npx @erkos/pluvian@2 check --format sarif > pluvian.sarif
  artifacts:
    paths: [pluvian.sarif]
    reports:
      dotenv: pluvian.env # the approval signal
```

## See also

- [Understand could-not-evaluate](./understand-could-not-evaluate.md) — what the `?` findings mean.
- [What pluvian does / doesn't](../what-it-does.md) — why could-not-evaluate exists at all.
- CI templates: `packages/cli/src/templates/ci-templates.ts`.
