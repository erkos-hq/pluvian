<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

## Session bootstrap

At the start of every new session, before doing substantive work, run **one** of these:

```bash
npm run context    # from packages/cli/ — prints a deterministic state blob
```

Or by hand:

```bash
git describe --tags --abbrev=0                # last release tag
git log --oneline <tag>..HEAD                 # what landed since
git rev-parse --short HEAD origin/main        # local vs remote drift
npm view @erkos/pluvian version               # what's on npm
```

Then read:
- `docs/SESSION_HANDOFF.md` — current state (rolling log; don't delete)
- `docs/LESSONS.md` — **grep for the topic you're about to touch.** KEEP + AVOID entries; two-sided memory so wins don't rot and mistakes aren't repeated.
- `docs/ROADMAP.md` — backlog + dogfood log

**Repo shape:** two packages, both CI-gated, versions lockstep — `packages/cli` (the `@erkos/pluvian` engine, npm-published) and `packages/vscode` (the VS Code extension bundling that engine; VSIX packaging via `npm run package` + smoke via `npm run smoke`, both from `packages/vscode/`).

Do this proactively on the first user message of a session — don't wait to be asked.

### Persistence mechanisms (already wired)

- **opencode plugins** (`.opencode/plugins/`):
  - `graphify.js` — one-shot reminder to query the knowledge graph on first bash call of a session.
  - `session-state.js` — one-shot reminder to run `npm run context` + grep `docs/LESSONS.md` on first bash call.
  - `memory.js` — fires on `experimental.session.compacting`; injects the rolling memory files (`SESSION_HANDOFF.md`, `LESSONS.md`, `DECISIONS.md`, `.session/state.md`) into the compaction context so memory survives context-window compression mid-session.
- **post-commit hook** (`.githooks/post-commit`, wired via `core.hooksPath = .githooks`): regenerates `.session/state.md` on every commit. Gitignored (derived).
- **WIP tags:** before closing a session mid-task, `git tag wip-$(date +%Y-%m-%d-%H%M)`. Resume with `git checkout wip-<tab>` or read off `git tag --list 'wip-*'`. Delete stale WIP tags after merging the work.

### When to append to the logs

The trigger matters. **Append LESSONS/DECISIONS as the event happens** — don't defer to session end (deferral is how memory rots). SESSION_HANDOFF is the only end-of-session write.

- **`docs/LESSONS.md`** — append **immediately** after any non-trivial fix, release, or "won't make that mistake again" moment. Two-sided: `KEEP` (do again) + `AVOID` (don't repeat). Tag by topic. If you ship a fix and the session dies one minute later, this entry must already be on disk.
- **`docs/DECISIONS.md`** — append **immediately** when making a non-obvious choice with a rejected alternative. One-liner.
- **`docs/SESSION_HANDOFF.md`** — append a summary section when the user signals end ("wrapping up" / "end of session" / `/handoff`) OR when starting a distinct new task in the same session. Don't delete prior sections. Mid-task exit → also `git tag wip-$(date +%Y-%m-%d-%H%M)`.

Safety net: if everyone forgets, the `memory.js` compaction plugin re-injects whatever's already on disk into the next compaction. Worst case = no new entries this session; prior entries + current git state still flow forward.

### `/handoff` command

Run `/handoff` (or tell the user to) when closing a session. Two surfaces, same procedure: the opencode command (`.opencode/commands/handoff.md`) and the ZCode skill (`.agents/skills/handoff/SKILL.md`). Both append the SESSION_HANDOFF section (the skill mandates appending after the LAST LINE of the file — never anchor an edit on an existing session header), mine the session for unrecorded LESSONS/DECISIONS entries, and tag WIP if work is unfinished. Neither commits — that stays an explicit user action.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
