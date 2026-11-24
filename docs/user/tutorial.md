# Tutorial — pluvian in 5 minutes

> **Goal:** go from zero to a custom rule catching a real violation, then green, then wired to CI. Copy-paste each block. ~5 minutes, no cloud credentials, no Terraform install required.

You'll build a tiny Terraform project, scaffold pluvian, add **one custom tag rule**, watch it flag a missing tag, fix the `.tf`, re-run green, and ship it to CI.

## 0. Prerequisites

- **Node.js ≥ 18** (to run pluvian via `npx`).
- **Terraform `.tf` files** — you don't need `terraform` installed; pluvian reads HCL directly (no `plan`).
- **No pluvian install** — `npx` pulls a pinned version per run.

## 1. Make a tiny Terraform project

```bash
mkdir pluvian-demo && cd pluvian-demo
mkdir terraform
cat > terraform/main.tf <<'EOF'
resource "aws_s3_bucket" "data" {
  bucket = "my-data-bucket"

  tags = {
    Name = "data"
  }
}
EOF
```

That bucket is missing any org-level governance tags — exactly the kind of thing AI code-gen omits. pluvian will catch it.

## 2. Scaffold pluvian

```bash
npx @erkos/pluvian@2 init
```

This creates two files:

- **`.pluvian/spec.ts`** — your rule spec (TypeScript). The scaffold ships a sensible starter.
- **`pluvian.json`** — points pluvian at the spec and the terraform dir, and pins the version (so CI never silently drifts).

> The scaffold prints the exact `npx` command for the pinned version. Use that — never `@latest` (a governance tool that floats its own version defeats its own purpose).

## 3. Run the starter spec

```bash
npx @erkos/pluvian@2 check
```

You'll see output from the bundled `coreSecurity` rules. The bucket above is likely clean against the starter (no public ACL, etc.) — but it's missing your org's tags. Time to add a rule for that.

## 4. Add a custom rule (the bit that matters)

Open `.pluvian/spec.ts`. Add this rule to the `spec` array — require the tags your org mandates:

```ts
import { rule, AwsResource, Tag } from "@erkos/pluvian";

// Your org's tag taxonomy — a TypeScript enum gives you autocomplete +
// typo-proofing in your editor (run `npm i -D @erkos/pluvian` for the types).
enum OrgTag {
  Owner = "owner",
  CostCenter = "cost_center",
  DataClassification = "data_classification",
}

export const spec = [
  rule()
    .resource(AwsResource.S3Bucket)
    .mustHaveTags(OrgTag.Owner, OrgTag.CostCenter, OrgTag.DataClassification)
    .message(
      "S3 buckets must carry owner, cost_center, and data_classification tags",
    )
    .rationale(
      "Org policy FIN-117 — cost allocation + data-handling audit trail",
    ),
];
```

> **Tip — editor autocomplete:** `npm i -D @erkos/pluvian` installs the types locally so your editor lights up `AwsResource.`, `Tag.`, and every rule condition with autocomplete + red squiggles on typos. CI stays zero-install via `npx`.

## 5. Re-run — see the violation

```bash
npx @erkos/pluvian@2 check
```

Output:

```
── BLOCKING ──
✗ aws_s3_bucket.data  (terraform/main.tf:2)
    S3 buckets must carry owner, cost_center, and data_classification tags
    ↳ Org policy FIN-117 — cost allocation + data-handling audit trail

✗ 1 violation(s), 0 passed, 0 could not be evaluated
```

The exit code is **1** (blocking violation) — CI would fail here. That's the whole point.

## 6. Fix the Terraform

Edit `terraform/main.tf` to add the missing tags:

```hcl
resource "aws_s3_bucket" "data" {
  bucket = "my-data-bucket"

  tags = {
    Name              = "data"
    owner             = "team-data"
    cost_center       = "1234"
    data_classification = "internal"
  }
}
```

## 7. Re-run — green

```bash
npx @erkos/pluvian@2 check
```

```
✓ passed (1 checks)
```

Exit code **0**. CI passes.

## 8. Handle an honest exception (optional)

Some resources legitimately violate a rule — a bastion host needs public SSH, a public CDN bucket shouldn't block all public access. Suppress the finding **with a reason**, on the block, so it's auditable:

```hcl
resource "aws_security_group" "bastion" {
  # pluvian:ignore: bastion host — SSH is intentionally public behind a CIDR allowlist
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]  # corp VPN only, not 0.0.0.0/0
  }
}
```

The directive suppresses findings on that block; the reason is right there in the diff for review. See [handle exceptions](./how-to/handle-exceptions.md) for the full syntax (suppress by rule id, scope, etc.).

## 9. Wire it to CI

That's the whole CI integration — pin the version, run `check`:

**GitHub Actions** (`.github/workflows/pluvian.yml`):

```yaml
name: pluvian check
on: [pull_request, push]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npx @erkos/pluvian@2 check
```

**GitLab CI** (`.gitlab-ci.yml`):

```yaml
pluvian:check:
  stage: test
  image: node:20
  script: [npx @erkos/pluvian@2 check]
```

Want findings in the GitHub **Security tab** with file:line PR annotations? Emit SARIF and upload it — see [read the output](./how-to/read-the-output.md#sarif--github-security-tab).

Want them **in your editor, while the Terraform is being written**? Install the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=erkos.pluvian-vscode) — the same engine, as squiggles on save. See [use the extension](./how-to/use-the-extension.md).

## You're done

You now have:

- A version-pinned, zero-install governance check.
- A custom rule expressing **your org's policy**, in reviewable TypeScript.
- A CI gate that fails on violations, with an auditable exception path.
- (Optional) in-editor diagnostics from the same engine — CLI, CI, and editor can never disagree.

## Where next

- **[What pluvian does / doesn't](./what-it-does.md)** — the honest boundaries (could-not-evaluate, ungoverned, static-only).
- **[Rule reference](./reference/rules/all-rules.md)** — every shipped rule, what it checks, its rationale, framework mapping.
- **[DSL reference](./reference/dsl.md)** — every rule condition, scoping knob, and effect.
- **[How-tos](./how-to/)** — common tasks (require org tags, scope to prod, read could-not-evaluate, …).
