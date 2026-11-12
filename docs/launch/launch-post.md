# Launch post — Show HN / r/terraform

Two variants of the same core message. HN skews technical/humble/anti-hype;
r/terraform skews practitioner/feature-curious. Both lead with the problem
(AI-generated Terraform) and the concrete demo.

---

## Show HN

**Title:** Show HN: pluvian — readable governance rules for AI-generated Terraform (AWS/Azure/GCP)

**Body:**

The most interesting thing we do with AI coding agents lately is let them write
Terraform directly — and the scariest part is that the output looks clean:
`terraform plan` succeeds, the syntax is fine, and then someone notices the new
security group is `0.0.0.0/0` or the RDS instance landed in a public subnet.
The old guardrail ("just use our approved modules") stops working the moment the
model writes the HCL itself.

I open-sourced pluvian to fix this — and the part I'm most excited about is that
it's cheap and self-contained enough to run **inside the agent's own loop**: the
agent writes Terraform, runs `npx @erkos/pluvian@1 check`, reads the findings,
and fixes them before it ever opens a PR. Fail at the cheapest gate, not at plan
or in prod.

    npx @erkos/pluvian@2 check

Three things make it different from the OPA/Sentinel/Checkov/tfsec lineup:

1. **It's the fail-fast code layer — no credentials, no state, no `terraform plan`.**
   Static analysis of the HCL text. That puts it next to tfsec/Checkov (same
   layer), not OPA/Sentinel (which run at plan/policy time and need auth + state).
   The bet: AI-generated Terraform is *literal* — violations show up as explicit
   values, so static text catches the large majority without needing a plan. The
   same directness that creates the risk makes it detectable.

2. **Rules are written for the security architect, not the Rego specialist.** The
   spec is TypeScript constrained to read like prose, so the person accountable
   for a rule can read and approve it in a PR diff without trusting an engineer's
   unreviewable policy code:

       rule()
         .resource(AwsResource.SecurityGroup)
         .denyIngress(Port.SSH, Port.RDP)
         .message('SSH and RDP must not be open to the internet')

3. **It's the only one with topology-aware rules.** "No EFS mount target in a
   public subnet" isn't a per-resource check — it's a 5-hop walk
   (mount target → subnet → route_table_association → route_table → internet_gateway),
   forward and reverse. pluvian's graph layer does this as an authorable rule:

       rule()
         .resource(AwsResource.EfsMountTarget)
         .denyIfReachable(AwsResource.InternetGateway)
         .message('EFS mount targets must not be in a public subnet')

One discipline I care about: when the engine can't resolve a value (a
`var`-supplied CIDR, an opaque `for_each`), it reports **could not evaluate**
rather than guessing. For a governance tool a false positive is worse than an
honest gap. I've dogfooded every release against real module repos
(terraform-aws-modules, terraform-google-modules, Azure/, cloudposse/) — 0 false
positives across 35+ real-world repos on three clouds.

It's at v1.9.37: 144 rules across 8 presets (coreSecurity + per-cloud CIS +
PCI/SOC2/NIST/data-protection), ~3,200 resource types recognized, published to
npm with SLSA provenance. Copy-paste spec templates for startup / enterprise /
regulated orgs are in the repo's `examples/`.

Repo + docs: https://github.com/erkos-hq/pluvian

I'd love feedback on three things: (a) does the "rules readable by non-engineers"
framing resonate, or is it solving a problem you don't have? (b) what's the first
rule you'd want that isn't there? (c) the honest `couldNotEvaluate` path — useful,
or noisy?

---

## r/terraform

**Title:** pluvian — a zero-install policy check for Terraform, with rules a security architect can actually read

**Body:**

If your team is generating Terraform with AI tools, you've probably hit this:
the output looks fine, `terraform plan` is clean, and then someone notices the
new security group is open to `0.0.0.0/0` or the RDS instance landed in a public
subnet. The "just use our approved modules" guardrail doesn't hold when the model
writes the HCL directly.

I open-sourced a static governance tool for this — pluvian. Run it with no install:

    npx @erkos/pluvian@2 check

What it does that's a bit different:

- **Readable rules.** The policy file (`.pluvian/spec.ts`) is TypeScript constrained
  to read like English, so security/compliance folks can review it in a PR without
  learning Rego:
  https://github.com/erkos-hq/pluvian#why-pluvian
- **No credentials, no `terraform plan`.** It's pure static HCL analysis (WASM
  parser), so it runs in pre-commit and CI without cloud access.
- **Topology-aware rules.** Things like "no resource in a public subnet" or "no SG
  shared between a public LB and a private DB" need multi-hop graph traversal,
  not per-resource checks. pluvian has a dependency-graph layer for these.
- **Honest gaps.** When it can't resolve a value statically, it says
  `could not evaluate` instead of silently passing.
- **Ships baselines.** 144 rules / 8 presets — `coreSecurity` + CIS AWS/Azure/GCP
  + PCI/SOC2/NIST/data-protection — plus example specs for startup / enterprise /
  regulated orgs.

Output formats: terminal (default), `--format json`, `--format sarif` (so it
shows up in GitHub Code Scanning / GitLab security dashboards).

It's been dogfooded against real module repos (terraform-aws-modules,
terraform-google-modules, Azure/, cloudposse) — chasing 0 false positives, which
matters more to me than catch-rate for a tool that fails CI.

Repo: https://github.com/erkos-hq/pluvian
Docs: https://github.com/erkos-hq/pluvian#documentation

Curious what's missing for your stack — what rule would you want first?
