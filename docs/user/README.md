# pluvian — user documentation

**Governance-as-code for Terraform.** Statically analyze your `.tf` (HCL) against a readable TypeScript rule spec — across AWS, Azure, and GCP — before `terraform plan`. Zero-install (`npx`), static-only (no credentials, no plan), honest (no guessing — reports "could not evaluate" rather than false positives).

```bash
npx @erkos/pluvian@2 check
```

## Start here

- **[What pluvian does — and doesn't](./what-it-does.md)** — the 5-minute orientation. Read this first.
- **[Tutorial — pluvian in 5 minutes](./tutorial.md)** — scaffold a project, add a custom rule, see a violation, fix it, wire CI.

## How-tos

Use-case recipes for spec authors and security reviewers:

- [Add a custom rule](./how-to/add-a-custom-rule.md) — the condition families and when to use each.
- [Use the CIS / framework presets](./how-to/use-the-cis-presets.md) — compose `coreSecurity` + the right packs.
- [Scope to environment / region / provider](./how-to/scope-to-environment.md) — prod-only, EU-only, DR-account rules.
- [Handle exceptions](./how-to/handle-exceptions.md) — suppress a finding on a resource, with a reason.
- [Understand "could not evaluate"](./how-to/understand-could-not-evaluate.md) — the #1 confusion point, demystified.
- [Read the output](./how-to/read-the-output.md) — terminal / JSON / SARIF, exit codes, GitHub Security tab.

## Reference

- **[Rule catalog](./reference/rules/all-rules.md)** — every shipped rule (140 across 8 presets), what it checks, its rationale, and framework mapping. Auto-generated from source; never drifts.
- [Resource → rules index](./reference/rules/resource-index.md) — the per-resource view: which rules apply to each governed type.
- [DSL reference](./reference/dsl.md) — the `.pluvian/spec.ts` language: every condition, scope knob, and effect.
- Per-preset pages: [`core-security`](./reference/rules/core-security.md) · [`cis-aws`](./reference/rules/cis-aws.md) · [`cis-azure`](./reference/rules/cis-azure.md) · [`cis-gcp`](./reference/rules/cis-gcp.md) · [`pci-dss`](./reference/rules/pci-dss.md) · [`soc2`](./reference/rules/soc2.md) · [`nist-800-53`](./reference/rules/nist-800-53.md) · [`data-protection`](./reference/rules/data-protection.md)

## Also in this repo

- [`packages/cli/README.md`](../../packages/cli/README.md) — the npm package README (getting-started, performance, license).
- [`docs/ROADMAP.md`](../ROADMAP.md) — capability roadmap + current state.
- [`docs/specs/`](../specs/) — internal architecture & design specs (engine internals, not user HOWTOs).

---

The rule catalog under `reference/rules/` is **auto-generated** by `npm run gen-docs` (from the preset source). Do not edit those files by hand — add or change a rule in the preset, re-run the generator, and the docs update. Every other page is hand-written.
