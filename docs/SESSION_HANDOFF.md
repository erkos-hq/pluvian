# Session handoff — for the next context window

> **Rolling log.** Append a new `## Session N — YYYY-MM-DD` section at the end of each non-trivial session. Don't delete old sections — supersede stale facts in place with a `~~struck~~ superseded YYYY-MM-DD` marker, or move them into `docs/LESSONS.md` under the matching topic tag. Pairs with `docs/LESSONS.md` (two-sided lessons, KEEP + AVOID) and `docs/ROADMAP.md` (backlog + dogfood log). Run `npm run context` from `packages/cli/` for a deterministic state blob.
>
> Read this + `docs/ROADMAP.md` + `docs/LESSONS.md` + `AGENTS.md` to resume.

## Current state (v1.9.37, 2026-08-05)

- **Repo:** `github.com/ealmachado-eng/dotzen` (public). `origin` = GitHub. `gh` CLI is NOT installed — use the GitHub web API or `npm view` for verification.
- **npm:** `@dotzen/dotzen@1.9.37` latest, published via GitHub OIDC + SLSA provenance. **npm no-republish:** once a version number is published (even if unpublished), npm blocks republishing it. Always use a fresh version number after any publish.
- **CI:** `.github/workflows/ci.yml` (Node 24, 801 unit + 40 integration + check-docs + semgrep + gitleaks) — does NOT fire on tags (release.yml owns those). `release.yml` (Node 24 / npm 11, trusted publishing, `--provenance`) has a `gate` job + `publish needs: [gate]`. **Trusted publishing requires Node 24 / npm 11** — Node 20 / npm 10.x silently fails the OIDC token exchange. Don't lower it.
- **Renovate:** onboarded, majors-gated. **typescript major BLOCKED** (`enabled: false` — typescript-eslint doesn't support TS 7 yet; typescript-eslint#10940). Actions majors approved & merged (#6: actions v5→v7, gitleaks v2→v3). TS/deps patch PRs auto-merge. brace-expansion DoS fix already on main via `npm audit fix`. Config is `config:recommended` with no explicit schedule → Mend app ~hourly; existing PRs rebase automatically.
- **Branch protection:** `require-ci-on-main` ruleset (status checks required) + `v*` tag ruleset. Squash-merge.
- **Docs:** full user docs in `docs/user/` (tutorial + how-tos + DSL reference + auto-generated rule catalog via `npm run gen-docs`). ADR at `docs/specs/00-architecture-decision-record.md` documents the archived HCL parser risk + the "own the WASM" future mitigation.
- **144 rules** across 8 presets (`coreSecurity`, `cisAws`, `cisAzure`, `cisGcp`, `pciDss`, `soc2`, `nist80053`, `dataProtection`) · ~3,200 resource/data types · 0 false positives since dogfood round 6, across 35+ real module repos.

## Session arc (v1.9.28 → v1.9.37, 9 releases)

1. **v1.9.29 — Graph layer hardening.** Resource-type-aware edge classification (`classifyEdge(attr, resourceType)` + `STRUCTURAL_REF_BY_TYPE` override — fixes the NAT false chain via `aws_nat_gateway.subnet_id` → structural). CNE for unresolved graph edges. Path detail for `denyIfSharedWith` + `denyIfReachableAttr`. List-edge traversal so `buildGraph` scans `res.lists` (fixes SG-shared on real `.tf`).
2. **v1.9.30–v1.9.31 — Dogfood round 11 (GKE `.member` coverage).** `denyValueExcludedByResourceAttr` returns a definite PASS (not CNE) for bare `google_service_account.*.{member,email,name}` refs — the provider type-system guarantees the value can't equal a public-principal scalar. Dropped the terraform-google-kubernetes-engine module from 15 CNE → 3.
3. **v1.9.32–v1.9.34 — Vocabulary rounds 11–13 + example specs.** Ungoverned-enum closure (aws_eks*, azurerm_monitor_data_collection_*, google_service_networking_connection, kubernetes_config_map_v1_data → `UTILITY_TYPES`). `KNOWN_TYPES` in `normalize.ts` is now derived from the vocab enums. Example specs generated from `src/cli/profiles.ts` via `npm run gen-examples` into `examples/{startup,enterprise,regulated}/.zen/spec.ts`.
4. **v1.9.35–v1.9.36 — Launch README + `dotzen init --profile/--presets`.** README rewritten for launch: ASCII diagrams (mermaid doesn't render on npm), absolute links (relative 404 on npm), Quick Start reordered (init before check — check needs a spec). `prepack` script copies root README → `./README.md` so the tarball ships the current README. `init` grew `--profile {startup,enterprise,regulated}` + `--presets coreSecurity,cisAws,...` (profiles as data, 816 unit tests).
5. **v1.9.37 — Quick Start order fix on npm + CI gating.** release.yml got a `gate` job (Node 24) and `publish needs: [gate]` so a correctness regression can't ship. ci.yml no longer fires on tags.
6. **Post-release (unreleased, on main) — Stryker mutation testing.** Evaluated mutation testing on the engine (`evaluate.ts`: 74.82% score, 438 survived — 180 StringLiteral + mixed logic) and the profiles module (52.85%). Triage found NO real verdict-logic gaps; the skip-optimization cluster in `evaluate.ts` (L2403-2413) is disabled for Stryker via `// Stryker disable` comments. Kept as periodic/on-demand (`npm run mutation`), NOT in the CI gate — runtime + equivalent-mutant noise + the zero-friction thesis. Setup committed: `stryker.conf.json`, `.gitignore`/`.prettierignore` include `reports/`.

## Open questions / advisory answered this session

- **`init --tags`?** User proposed a new flag so the spec is "born with the enum of required tags." Recommendation: **hold off.** The profiles (`enterprise`/`startup`) already ship an `OrgTag` enum + tag rule; the marginal value of pre-filling 3 enum values doesn't justify the new flag + the identifier-derivation codegen (hyphens/dots/dup names) + the awkward composition with `--profile` (both define tags → two tag rules). Reconsider IF tagging clearly emerges as the dominant first-use case; then scope `--tags` to compose with `--presets`/alone only (error if combined with `--profile`).

## Known issues / gotchas (don't re-discover these)

### Permanent facts (not bugs)
- **npm no-republish** (above).
- **HCL parser is archived upstream.** `@cdktf/hcl2json@0.21.0` — source repo `hashicorp/terraform-cdk` is archived. Risk documented in `docs/specs/00-architecture-decision-record.md`. Future mitigation: compile `hashicorp/hcl/v2` to WASM + vendor the `.wasm`. No action now.
- **Strict no-fabrication for vocab additions.** Names must be verified against the provider Go `ResourcesMap` or observed from real `.tf`. Known-verified: `aws_eks*`, `azurerm_monitor_data_collection_*`, `google_service_networking_connection`, k8s types → `UTILITY_TYPES`.
- **GitHub/Markdown constraints.** Mermaid does NOT render on npm. README links must be absolute. Raw HTML unsupported in README. npm README diverged historically; `prepack` now copies root README → `./README.md` so the tarball is current.

### Process reminders
- **check-docs gate:** `npm run check-docs` regenerates + diffs the rule catalog. After ANY preset change, run `npm run gen-docs` + commit, or the gate fails. Same for examples: `npm run gen-examples` after touching `profiles.ts`.
- **Gate (run from `packages/cli/`):** `npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:integration && npm run coverage && npm run check-docs`. Per action: run gates first, then `git add`, commit, tag, push, verify via `npm view` + `npx`.
- **Release flow:** bump `packages/cli/package.json` version → add CHANGELOG entry → commit → `git tag vX.Y.Z` → `git push origin main && git push origin vX.Y.Z` → release.yml publishes via GitHub OIDC + provenance. `gh` CLI is NOT installed — verify via `npm view @dotzen/dotzen version`.

## Immediate next steps (ranked)

1. **Nothing pending a release.** All changes since v1.9.37 are docs/CI/skill/mutation-testing setup (already on main, not version-bearing). Next release = v1.9.38 at user request when a user-facing change lands.
2. **Launch / adoption** — engine is feature-complete + documented + provenance-attested. A Show HN / r/terraform post is the #1 traction lever. Docs + README are launch-ready.
3. **Graph improvements** — essentially complete. Remaining: GCP graph conditions (low-applicability — GCP has no per-resource SGs; existing per-resource conditions cover its public-access controls).
4. **VS Code extension** — inline `.tf` findings (larger lift, high adoption value).

## Key file map

- **Engine:** `packages/cli/src/engine/evaluate.ts` — `buildGraph()` (~L310-520), `evalDenyIfReachable` (~L1935), `evalDenyIfSharedWith` (~L1975), `evalDenyIfReachableAttr` (~L2000), `denyValueExcludedByResourceAttr` (v1.9.31), skip-optimization block L2403-2413 (Stryker-disabled).
- **Normalize:** `packages/cli/src/hcl/normalize.ts` — `KNOWN_TYPES` (derived from vocab enums), `UTILITY_TYPES` silent-skip set, `tryEvalConcat`/`tryEvalTernary`/`tryEvalComparison`, `STRUCTURAL_REF_BY_TYPE`.
- **CLI:** `packages/cli/src/cli/profiles.ts` (profiles as data — startup/enterprise/regulated bundles), `init` command (`--profile`/`--presets`).
- **Stryker:** `packages/cli/stryker.conf.json` (mutate `src/engine/evaluate.ts`, perTest).
- **CI:** `.github/workflows/ci.yml` (no tag triggers), `.github/workflows/release.yml` (`gate` job + `publish needs: [gate]`, actions@v7, `npm publish --provenance`).
- **Docs:** `docs/ROADMAP.md` (status-at-a-glance + dogfood log), `docs/specs/00-architecture-decision-record.md` (HCL parser risk), `docs/user/` (tutorial + how-tos + DSL ref + auto-gen rule catalog).
- **Examples:** `examples/{startup,enterprise,regulated}/.zen/spec.ts` (generated via `npm run gen-examples`).
- **Skills:** `.claude/skills/dotzen-engine-dev/SKILL.md`, `.claude/skills/dotzen-release/SKILL.md` (release.yml snippet synced — gate job + Node 24), `.claude/skills/dotzen-spec-authoring/SKILL.md`.

## How to resume

```bash
cd /Users/ealmachado/projects/dotzen
git pull origin main
# verify state:
npm view @dotzen/dotzen version   # should be 1.9.37
git log --oneline -10             # latest commits
```

Then read `docs/ROADMAP.md` (remaining items + dogfood log) + this file (session context) + `AGENTS.md` (conventions) and pick a direction.

## Session N+1 — 2026-08-11 — session memory harness

**Goal:** close the "agent didn't proactively pull context at session start" gap + the "wins rot, only failures captured" asymmetry. Built the full Tier 1 + Tier 2 + Tier 3 stack from the design discussion.

**Shipped (uncommitted, on `main` working tree):**

- `docs/LESSONS.md` — two-sided append-only log (KEEP/AVOID), 5 seeded entries covering release/parser/CI/engine/process.
- `docs/DECISIONS.md` — one-liner choice log with rejected alternatives.
- `packages/cli/scripts/session-context.ts` + `npm run context` script — deterministic state blob (last tag, drift, npm ver, lesson count).
- `docs/SESSION_HANDOFF.md` — switched from "delete after absorb" → rolling append-only.
- `AGENTS.md` — new "Session bootstrap" section + "Persistence mechanisms" inventory + "When to append to the logs" rules.
- `.opencode/plugins/memory.js` — fires on `experimental.session.compacting`; injects the 4 memory files into compaction context so memory survives context-window compression mid-session.
- `.opencode/plugins/session-state.js` — one-shot reminder on first bash of each session (mirrors `graphify.js` pattern).
- `.githooks/post-commit` + `core.hooksPath = .githooks` — regenerates `.session/state.md` on every commit. Gitignored.
- `CLAUDE.md` — extracted §7's 140-line illustrative condition list (which rotted between releases and explicitly deferred to authoritative sources) into a tight family summary + pointers. 442 → 350 lines, 27K → 20K.
- `.gitignore` — added `.session/`.

**Verified:** typecheck + lint + format + 816 unit tests green. Plugin/hook syntax checked. `npm run context` runs clean. `.githooks/post-commit` writes correct `.session/state.md`. Graphify updated.

**Not done:**
- Aggressive caveman-compress of `CLAUDE.md` — declined as lossy on technical reference; structural trim done instead.
- No release. Nothing here is version-bearing (all meta/tooling/docs).

**Next session resume:** run `npm run context` from `packages/cli/`, grep `docs/LESSONS.md` for the topic, decide direction. If adopting a real engine change, this harness now forces you to see the rolling memory before acting.

## Session N+2 — 2026-08-18 — rebrand recovery + naming sprint (INCOMPLETE — see docs/REBRAND.md)

**Goal:** recover the lost rebranding plan (original discussion died with a pre-harness session) and drive it to a locked name.

**Recovered + decided (full detail in `docs/REBRAND.md`):**
- Trigger confirmed: trademark conflict on "dotzen". Scope: total rebrand (all 6 axes).
- Locked: umbrella **tafros** · pattern **C** (mascot + coined technical name) · mascot **crocodile** · GH `tafros-hq` direction · domain `tafros.dev` direction.
- Naming sprint: ~40 candidates screened (npm + GitHub + DDG common-law). Front-runners: **Squama, Sphragis, Gharial, Erkos**. Sobek was the user's pick but stepped back for zero-risk (Hi-Rez/Smite class-9 adjacency + 4 live USPTO apps). Suchus deprioritized (pronunciation). Animal-type architecture dead on npm.
- Strategy: governance-OS endgame accepted as direction (npx-compatible, NixOS as reference architecture, "pure function of the spec" thesis), launch stays wedge-shaped ("control plane" for buyers, "NixOS for governance" for devs). OS architecture work = DomainAdapter isolation, 3-6mo, post-rebrand.

**Open (blocking Phase C-E execution):**
- Tool name — user holding. Live candidates + screening data in `docs/REBRAND.md` matrix. Don't re-screen; data is current as of 2026-08-11/18.
- Contract-file renames (`dotzen.json`, `.zen/`) — recommend yes, decide with name.
- tafros-hq org / npm org / tafros.dev — unclaimed, user action required.

**Also this session:** model switch prep — glm-5.3 exists only under `zai-coding-plan` provider (not plain `zai`); restart + `/models` → ZAI Coding Plan group, or pin `"model": "zai-coding-plan/glm-5.3"` in config. Session restarted for this.

**Next session resume:** read `docs/REBRAND.md` first. If name locked → Phase C checklist. If still holding → live candidates are Squama/Sphragis/Gharial/Erkos; present, don't push.

## Session N+3 — 2026-09-01 — VS Code spec + full security audit + qs fix

**Goal:** session-start memory recovery, then VS Code extension design, then a full cybersecurity review of the project.

**Shipped:**
- `docs/specs/11-vscode-extension.md` (NEW) — name-agnostic extension design: bundled in-process engine (prereq: export `check` from package index), CLI coexistence, severity/trigger tables, lockstep versioning, Marketplace + Open VSX, P1–P3 phasing gated on rebrand name. Commit `2c3296c`.
- Full security audit (engine src, CI workflows, release pipeline, gitleaks config, SARIF/terminal rendering, dynamic regexes, prototype-pollution vectors): zero critical/high; all 8 dynamic-RegExp sites escape-verified (`parse.ts:43`, `normalize.ts:2487`, `evaluate.ts:1781`); no child_process/eval/vm; OIDC trusted publishing confirmed.
- `packages/cli/package.json` + lockfile — `overrides.typed-rest-client.qs = "6.15.3"` (GHSA-q8mj-m7cp-5q26 moderate DoS; exact pin made `audit fix` a no-op). Dev-only chain via Stryker. Audit → 0 vulns; 816 tests green. Commit `fc12e1d`.
- `docs/LESSONS.md` — audit-gate blind spot + override lesson (in `fc12e1d`).
- Both commits rebased onto Renovate #9 (`5faf4e6`) and pushed to origin/main.

**Deferred / blocked:**
- VS Code extension BUILD — gated on rebrand tool-name decision (`docs/REBRAND.md`; candidates Squama/Sphragis/Gharial/Erkos, user holding).
- Security hardening recs #2–#3: README trust-boundary note (spec.ts exec), C0/C1 control-char strip in `makePaint` (`src/report/report.ts:23`).
- Stale `wip-2026-08-18-1540` tag: its work landed in `ee015a1` — delete it.

**Next resume step:**
- Rebrand decision is the global blocker (name → Phase C → VS Code P1 → launch). Read `docs/REBRAND.md` first; if name locked, run Phase C checklist.

## Session N+4 — 2026-09-01 — docs deep-read + stale user-docs fixes

**Goal:** onboard a fresh agent via a full docs read (all 11 specs + user docs + memory files), then fix the staleness the read surfaced.

**Shipped:**
- Full read-through: specs 00–08/10/11, user docs, REBRAND/ROADMAP/LESSONS/DECISIONS, launch post. Context loaded.
- `docs/user/what-it-does.md` — replaced stale "No multi-hop dependency graph (yet)" bullet (graph layer shipped v1.9.26–29) with the real limit (graph rules are module-scoped; module-output edges are a future iteration, per spec 10); added a topology-aware bullet to the capabilities list; rule counts 140 → 144 (verified against the generated catalog).
- `docs/user/reference/dsl.md` — rewrote the "known edge case" note about NAT-gateway `subnet_id`: resource-type-aware classification shipped in v1.9.29 (`classifyEdge` + `STRUCTURAL_REF_BY_TYPE`, `engine/evaluate.ts:330`).
- Commit `ced968d` "docs(user): fix stale graph-layer claims" pushed to origin/main (owner-push bypass accepted — docs-only, per the 2026-09-01 ci lesson). check-docs gate green.
- LESSONS: docs-staleness entry appended (same date).

**Not done / notes:**
- `dsl.md` has a **pre-existing** prettier warn — root `docs/` is outside the `packages/cli` format gate; left as-is deliberately.
- N+3 deferred security recs still open: README trust-boundary note (spec.ts exec), C0/C1 control-char strip in `makePaint` (`src/report/report.ts:23`), stale `wip-2026-08-18-1540` tag deletion.
- This section + the LESSONS entry are uncommitted by design (`/handoff` never commits — explicit user action).

**Next resume step:** unchanged from N+3 — the rebrand tool-name decision is the global blocker (`docs/REBRAND.md`; live candidates Squama / Sphragis / Gharial / Erkos — present, don't push).

## Session N+5 — 2026-09-01 — rebrand: erkos umbrella locked + Phase D inventory

**Decided:**
- **Umbrella brand = erkos** (user decision; supersedes the 2026-08-18 tafros lock — DECISIONS.md entry added). Derived identities: GH org **erkos-hq** (github.com/erkos taken by an inactive 2011 account — verified; erkos-hq verified open), npm scope **@erkos-hq/<tool>**, domain direction **erkos.dev** (DNS unresolved — verify at registration).
- **Tool name still open** (user holding: "None for now. I'll rebrand the tool name"). Live candidates: Squama / Sphragis / Gharial — all re-verified free on npm 2026-09-01. Gharial's *erkos odonton* tie is restored by the flip; Erkos is no longer a candidate (it's the umbrella).

**Shipped:**
- Full rebrand blast-radius inventory (3 explore agents): **1,063 textual occurrences / 112 files** + filename-only artifacts (43 `dotzen.json`, 46 `.zen/` dirs, `bin/dotzen.js`, 3 `.claude/skills/dotzen-*` dirs). Discovered beyond the original Phase D list: second synthetic ruleId `dotzen.ungoverned` (`report.ts:308`), `DOTZEN_ENV_FILE`/`dotzen.env` + `.gitignore:8`, SARIF driver name (`report.ts:327`), ci-templates emitted YAML, trusted-publisher binding being npm-side repo-identity (not just YAML).
- **Phase D execution playbook embedded in `docs/REBRAND.md`** (18-row coupling table + ordering + clean-files list) — the mechanical rebrand is executable by any future session with zero re-discovery the moment the tool name locks.
- REBRAND/DECISIONS/SESSION_HANDOFF updated per append-only convention (tafros rows superseded with dates, not deleted).

**Blocked on user:**
- Tool name → then Phase C remainder (repo transfer to `erkos-hq/<tool>`, Trusted Publisher registration), Phase D (one branch/PR, squash as v2.0.0 prep), Phase E (publish, deprecate `@dotzen/dotzen`, launch post), VS Code P1.
- Name-independent NOW: create GitHub org **erkos-hq**, npm org **erkos-hq**, optionally register **erkos.dev** (~15 min).

**Next resume step:** read `docs/REBRAND.md` (updated matrix + playbook). If tool name locked → Phase C items 2/4 (repo transfer + TP registration), then execute Phase D from the embedded table.

## Session N+6 — 2026-09-01 — PLUVIAN LOCKED + Phase D executed on `rebrand/v2`

**Decided:** tool name = **pluvian** (user; after 3 screening rounds — see REBRAND.md rounds 1-3). Package **`@erkos/pluvian`**, binary `pluvian`, repo `erkos-hq/pluvian`, contract `.pluvian/` + `pluvian.json`. npm keeps the clean `@erkos` scope (decision entry in DECISIONS.md).

**Phase D EXECUTED** (branch `rebrand/v2`, pushed, tip `4a667cf`; 4 commits to squash):
- Package identity: `@erkos/pluvian@2.0.0`, bin `pluvian` → `bin/pluvian.js`, URLs → `erkos-hq/pluvian`, lockfile regenerated.
- All contract surfaces: jiti alias `@erkos/pluvian` (load.ts), `pluvian.json`/`.pluvian/` discovery (config.ts), scaffold output, `PLUVIAN_REQUIRES_APPROVAL`/`PLUVIAN_ENV_FILE`/`pluvian.env`, ruleIds `pluvian.module-following`+`pluvian.ungoverned`, `# pluvian:ignore`, SARIF driver `@erkos/pluvian`, ci-templates, internal identifiers `EngineError`/`EngineConfig`/`readEngineConfig`.
- 93 on-disk renames (43 pluvian.json, 46 .pluvian/, bin, 3 skill dirs); generators re-run; docs sweep (historical logs preserved w/ dated notes); CHANGELOG 2.0.0 w/ migration checklist; README brand line (crocodile-bird story).
- **Full gate green: typecheck, lint, format, 816 unit + 40 integration, coverage, check-docs.** Repo-wide audit: zero `dotzen` refs outside historical logs. Graphify updated.
- One accident fixed in-branch: `git add -A` briefly committed the untracked tooling dirs (75 files); untracked again — untracked set now identical to pre-branch.

**Blocked on user (Phase C + merge + Phase E):**
1. Create GitHub org **erkos-hq**; create npm org **erkos**; optionally register **erkos.dev**.
2. Transfer repo → `erkos-hq/pluvian`; `git remote set-url origin https://github.com/erkos-hq/pluvian.git`.
3. Register Trusted Publisher on npm: `@erkos/pluvian`, owner=erkos-hq, repo=pluvian, workflow=release.yml (else publish fails ENEEDAUTH at tag time).
4. Open PR: `https://github.com/ealmachado-eng/dotzen/compare/main...rebrand/v2` → squash-merge AFTER the transfer (so new links resolve on landing).
5. Phase E: tag `v2.0.0` → publish w/ provenance → verify → `npm deprecate @dotzen/dotzen@*` → re-record demo GIF (demo.tape updated; the gif still shows old output) → launch post rewrite/post.
- Note: VS Code extension P1 (spec 11) unblocks after merge.

## Session N+7 — 2026-09-02 — v2.0.0 SHIPPED: dotzen → @erkos/pluvian

**Shipped:**
- PR #12 squash-merged (`834d8fe`); tag `v2.0.0`; **`@erkos/pluvian@2.0.0` published with SLSA provenance** (trusted publishing, fully tokenless); `@dotzen/dotzen@*` deprecated with migration pointer. Repo live at `github.com/erkos-hq/pluvian`.
- En route fixes (all in the squashed PR): fast-uri HIGH advisories (`npm audit fix`, lockfile-only); **gitleaks job → direct checksum-pinned v8.30.1 binary** (gitleaks-action demands a per-org license after the transfer; free key from gitleaks.io must match org name exactly — see LESSONS 2026-09-02).
- **Demo GIF re-recorded** against the published package (pluvian branding, clean output; tape: `--yes` on the visible command, portable `cd demo`, 30s pre-warm) — on branch `docs/demo-gif` (org ruleset now REQUIRES PRs; no more owner bypass).

**Org-transfer facts (new):**
- Org rulesets decline direct main pushes (no inherited owner bypass) — everything is PRs now unless a bypass list is added in org Settings → Rules.
- Renovate did NOT follow the transfer — install the app on `erkos-hq` or dep updates silently stop.
- PAT needs `workflow` scope for workflow-file pushes.

**Remaining (next session):**
1. ~~Merge `docs/demo-gif` (PR via compare link) — README embed then shows pluvian.~~ (done — merged as #13, `2e0bfb5`)
2. Launch-post rewrite for pluvian (`docs/launch/launch-post.md` — name-swept only) + actually post (Show HN / r/terraform).
3. ~~Renovate install on `erkos-hq`~~ (done — superseded 2026-09-03); optionally re-request GITLEAKS_LICENSE for org `erkos-hq` and restore the action.
4. ~~VS Code extension P1 (spec 11; prereq: export `check` from the package index — its own version-bearing release).~~ (done — N+8, 2026-09-03)
5. Optional: register erkos.dev.

## Session N+8 — 2026-09-03 — VS Code extension P1 SHIPPED + v2.1.0

**Goal:** understand the project whole, then build the VS Code extension P1 (spec 11) as two PRs feeding one v2.1.0 release.

**Shipped:**
- **PR #14** (`04148ff`) — engine public API: `check` + `CheckReport`/`Violation`/`Unevaluable`/`EngineError`/`Result` types + `readEngineConfig` exported from `packages/cli/src/index.ts`; `check(opts.enforcePin)` (false = run despite a `pluvian.json` version-pin mismatch — the extension's notify-and-run policy); `./package.json` subpath export; `tests/integration/fixtures/version-pin/` + 4 integration tests.
- **PR #15** (`6ab3164`) — `packages/vscode` (spec 11 P1): pure `diagnostics.ts`/`engine-bridge.ts`/`debounce.ts` + `extension.ts` glue; severity per spec table; CNE Hint default-on, ungoverned behind setting; 16 tests incl. real in-process `check()` vs `demo/` + lockstep version guard; **staged-closure VSIX packaging** (`scripts/package.mjs` — engine as REAL files: jiti `__dirname` alias + hcl2json WASM can't be esbuild-inlined; `file:../cli` breaks vsce's `npm list`) + **VSIX smoke gate** (`scripts/smoke.mjs` — unzip + run bundled engine vs `demo/`) + `vscode` CI job in `ci.yml`.
- **v2.1.0 released** — tag pushed; gate+publish green; `@erkos/pluvian@2.1.0` on npm with SLSA provenance (verified via `npm view`).
- **PR #16** (`c017a96`) — Renovate esbuild ^0.28.0 (vscode devDep; already lock-resolved, spec alignment only).
- **PR #17** (`054d05a`) — CodeQL High alert #8 (`js/file-system-race`, `gen-examples.ts`) fixed via read-directly-ENOENT; alert state now `fixed`, 0 open code-scanning alerts. Other cleared `existsSync` sites deliberately untouched.
- **Ruleset:** `require-ci-on-main` (repo-level, id 20022018) now requires the `vscode` check — added via API **PUT** (PATCH 404s — GitHub returns 404 for an unregistered method on a valid path; LESSONS entry supersedes the wrong token-blame diagnosis).
- **PR #18** (`a9b6006`) — memory docs (ruleset PUT lesson; Renovate-done strike).
- **gh CLI adopted** this session (`brew install gh`): PR create/checks/merge all via gh; token now carries `admin:org`.
- **Advisory (no repo change):** consulting-company partnership discussion — protect via trademark registration (pluvian, classes 9+42) + certified-partner agreement (trademark license + revenue share + non-circumvention) + open core (FSL for spec-05 surfaces) + CLA; fork risk assessed low (maintenance treadmill is the moat). No decision taken; thread open.

**Deferred / blocked:**
- **VS Code P2** — ignore Quick Fix, multi-root workspaces.
- **VS Code P3** — Marketplace + Open VSX publish (needs publisher account, `VSCE_PAT`, OVSX token; final marketplace id decided then — manifest is `pluvian-vscode`/publisher `erkos`).
- Launch post rewrite/post for pluvian (`docs/launch/launch-post.md`) — still the #1 traction lever; natural pairing with P3 (extension installable at launch).
- N+3 leftovers still open: README trust-boundary note (spec.ts exec), C0/C1 control-char strip in `makePaint` (`packages/cli/src/report/report.ts:23`), stale `wip-2026-08-18-1540` tag deletion.
- Optional: register erkos.dev.

**Next resume step:**
- `npm run context` from `packages/cli/`; pick between launch post (P3-pairing recommended: publish the VSIX, then post) or VS Code P2. Engine/CI/ruleset current; nothing mid-flight (no WIP tag — clean tree; this section + the DECISIONS line below are uncommitted by design, per `/handoff`).


## Session N+9 — 2026-11-12 — consolidated: Sep–Nov maintenance + v2.2.0 + charax design sprint

**Goal:** (consolidated — four working sessions since N+8 ended without handoff sections; reconstructed from git log #23–#38. LESSONS entry appended about exactly this.)

**Shipped:**
- **Audit clears ×2:** Sept (#24: qs override 6.16.0 itself entered the advisory range → 6.17.1 both manifests, vitest 4.1.12; the September no-fix `braces` advisory cleared upstream) and Oct (#27, same playbook). Both packages audit 0; `vscode` CI job still has no audit step (fine while clean).
- **Renovate majors via dashboard (#2):** #29 Node 26 (ci + release runners; **trusted publishing + SLSA provenance verified live on Node 26 at v2.2.0** — the old Node-pin worry is closed), #30 dev-dep majors (vitest 5, Stryker 10, @types/node 26, vsce 4) + **package.mjs hoisting fix** (staged closure now resolves deps from packages/cli/dist instead of assuming flat node_modules — LESSONS "hoisting is not a contract").
- **TS 7 recheck (#32):** GA since Jul 2026 but no compiler API → typescript-eslint cannot support (#12518); Renovate block stays; recheck on tsgolint news. DECISIONS updated.
- **ROP review + fix (#35):** two escaped exceptions closed — `ConfigInvalid {path, detail}` EngineError variant (malformed/unreadable pluvian.json) + `parseDir` readFileSync moved inside the guard (TOCTOU → ParseFailed). tsc exhaustiveness found two consumers the analysis missed (report.ts renderError, extension describeError). First direct unit coverage of readEngineConfig; config.ts line coverage 42→71%.
- **v2.2.0 RELEASED (#36, tag `v2.2.0`):** npm latest 2.2.0, SLSA provenance verified; smoke.mjs now derives the VSIX name from package.json (hardcoded `pluvian-2.1.0.vsix` broke on the first bump — LESSONS). Release lessons in #37.
- **npm registry hygiene:** `2.0.0-rc.1` deprecated with pointer + stale `next` dist-tag removed (user ran with OTP; this shell cannot complete 2FA).
- **Docs sweep (#38):** two `npx @pluvian` rebrand leftovers fixed in `read-the-output.md`; ROADMAP at-a-glance refreshed (822+45 tests, public library + extension noted).
- **charax design sprint (no repo changes — advisory):** naming screened (npm/GitHub/common-law): finalists **charax** (χάραξ, palisade stake; χαρακτήρ "the identifying stamp" etymology; pluvian-grade clean) and **pylae** (πύλαι, gates); `kleido` killed by Kaleido.io (IAM-adjacent phonetic twin) + Arm Kleidi. Recommendation: **fort route** (erkos scene absorbs the animals; enterprise identity buyers; systematic namespace) over animal route; **not locked — user holding**. Capability map sketched: escalation detection = stateful reachability + technique catalogs as presets; dataset flywheel (engine-as-oracle over synthetic identity graphs); agentic scope-creep = the white space. DSL verdict: keep fluent interface for both tools (preserve sugar→IR boundary for charax; fix per-resource narrowing someday); ROP verdict: right choice, keep for charax.

**Deferred / blocked:**
- **VS Code P3** — user must create Marketplace publisher + Open VSX account (+ VSCE_PAT/OVSX secrets); then publish pipeline, final marketplace id (manifest `pluvian-vscode`/`erkos`), icon/README; a 2.2.0 VSIX is already buildable via `npm run package`.
- **Launch post** (`docs/launch/launch-post.md`) — pair with P3.
- VS Code P2 (ignore Quick Fix, multi-root).
- N+3 leftovers still open: README trust-boundary note, C0/C1 strip in `makePaint` (`packages/cli/src/report/report.ts`), stale `wip-2026-08-18-1540` tag.
- charax: name decision + `@erkos/charax` npm reservation — user holding; trademark filing (classes 9+42) and erkos.dev still optional open threads.

**Next resume step:**
- `npm run context` from `packages/cli/`; the user-side blockers are the P3 accounts (Marketplace + Open VSX) — everything code-side is ready. If charax name gets locked instead: reserve scope, DECISIONS entry, then design doc (IR first, builder second).
