# 11 — VS Code Extension (in-editor findings)

Status: **P1 BUILT (2026-09-03), unpublished.** `packages/vscode` exists —
diagnostics, watchers, command, status bar, staged-closure VSIX packaging +
smoke gate in CI. Marketplace/Open VSX publishing is P3 (publisher account,
`VSCE_PAT`, OVSX token — not started). ~~Designed, not built.~~
~~Build is gated on the rebrand name decision~~ (superseded 2026-09-01 —
pluvian locked; manifest name `pluvian-vscode`, publisher `erkos`,
final marketplace id decided at P3). Everything below is the as-built
design; deviations from the original text are marked inline.

## The problem

pluvian today has two surfaces: the CLI (`npx @erkos/pluvian init/check`) and CI
(SARIF in GitHub/GitLab). Both are pipeline-shaped — findings arrive after a
commit or a push. The gap is the edit loop: the moment an LLM (or a human)
writes `publicly_accessible = true`, there should be a squiggle in the editor,
not a red CI job an hour later. The extension closes that loop with zero new
concepts — same engine, same spec, same verdicts.

## Non-goals

- **Not a spec editor.** `.pluvian/spec.ts` stays authored in TypeScript with
  existing tooling; the extension does not validate rule DSL as you type
  (beyond what a TS language server already gives for free).
- **Not a Terraform language server.** No completion, no formatting, no
  `terraform validate` — Terraform's own extension owns that. We only produce
  diagnostics.
- **Not an auto-fixer.** The engine is a judge, not a rewriter. The one
  mutation offered is the `# pluvian:ignore` directive (a deliberate human
  decision, which is the product's thesis).

## Architecture

One monorepo package:

```
packages/vscode/
  src/extension.ts       # activate: watchers, command, status bar
  src/engine-bridge.ts   # import { check } from the engine package
  src/diagnostics.ts     # CheckReport → vscode.Diagnostic[]
  src/codeactions.ts     # quick-fix: insert `# pluvian:ignore <ruleId>`
  esbuild.js             # bundle extension host code
```

### Engine delivery: bundled, in-process

The extension runs the engine **in-process in the extension host** by importing
the same library the CLI uses:

- `check(projectRoot, engineVersion)` (`packages/cli/src/cli/check.ts`) is a
  clean async `Result<CheckReport, EngineError>` with no process-state —
  directly callable from the extension host (Node runtime).
- Dependencies are Node-compatible already: `jiti` for spec loading,
  `@cdktf/hcl2json` (WASM) for parsing. No subprocess, no `npx` spawn, no
  user-side Node/npm requirement.
- **Prerequisite change:** the engine package's `exports` currently surfaces
  only the DSL (`src/index.ts`). The extension needs `check` (and the
  `CheckReport` / finding types) exported from the package index — a small,
  additive public-API change, itself version-bearing (its own release).

Rejected alternatives:

- **Spawn the user-installed CLI** (`pluvian check --format json`) — respects
  the pin exactly, but requires local install (breaks the zero-friction
  thesis), adds process plumbing, and introduces CLI/extension version skew as
  a failure mode.
- **LSP server** — overkill for a push-diagnostics linter; VS Code is the only
  targeted editor. Revisit only if a second editor (Neovim/Helix) becomes a
  real request; the bridge layer keeps that door open by isolating
  `CheckReport → Diagnostic` mapping.

### Coexistence with the CLI

Not either/or — both are faces of one engine package:

```
@pluvian/<name> (npm)
   ├── bin/<name>            # CLI: npx init/check — CI, terminal, pipelines
   └── library export        # VS Code extension imports the same check()
contract shared by both: pluvian.json pin + .pluvian/spec.ts + # pluvian:ignore
```

CI keeps `npx … check`; developers get squiggles in-editor. Verdicts are
identical because the engine is identical — an in-editor pass can never
diverge from the pipeline pass.

## Behavior

| Trigger | Action |
|---|---|
| `.tf` file save/open (debounced ~500ms) | full `check()` run on the workspace project; diagnostics pushed to all open `.tf` editors |
| `.pluvian/spec.ts` or `pluvian.json` change | re-run (spec edits must reflect immediately) |
| Command: `<name>: Check Project` | force run; summary in output channel |

- Full-project runs (not single-file): module-following, graph conditions, and
  project-level conditions (`requireResource`) are only correct over the whole
  root set. Debounce + the engine's measured speed (~195ms / 1200 resources)
  make this cheap enough for save-triggered runs.
- Findings carry `file:line` (block start) — maps 1:1 to `vscode.Diagnostic`
  ranges. Project-level findings (`<project>:0`) surface only in the output
  channel / status bar, mirroring the SARIF zero-location convention.
- Trace suffixes (`env/prd › modules/rds/main.tf (db_bad)`) ride in the
  diagnostic `source`/`relatedInformation`, not the range.

### Severity mapping

| Engine outcome | VS Code severity |
|---|---|
| violation, `block` | Error |
| violation, `warn` | Warning |
| `require_approval` | Information (+ approvers in message) |
| couldNotEvaluate | Hint (`?` — visibility discipline preserved) |
| ungoverned | Hint, behind an off-by-default toggle |

Status bar item: `✓ n · ✗ n · ? n` (passed / violations / could-not-evaluate),
clicking opens the full report in an output channel — the terminal renderer's
information model, one click deeper.

### Version pinning

`pluvian.json` pins an engine version (`enforceVersion`). The extension knows
both the pin and its bundled engine version:

- pin satisfied by bundled engine → run, silent.
- pin ≠ bundled → **run anyway**, but surface a non-blocking notification
  ("spec pins 1.9.37, extension bundles 1.9.38 — align to keep editor and CI
  verdicts identical"). Never silently diverge; never refuse to run.

### Quick fix: ignore directive

The only code action: on a finding, offer *Insert `# pluvian:ignore`* — inserts
`# pluvian:ignore <ruleId>: <reason placeholder>` on the block, which the
engine already honors on the next run (check.ts applies directives by physical
file + block-start line). The reason placeholder forces the human to justify —
the directive is a decision, not a dismiss button.

## Versioning

**Lockstep with the engine.** Extension version == bundled engine version,
cut from the same tag. One product, one number; `pluvian.json` pin semantics
stay coherent ("extension bundles 1.9.38, your pin ≥1.9.30 ✓"). Cost: an
extension-only UI fix bumps a number that *looks* like an engine change —
the changelog entry says "extension-only". (Independent extension semver was
considered and rejected: two numbers to juggle, more frequent pin-mismatch
warnings, no upside for a single-engine product.)

## Deployment / distribution

1. **Build:** `vsce package` (esbuild-bundled, `.vscodeignore`-trimmed VSIX).
2. **Publish (CI):** dedicated workflow job — tagged releases run
   `vsce publish` with `VSCE_PAT` from repo secrets, lockstep with the npm
   release tag. Same gate discipline as `release.yml` (publish `needs: gate`).
3. **Marketplace + Open VSX** (`ovsx publish`, separate token) — covers
   VSCodium, Cursor, and Windsurf users, which is where AI-Terraform authors
   disproportionately are.
4. **VSIX attached to the GitHub release** for manual/sideloading.

## Phasing

- **P1 (MVP): ✅ DONE (2026-09-03).** export `check` + finding types from
  the engine package index (PR #14, version-bearing 2.1.0); `packages/vscode`
  (esbuild glue-bundle, staged-closure packaging via `scripts/package.mjs`,
  smoke gate via `scripts/smoke.mjs`); diagnostics + command + status bar;
  bridge proven in-process against `demo/`. *Deviation from plan: engine
  delivery is "staged real files in the VSIX", not a single esbuild bundle —
  see the packaging scripts; the jiti alias and hcl2json WASM require real
  files.*
- **P2:** ignore Quick Fix; ~~ungoverned/couldNotEvaluate visibility toggles
  *(the toggles shipped in P1 via settings; the Quick Fix and multi-root
  remain)*~~; ~~multi-root workspaces~~ (**DONE 2026-11-23, v2.3.0**: multi-root
  AND nested discovery — `discoverProjects()` finds projects per workspace
  folder or nested under an opened parent, activation via
  `workspaceContains:**/pluvian.json`, per-project isolated runs with
  aggregated diagnostics/status; pure discovery module unit-tested). The
  ignore Quick Fix remains the open P2 item.
- **P3:** CI publish pipeline (Marketplace + Open VSX), listing icon/README.

## Open decisions (at build time)

- ~~Placeholder publisher/id if rebrand still unresolved when P1 starts~~
  (resolved: `erkos` / `pluvian-vscode`; final marketplace id at P3).
- Whether couldNotEvaluate diagnostics default-on in-editor or output-channel
  only — **resolved 2026-09-03: default-on, severity Hint** (setting
  `pluvian.showCouldNotEvaluate`), per the "gaps must be visible" discipline.
