# How to use the VS Code extension

> **Audience:** anyone who wants findings in the editor while the Terraform
> is being written — by a human or an AI agent — instead of one CI job
> later. Same engine, same spec, same verdicts as the CLI.

## Install

Search **"pluvian"** in the VS Code Extensions panel, or install
[`erkos.pluvian-vscode`](https://marketplace.visualstudio.com/items?itemName=erkos.pluvian-vscode)
from the Marketplace. Nothing else: the engine ships inside the extension
(no local Node/npm, no `pluvian` CLI install).

## Open the right folder

The extension wakes up when the workspace contains a `pluvian.json` — two
layouts work:

- **Project folder directly**: `File → Open Folder` on the directory that
  contains `pluvian.json` + `.pluvian/spec.ts` (the same directory you'd
  run `npx @erkos/pluvian check` from).
- **Parent folder / multi-root**: open a folder that *contains* pluvian
  projects in subdirectories, or add several project folders to one
  workspace (`File → Add Folder to Workspace…`). Each discovered project
  is checked independently (isolated `var`/`local` scope, like the CLI's
  multiple roots) and findings are aggregated in one Problems panel.

No `pluvian.json` anywhere? The extension stays dormant — the command
palette entry explains how to scaffold one instead of erroring.

## What you see

- **Squiggles on `.tf` files**, updated on save (~0.5s debounce):
  red for `block` violations, yellow for `warn`, blue for
  `require_approval` (hover shows the named approvers), faded hints for
  could-not-evaluate gaps. Ungoverned resource types appear as hints only
  with the `pluvian.showUngoverned` setting on (off by default).
- **Status bar** `pluvian ✓ n · ✗ n · ? n` (passed · violations ·
  could-not-evaluate; `⚠ n` if any project failed to run). Click to
  re-check everything.
- **Problems panel** groups findings per file and severity; the full
  per-project report goes to the **pluvian output channel**.
- **Ignore directive**: `# pluvian:ignore: <reason>` on the line above a
  block (or trailing it) suppresses that block's findings — the editor
  view updates on the next save, same as CI. Faster: put the cursor on a
  finding and hit `Cmd+.` (💡) — the Quick Fix inserts a **rule-scoped**
  directive (`# pluvian:ignore <ruleId>: <reason>`) above the block; fill
  the `<reason>` placeholder and save.

## Editor and CI never disagree

The extension bundles the same engine version as its own package version
(lockstep) and honors the same `pluvian.json` version pin: if the pin
doesn't match the bundled engine, you get one notification suggesting you
align — it never blocks the check, and the CLI/CI keep refusing on
mismatch as they should.

## Troubleshooting

- **"command 'pluvian.checkProject' not found"** — the workspace has no
  `pluvian.json` (root or subfolders); the friendly message says the same
  after a reload. Open a project folder or scaffold one with
  `npx @erkos/pluvian init`.
- **Import squiggle in `spec.ts`** (`TS2307: Cannot find module
  '@erkos/pluvian'`) — that's the TypeScript language server, not pluvian;
  the check runs regardless. For autocomplete on the DSL, install the
  types locally in your project: `npm i -D @erkos/pluvian`.
