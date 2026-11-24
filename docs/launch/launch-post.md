# Launch post — Show HN / r/terraform

Two variants of the same core message. HN skews technical/humble/anti-hype;
r/terraform skews practitioner/feature-curious. Both lead with the problem
(AI-generated Terraform) and close the loop in the editor — the extension is
what makes the story visceral: the squiggle appears *while the agent writes*.

Post timing: after Open VSX approval (both marketplaces live), so every link
in the post resolves to something installable.

---

## Show HN

**Title:** Show HN: pluvian — governance rules for AI-generated Terraform, from CI to editor squiggles (AWS/Azure/GCP)

**Body:**

The most interesting thing we do with AI coding agents lately is let them write
Terraform directly — and the scariest part is that the output looks clean:
`terraform plan` succeeds, the syntax is fine, and then someone notices the new
security group is `0.0.0.0/0` or the RDS instance landed in a public subnet.
The old guardrail ("just use our approved modules") stops working the moment the
model writes the HCL itself.

I open-sourced pluvian to fix this. It's a governance engine that runs at three
gates, cheapest first:

- **In the agent's loop:** `npx @erkos/pluvian@2 check` — the agent writes
  Terraform, runs the check, reads the findings, fixes before the PR.
- **In CI:** same command as a gate, or `--format sarif` into GitHub Code
  Scanning.
- **In the editor:** a VS Code extension that puts a squiggle on
  `publicly_accessible = true` the moment the file is saved — while the agent
  is still writing. Same engine, same spec, same verdicts. Editor and CI can't
  disagree because there's nothing to disagree about — one `check()`.

Three things make it different from the OPA/Sentinel/Checkov/tfsec lineup:

1. **It's the fail-fast code layer — no credentials, no state, no `terraform plan`.**
   Static analysis of the HCL text (official HashiCorp parser compiled to WASM).
   The bet: AI-generated Terraform is *literal* — violations show up as explicit
   values, so static text catches the large majority without a plan. The same
   directness that creates the risk makes it detectable.

2. **Rules are written for the security architect, not the Rego specialist.**
   The spec is TypeScript constrained to read like prose, so the person
   accountable for a rule can read and approve it in a PR diff:

       rule()
         .resource(AwsResource.SecurityGroup)
         .denyIngress(Port.SSH, Port.RDP)
         .message('SSH and RDP must not be open to the internet')
         .rationale('CIS AWS Foundations Benchmark v1.4, control 5.2')

3. **Topology-aware rules.** "No EFS mount target in a public subnet" isn't a
   per-resource check — it's a 5-hop walk (mount target → subnet →
   route_table_association → route_table → internet_gateway). pluvian's graph
   layer does this as an authorable rule:

       rule()
         .resource(AwsResource.EfsMountTarget)
         .denyIfReachable(AwsResource.InternetGateway)
         .message('EFS mount targets must not be in a public subnet')

One discipline I care about: when the engine can't resolve a value (a
`var`-supplied CIDR, an opaque `for_each`), it reports **could not evaluate**
rather than guessing. For a governance tool a false positive is worse than an
honest gap — every dogfood release ran against real module repos
(terraform-aws-modules, terraform-google-modules, Azure/, cloudposse) chasing
0 false positives across 35+ repos on three clouds.

Ships with 144 rules across 8 presets (coreSecurity + per-cloud CIS +
PCI/SOC2/NIST/data-protection), ~3,200 resource types recognized, published to
npm with SLSA provenance. The extension bundles the engine — zero local
Node/npm for the editor user. Both are versioned in lockstep from the same
tag, so the `pluvian.json` version pin means something across all three
surfaces.

Repo + docs: https://github.com/erkos-hq/pluvian
Extension: https://marketplace.visualstudio.com/items?itemName=erkos.pluvian-vscode

I'd love feedback on three things: (a) does the "rules readable by
non-engineers" framing resonate, or is it solving a problem you don't have?
(b) the editor loop — is in-editor governance where you'd actually use it, or
is CI the real gate for your team? (c) the honest `couldNotEvaluate` path —
useful, or noisy?

---

## r/terraform

**Title:** pluvian — zero-install policy checks for Terraform, now with editor squiggles (the same engine, in your VS Code)

**Body:**

If your team is generating Terraform with AI tools, you've probably hit this:
the output looks fine, `terraform plan` is clean, and then someone notices the
new security group is open to `0.0.0.0/0` or the RDS instance landed in a
public subnet. The "just use our approved modules" guardrail doesn't hold when
the model writes the HCL directly.

I open-sourced a static governance tool for this — pluvian. It runs at three
gates, cheapest first:

- **Zero-install CLI:** `npx @erkos/pluvian@2 check` (from the project root)
- **CI:** same command as a gate, or `--format sarif` for GitHub Code Scanning
- **Editor:** the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=erkos.pluvian-vscode)
  puts squiggles on violations as you save — same engine, same spec, same
  verdicts as the CLI. The engine ships inside the extension (no local
  Node/npm needed). Multi-root and nested projects work; the ignore directive
  has a Quick Fix (`Cmd+.`).

What makes it a bit different:

- **Readable rules.** The policy file (`.pluvian/spec.ts`) is TypeScript
  constrained to read like English — security/compliance folks review it in a
  PR without learning Rego.
- **No credentials, no `terraform plan`.** Pure static HCL analysis (the
  official HashiCorp parser compiled to WASM), runs in pre-commit and CI
  without cloud access.
- **Topology-aware rules.** "No resource in a public subnet" or "no SG shared
  between a public LB and a private DB" need multi-hop graph traversal, not
  per-resource checks — pluvian has a dependency-graph layer for these.
- **Honest gaps.** When it can't resolve a value statically, it says
  `could not evaluate` instead of silently passing.
- **Ships baselines.** 144 rules / 8 presets — `coreSecurity` + CIS
  AWS/Azure/GCP + PCI/SOC2/NIST/data-protection — plus example specs for
  startup / enterprise / regulated orgs in the repo's `examples/`.

30-second demo (terminal): https://github.com/erkos-hq/pluvian#the-30-second-demo

It's been dogfooded against real module repos (terraform-aws-modules,
terraform-google-modules, Azure/, cloudposse) — chasing 0 false positives,
which matters more to me than catch-rate for a tool that fails CI.

Repo: https://github.com/erkos-hq/pluvian
Docs: https://github.com/erkos-hq/pluvian#documentation
Extension: https://marketplace.visualstudio.com/items?itemName=erkos.pluvian-vscode

Curious what's missing for your stack — what rule would you want first?
