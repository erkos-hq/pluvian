# Decisions — rolling log

> One line per non-trivial choice. Append-only. For locked architectural decisions see `docs/specs/00-architecture-decision-record.md`. For two-sided lessons (KEEP/AVOID) see `docs/LESSONS.md`.
>
> Shape: `YYYY-MM-DD — <topic> — <choice>. Why: <reason>. Rejected: <alternative>.`

## 2026-08-05 — release — `publish needs: [gate]` in release.yml
Choice: gate job runs full correctness suite before `npm publish --provenance` can start. Why: caught Quick Start order regression pre-publish. Rejected: trust CI on push — CI is non-blocking on tag pushes.

## 2026-08-05 — release — Node 24 / npm 11 pin on release workflow
Choice: pin release workflow to Node 24 / npm 11. Why: trusted-publishing OIDC token exchange silently fails on Node 20 / npm 10.x. Rejected: match ci.yml's matrix — release is single-target.

## 2026-08-06 — ci — CodeQL semantic analysis added
Choice: add CodeQL `security-and-quality` suite on JS/TS, with `workflow_dispatch` on every gating workflow. Why: 5 real findings on first run (3 tainted-template, 1 unanchored regex, 1 formatting). Rejected: Semgrep-only — already in gate, but CodeQL catches different shapes.

## 2026-08-08 — parser — HCL `${...}` built via concatenation, not template strings
Choice: build interpolation strings via concatenation in `normalize.ts`. Why: CodeQL #1-3 flagged template forms as tainted-template even though exploitation requires engine input. Concatenation is the safe shape. Rejected: disable the rule with `// nosec` — would hide future regressions.

## 2026-08-11 — process — session memory harness
Choice: add `SESSION_HANDOFF.md` (rolling) + `LESSONS.md` (KEEP/AVOID) + `DECISIONS.md` (this file) + `npm run context` + opencode compaction plugin + `.githooks/post-commit` writing `.session/state.md`. Why: agent didn't proactively pull context at session start — auto-injection closes that gap. Rejected: a single big CLAUDE.md — too long to skim, agent skips sections.

## 2026-08-18 — brand — Pattern C (mascot + coined technical name)
Choice: package/CLI gets a coined technical name; beast + character name live in marketing/docs only. Why: character-as-package (B) is weak trademark + enterprise-tone risk; marketing-only beast (A) loses narrative integration. Rejected: B (Sotiris-as-package), A (no character).

## 2026-08-18 — brand — tafros stays umbrella; erkos demoted to tool-name candidate
Choice: keep tafros (moat) as the umbrella brand. Why: beast-in-moat narrative only works with the moat; erkos-as-umbrella breaks the crocodile story and costs a mental-model rebuild. Erkos survives only as a first-tool name option. Rejected: erkos as umbrella (identity-tie with gharial was poetic but not worth losing the moat).

## 2026-09-01 — vscode-ext — engine delivery
Choice: bundle engine in-process (import `check()` in the extension host). Why: zero user setup, no version-skew subprocess surface; prereq = export `check` + finding types from the package index. Rejected: spawning user-installed CLI (breaks zero-friction thesis); LSP server (overkill, single editor).

## 2026-09-01 — vscode-ext — versioning
Choice: extension version lockstep with engine, cut from the same tag. Why: one number, coherent `dotzen.json` pin semantics. Rejected: independent extension semver (two numbers to juggle, more pin-mismatch warnings).

## 2026-09-01 — vscode-ext — build timing
Choice: park build until rebrand name locked; design captured in `docs/specs/11-vscode-extension.md`. Why: extension id/publisher/icon/README are brand-bearing; marketplace renames painful. Rejected: placeholder-id build now.

## 2026-09-01 — vscode-ext — distribution
Choice: Marketplace + Open VSX at publish time. Why: covers Cursor/Windsurf/VSCodium where AI-Terraform authors disproportionately are. Rejected: Marketplace-only.

## 2026-09-01 — deps — qs override vs wait
Choice: scoped `overrides` forcing qs 6.15.3. Why: `typed-rest-client@2.3.1` pins qs exact so no semver-compatible fix exists; dev-only chain, zero runtime risk. Rejected: waiting for upstream; leaving the moderate (CI gate is high-level).

## 2026-09-01 — brand — umbrella flipped tafros → erkos
Choice: erkos (ἔρκος, enclosure/rampart) is the umbrella brand. Why: user decision — perimeter/fortification semantics fit governance directly; supersedes the 2026-08-18 tafros-umbrella entry (beast-in-moat narrative consciously given up; crocodile mascot survives). Derived handles follow: GH org erkos-hq (github.com/erkos taken by an inactive 2011 account — verified), npm @erkos-hq/<tool>, domain erkos.dev. Rejected: keeping tafros; bare `erkos` GitHub handle (unavailable).

## 2026-09-01 — brand — tool name locked: pluvian; npm scope @erkos
Choice: pluvian (Pluvianus aegyptius, Herodotus's crocodile bird); package @erkos/pluvian, repo erkos-hq/pluvian. Why: the only candidate that partners with the locked crocodile mascot — the bird that cleans the beast's teeth = the check running inside the AI agent's loop; purest Pattern C (coined technical name, beast stays in marketing); low risk (npm free; DDG: French marketing agency + academic GUI in other industries/forms). npm keeps the clean `erkos` scope (npx command = #1 adoption surface; scope ownership = squat protection) while GitHub keeps the forced `-hq` — asymmetry accepted. Rejected: squama (safe but story-less), gharial (narrative but pronunciation drift), agger (terra-pun but Dagger-adjacent), scute/sphragis/erne/numida/tutela (prior use / friction), @erkos-hq npm scope (mirrors a forced fallback).

## 2026-09-03 — engine — check(opts.enforcePin) for the extension's notify-and-run policy
Choice: `enforcePin: false` runs the check despite a pluvian.json `version`-pin mismatch (default `true` = refuse, unchanged for CLI/CI). Why: an editor must never refuse to show what it can — the extension surfaces the mismatch itself (any difference → one notification, per spec 11). Rejected: extension stripping the `version` field before calling (mutates user config); a separate unchecked-check entry point (API duplication).

## 2026-09-03 — vscode-ext — engine ships as real files via staged closure, not bundled
Choice: `packages/vscode/scripts/package.mjs` stages the runtime closure (engine `dist`+`package.json`, jiti, @cdktf/hcl2json, fs-extra chain) into `.vsce-pack/` with real pinned dep specs, then runs `vsce package` there. Why: the engine's jiti spec-loader aliases `@erkos/pluvian` via a `__dirname`-relative path and hcl2json carries WASM assets — neither survives being esbuild-inlined; the `file:../cli` link breaks vsce's `npm list` (the engine's qs override is foreign to that root) and `--no-dependencies` drops node_modules wholesale. Rejected: esbuild-bundling the engine (alias + WASM hazards); `.vscodeignore` `!` negations (vsce's built-in node_modules exclusion wins); mirroring the engine's overrides into the extension root (npm ignores foreign-root overrides for linked trees).

## 2026-09-03 — vscode-ext — module-finding squiggle targets the LAST ` › ` hop
Choice: `physicalFile()` in the extension takes the last ` › `-separated segment minus the `(label)` suffix. Why: ground-truth probe shows findings carry `<root> › <module file> (label)` — the resource lives in the LAST hop's file. The CLI's ignore-matching split (FIRST segment) serves a different job (root-keyed suppression) and is deliberately not unified with it. Rejected: reusing check.ts's `physicalFile` (squiggles would point at the root directory).

## 2026-09-03 — vscode-ext — manifest name `pluvian-vscode` (unscoped)
Choice: unscoped manifest name `pluvian-vscode`, publisher `erkos` (id `erkos.pluvian-vscode`). Why: vsce rejects scoped names; P3 owns the final marketplace id anyway, so no reason to claim `pluvian` pre-publish. Rejected: `pluvian` (would pre-commit the marketplace id before the P3 naming pass); keeping `@erkos/pluvian-vscode` (vsce: invalid extension name).

## 2026-11-06 — deps — typescript major stays Renovate-blocked (rechecked)
Choice: keep `enabled: false` on the typescript major. Why: TS 7 (Go compiler) GA'd 2026-07-08 but ships NO compiler API — typescript-eslint cannot support it (#12518 supersedes #10940 as the tracking issue); our lint gate is type-aware. Recheck when typescript-eslint announces TS 7 support (tsgolint path). Rejected: the tsgo-for-typecheck + TS-5-for-eslint split — toolchain complexity for a typecheck that already takes seconds.
