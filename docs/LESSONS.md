# Lessons — append-only log

> Two-sided memory: **KEEP** (what went right, do again) and **AVOID** (what went wrong, don't repeat). Append a new entry per non-trivial session/release. Never rewrite history — mark `superseded YYYY-MM-DD` instead of deleting.
>
> Related: `docs/SESSION_HANDOFF.md` (current state), `docs/ROADMAP.md` (backlog + dogfood log), `docs/specs/00-architecture-decision-record.md` (locked decisions).

## How to use

- **Author:** at the end of a release or non-trivial session, append one entry. Tag with topic (`release`, `normalize`, `cis`, `ci`, `parser`, etc.).
- **Reader:** at session start, grep this file for the topic you're about to touch. The `AGENTS.md` Session bootstrap rule instructs the agent to do this automatically.

## Entry shape

```markdown
## YYYY-MM-DD — <topic> — <short title>

**KEEP** (do again):
- ...

**AVOID** (don't repeat):
- ...
```

---

## 2026-08-05 — release — v1.9.37 publish gate

**KEEP** (do again):
- `publish needs: [gate]` in `release.yml` — a `gate` job (Node 24) runs the full correctness suite before `npm publish --provenance` can start. Caught the Quick Start order regression before it hit npm.
- Node 24 / npm 11 pin on the release workflow — trusted publishing OIDC token exchange silently fails on Node 20 / npm 10.x. Don't lower it.
- `prepack` copies root `README.md` → `./README.md` so the npm tarball ships the current README. Removes the historical npm/GitHub README drift.
- Absolute README links + ASCII diagrams — npmjs doesn't render mermaid, and relative links 404. Stay absolute, stay ASCII.

**AVOID** (don't repeat):
- **npm no-republish.** Once a version number is published (even if unpublished), npm blocks republishing it. Always use a fresh version number after any publish, no matter how small the fix.
- Quick Start order matters on npm — `check` before `init` is broken because `check` needs a spec. Verify the order in the rendered tarball, not just in the repo.
- Tag-triggered `ci.yml` runs duplicate work that `release.yml` owns — `ci.yml` should not fire on tags.

## 2026-07-30 → 2026-08-08 — parser — HCL `${...}` interpolation strings

**KEEP** (do again):
- Pure-JS WASM parser boundary (`@cdktf/hcl2json`) — no native binary, no Gatekeeper dialog, no SmartScreen. Adoption-friction win.
- Build HCL `${...}` interpolation strings via **string concatenation**, not via regex/template-string assembly that interpolates user-controlled content. CodeQL #1-3 flagged the old form; concatenation is the safe shape.

**AVOID** (don't repeat):
- Don't construct `${...}` strings via regex substitution over untrusted HCL — CodeQL flags it as a tainted-template form even when exploitation requires the engine's own input. Refactor to concatenation, don't disable the rule.
- The upstream parser source repo (`hashicorp/terraform-cdk`) is archived. Documented in `docs/specs/00-architecture-decision-record.md`. Future mitigation: compile `hashicorp/hcl/v2` to WASM and vendor the `.wasm`. Don't act like the dependency is actively maintained.

## 2026-08-06 — ci — CodeQL semantic analysis rollout

**KEEP** (do again):
- CodeQL `security-and-quality` query suite on JS/TS caught 5 real findings on first run (3 tainted-template, 1 missing-regexp-anchor, 1 formatting). Worth the CI minutes.
- `workflow_dispatch` on both `ci.yml` and `codeql.yml` — manual/on-demand reruns without pushing a no-op commit. Add it to every workflow that gates releases.
- Anchor regexes — `$schema` matching in SARIF tests was unanchored; CodeQL #5 flagged it. Anchoring is the right form for identifier validation.

**AVOID** (don't repeat):
- Don't bump `codeql-action` major without checking the changelog — v3 → v4 had behavioral changes that needed a separate commit. Bundle the bump with verification, not as a drive-by.
- Probing GitHub Actions push-event delivery with an empty commit (`1f3a6c1`) works but pollutes history. Use `workflow_dispatch` instead — that's what it's for.

## 2026-07-29 → 2026-08-05 — engine — graph layer + module-following

**KEEP** (do again):
- Resource-type-aware edge classification (`classifyEdge(attr, resourceType)` + `STRUCTURAL_REF_BY_TYPE`) — fixed the NAT false chain via `aws_nat_gateway.subnet_id` → structural. Without the type override, `denyIfReachable` chained through every resource with a `subnet_id` attribute.
- `couldNotEvaluate` for unresolved graph edges — partially-unresolvable reachability chains degrade honestly, never a false pass. The principle "a false positive is worse than an honest gap" is the right framing for a governance tool.
- Per-instantiation trace labels (`env/prd › modules/rds/main.tf (db_bad)`) — distinguish two calls of one module. Without them, findings on `for_each` modules are ambiguous.

**AVOID** (don't repeat):
- Don't treat `google_service_account.*.{member,email,name}` as opaque — the provider type-system guarantees they can't equal a public-principal scalar. Returning `couldNotEvaluate` for them is wrong; it's a definite PASS. (Fixed in v1.9.31 via `denyValueExcludedByResourceAttr`.)
- Don't skip graph edges silently when a list-valued attribute is involved — `buildGraph` must scan `res.lists` too, or SG-shared rules miss real `.tf` patterns.
- Don't disable Stryker mutation clusters without a documented equivalent-mutant reason. The skip-optimization block in `evaluate.ts` L2403-2413 has `// Stryker disable` comments explaining why — keep that pattern for any future disables.

## 2026-08-11 — process — session memory bootstrap

**KEEP** (do again):
- Persistent memory harness: `SESSION_HANDOFF.md` (state) + `LESSONS.md` (this file, two-sided) + `ROADMAP.md` (backlog) + AGENTS.md bootstrap rule that forces the agent to read them at session start. Closes the "agent didn't proactively pull context" gap.
- `npm run context` emits a deterministic bootstrap blob (last tag, commits since, npm version, drift). No LLM reasoning needed for state that git already knows.
- Append-only logs. Never rewrite history — supersede with a date stamp.

**AVOID** (don't repeat):
- Don't put "delete this file after absorbing" in a handoff doc — it fights persistence and the file stays anyway. Rolling-append is the right model.
- Don't bury bootstrap instructions in 26K-char CLAUDE.md — agents skim long files. Top of `AGENTS.md`, short and explicit.
- Don't capture only failures. Wins rot fastest because success feels self-explanatory in the moment. Two-sided log or none.

## 2026-08-18 — brand — rebrand recovery + naming sprint

**KEEP** (do again):
- Screen names against npm + GitHub + common-law BEFORE falling in love — killed ~60% of candidates in minutes (all common animal names npm-taken; Tagma/Styx/Nomos/Lorica too).
- Capture brand decisions to disk the session they're made. Original rebrand discussion was lost with its session; this sprint's conclusions now live in `docs/REBRAND.md`. The harness already paid for itself.
- Trade-off tables + blunt recommendation + wait. User holds under pressure; presenting cleanly and waiting worked.
- Positioning split by audience: "NixOS for governance" (devs) vs "control plane for AI-generated infrastructure" (buyers). Same product, two framings.

**AVOID** (don't repeat):
- Mythological/commercial-collision names without a TM budget — Sobek (Smite/Hi-Rez) + 4 live USPTO applications forced a retreat after emotional investment.
- Common animal words as npm package names — namespace exhausted; `croc` additionally collides with schollz/croc file-transfer CLI.
- Personal names as package names (Sotiris etc.) — weak trademarks (need secondary meaning), reads wrong as a CLI.
- `krokodil` — Russian street drug. Never.
- Declaring "OS" at launch. Earn the platform framing via a second domain adapter; ship the wedge.

## 2026-08-26 — ci/security — audit-gate blind spot + transitive pin override

**KEEP** (do again):
- Full-project security review surfaced zero engine-code findings (all dynamic regexes escaped, no child_process/eval, OIDC trusted publishing, scoped workflow permissions).
- `overrides` in package.json for exact-pinned transitive deps — `typed-rest-client@2.3.1` pins `qs: '6.15.1'` (exact, no caret), so `npm audit fix` silently does nothing ("up to date") while audit still reports the GHSA. Scoped override `{"typed-rest-client": {"qs": "6.15.3"}}` fixed it; verify with `npm ls qs` → "overridden".

**AVOID** (don't repeat):
- Trusting `--audit-level=high` as the whole dependency story — it lets moderates linger indefinitely in dev-only chains. Run a bare `npm audit` (no level floor) periodically; when audit says "fix available" but `audit fix` reports "up to date", suspect an exact transitive pin and go straight to an override.

## 2026-09-01 — ci — owner push bypasses required checks

**KEEP** (do again):
- Pull/rebase before push — origin had Renovate #9 the local clone didn't; rebased clean because commits were separated per concern (docs vs deps).

**AVOID** (don't repeat):
- Pushing straight to main as owner bypasses the required-checks ruleset ("Bypassed rule violations: 8 of 8"). CI ran afterward, but the protection record shows bypasses. For version-bearing changes prefer a PR; accept the bypass consciously only for docs/dev-dep-only commits.

## 2026-09-02 — release — v2.0.0 rebrand ship (org-transfer landmines + demo GIF)

**KEEP** (do again):
- Squashing the rebrand branch to ONE commit before the PR made the red CI diagnosable — failures had to be lockfile/action, not history or content.
- Reproduce CI scanner failures locally before touching anything (`brew install gitleaks` + repo config, scan diff AND full history) — proved the code clean in minutes and redirected diagnosis to the workflow gate.
- `script -q /tmp/out.txt zsh -c '<cmd>'` pseudo-TTY runs to ground-truth what a command ACTUALLY prints on a TTY — settled the npx-prompt question instantly after two rounds of contradictory evidence.
- `--yes` on the visible command is the ONLY reliable npx prompt suppressor: npm 11's interactive "Ok to proceed?" honors the flag, not `npm_config_yes`, and pre-warming does not reliably silence it.

**AVOID** (don't repeat):
- **`gitleaks-action` on an ORG repo requires a per-org `GITLEAKS_LICENSE`** (free from gitleaks.io, but issued for the org name typed in their form — must match the GitHub owner EXACTLY). A personal→org repo transfer turns the job red with zero findings. Fallback shipped in `ci.yml`: direct checksum-pinned binary.
- **Classic PATs need the `workflow` scope** to push commits touching `.github/workflows/`. Scope-up the existing token (the value survives scope edits — no keychain update).
- **Org rulesets don't inherit the owner bypass** — after transfer, direct pushes to main are DECLINED (the personal-repo "bypass with warning" behavior is gone). Everything goes through PRs now (or add an explicit bypass list in the org ruleset).
- Asking vision models leading questions when verifying screenshots ("is X visible?") — they parrot the quoted strings back. Transcribe neutrally, then grep the transcript yourself.
- `git add -A` from the repo root on a long-lived clone — it sweeps the untracked tooling dirs into the commit. Add by path.

## 2026-09-01 — docs — hand-written user docs rotted behind the generated catalog

**KEEP** (do again):
- Cross-reading hand-written user docs against the shipped engine caught contradictions the `check-docs` gate can't — the gate keeps the auto-generated catalog fresh, but `what-it-does.md` / `dsl.md` only update by hand.
- Verify a stale claim against source before rewriting it (grep'd `classifyEdge`/`STRUCTURAL_REF_BY_TYPE` in `evaluate.ts`, counted the generated catalog's 144 rules) so the fix cites shipped code, not memory.

**AVOID** (don't repeat):
- Shipping an engine feature without sweeping hand-written docs for claims it invalidates — "no multi-hop dependency graph (yet)" sat in `what-it-does.md` for ~10 releases while the graph layer was the README's headline differentiator. Engine-release checklist: grep `docs/user/` (hand-written pages only — the catalog regenerates itself) for the feature's keywords.

## 2026-09-03 — packaging — vsce + file:-linked engine dependency

**KEEP** (do again):
- Stage-and-pack (`packages/vscode/scripts/package.mjs`): copy the runtime closure into `.vsce-pack/` with REAL pinned dependency specs and run `vsce package` THERE — a self-consistent tree passes vsce's `npm list` and packs exactly the closure (185-file, 2.3 MB VSIX).
- Smoke-test the artifact, not the source tree: unzip the VSIX and run the bundled engine against `demo/` (`scripts/smoke.mjs`, wired into CI). Proves the shipped closure — engine dist, jiti alias, hcl2json WASM — works end-to-end before any human installs it.
- Probe ground truth instead of deriving from doc comments: a 10-line jiti script settled the module-trace file format (`env/prd › modules/rds/main.tf (db_bad)`) that three different comments described three different ways.

**AVOID** (don't repeat):
- `vsce package --no-dependencies` when node_modules must ship — vsce's built-in ignore list drops node_modules wholesale (silent 6-file VSIX).
- Mirroring an `overrides` entry into a dependent package's package.json to satisfy `npm list` — npm does not apply a foreign root's overrides to a file:-linked, already-installed tree (still ELSPROBLEMS).
- `.vscodeignore` `!` re-includes under `node_modules/` — vsce's default exclusion wins.
- `grep -c` inside an `&&` chain when zero matches is the GOOD outcome — grep exits 1 and silently kills the rest of the chain (cost a phantom "module not found").

## 2026-09-03 — ci — repo-ruleset writes need admin authorization the gh token lacks

~~**KEEP**/​**AVOID** as written below~~ — **superseded same day**: the 404 was NOT
authorization. Ruleset updates use **PUT**, not PATCH — GitHub returns 404 for
an unregistered method on a valid path, so PATCH failed even after
`gh auth refresh -s admin:org`. KEEP: check `source_type` on
`GET /repos/{o}/{r}/rulesets` to tell repo- from org-level. AVOID: assume
REST update verbs — the rulesets API is PUT-based.

**KEEP** (do again):
- `gh api /repos/{o}/{r}/rulesets` reads fine with `repo` scope — and check `source_type` ("Repository" vs "Organization") before assuming where a ruleset lives.

**AVOID** (don't repeat):
- Expecting `PATCH /repos/{o}/{r}/rulesets/{id}` to work because the user is repo ADMIN and the token has `repo` — GitHub 404s the write when the browser-issued gh OAuth token lacks effective admin-write authorization. Either change it in the UI, or `gh auth refresh -h github.com -s admin:org` first and retry the API.

## 2026-09-16 — audit — no-fix advisories + the unpackaged vscode audit surface

**KEEP** (do again):
- When one package's audit fails, run `npm audit` (no level floor) in BOTH packages — `packages/vscode` carried 10 more findings the cli-only `audit` CI job never sees.
- Grep the affected chain against the staged VSIX closure before reacting — vsce/eslint/vitest toolchain vulns never reach the shipped runtime (closure is jiti/@cdktf/hcl2json/fs-extra only).
- `git pull` (not just `git fetch`) before branching fix work — a stale local main made this branch born-behind under the strict up-to-date ruleset, and the lockfile fix had to be redone on real main.

**AVOID** (don't repeat):
- Trusting npm's "fix available via `npm audit fix`" on an advisory whose range is `*` — that means NO fixed release exists (braces GHSA-vfj7-8cjw-p6xm, latest 3.0.3 is still in range). Only `audit fix --force` would "fix" it by ripping @vscode/vsce/secretlint majors out of the packaging toolchain. Wait for upstream; the `vscode` CI job deliberately has NO audit step until that chain is clean.
