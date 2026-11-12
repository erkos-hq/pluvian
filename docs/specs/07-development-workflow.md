# 07 — Development Workflow (TDD + quality/security gate)

Status: **Decided.** This document defines *how pluvian itself is built*:
test-driven development as the mandated authoring loop, and a standing
quality/security gate that runs on every change — locally via Claude
subagents for fast feedback, and in GitHub Actions as the
non-bypassable gate. It complements `06-engine-architecture.md` (what to
build) with *how to build it safely*.

## Test-Driven Development is mandatory

pluvian is developed **test-first**, red → green → refactor, without
exception:

1. **Red** — write a failing test that expresses the next small
   behavior. It must fail for the right reason (assertion, not a missing
   import).
2. **Green** — write the minimum production code to make it pass.
3. **Refactor** — improve the code with the test green; re-run to confirm.

No production code is written before a failing test exists for it. "A
feature" is small: each pipeline stage, each condition evaluator, each
`Result` combinator, each `EngineError` variant's handling gets its test
first.

### Why TDD fits this codebase specifically

The architecture in `06-engine-architecture.md` was chosen partly because
it is trivially testable, and TDD is how that payoff is realized:

- Every pipeline stage is a total function `(input) => Result<Output, EngineError>`
  — pure, so a unit test is input → assert on the returned `Result`, no
  mocking.
- `evaluate` is total and consumes the **normalized model**, so it is
  tested against hand-built `NormalizedResource[]` with no `.tf` parsing
  involved.
- The `hcl/` adapter is the one place that touches the real parser, so
  its tests are where `.tf` fixtures live.

### Test layers

- **Unit** (Vitest) — `result/`, `spec/` (`RuleBuilder.validate`
  accumulation), `engine/` condition evaluators, `hcl/normalize`,
  `version/` enforcement, `report/` rendering (including exhaustive
  `EngineError` rendering).
- **Integration** (Vitest, end-to-end) — build the CLI and run `check`
  against fixture terraform, asserting on violations, exit code
  (`0`/`1`/`2` per `06-engine-architecture.md`), and `--format json`
  output shape.
- **Fixtures** — every rule condition ships a `.tf` snippet that should
  violate it and one that should pass, as literal files (not generated)
  so they double as documentation of exactly what the condition matches.
  This is the existing rule in the engine-dev skill, now the backbone of
  the integration layer.

### Coverage

Coverage is gated, weighted toward the correctness-critical core
(`vocabulary/`, `spec/`, `hcl/`, `engine/`, `version/`). Pure formatting
in `report/` may sit lower. Coverage is a floor to catch untested paths,
never the goal — a green coverage number with weak assertions still
fails review.

## The quality/security gate

Every change runs the same suite of checks. There are two enforcement
surfaces and they run the **same** tools so local and CI never disagree:

1. **Dev-time, via Claude subagents** — fast feedback inside the agentic
   loop (see "Subagent orchestration").
2. **CI, via GitHub Actions** — the authoritative, non-bypassable gate on
   every push/MR (see "CI gate").

### The check categories and tools

All of the following are **dev/CI tooling only** — none ships in the
published npm package, so a native-binary dev tool does **not** violate
the "stay pure-JS" *distribution* boundary in
`00-architecture-decision-record.md`.

| Category | Tool(s) | Gate |
|---|---|---|
| Unit + integration tests | **Vitest** | any failure blocks |
| Coverage | **Vitest** (v8) | below threshold blocks |
| Types | **`tsc --noEmit`** (strict) | any error blocks |
| Lint | **ESLint** (typescript-eslint) | any error blocks |
| Format | **Prettier** (`--check`) | drift blocks |
| SAST | **Semgrep** (`--config auto`) + **CodeQL** (separate workflow) | high/error blocks |
| Secrets | **gitleaks** | any finding blocks |
| Dependency / supply chain | **npm audit** (`--audit-level=high`) + **Renovate** | high/critical blocks |
| Extension packaging | **esbuild + vsce** (staged VSIX) + bundled-engine smoke (`vscode` job) | any failure blocks |

`tsc --noEmit` also serves as the spec type-check the loader cannot do —
see `06-engine-architecture.md` §"Spec loading."

### Subagent orchestration

The checks are grouped into three dedicated subagents (defined in
`.claude/agents/`), invoked **in parallel** after a change and before the
work is considered done:

- **`test-runner`** — Vitest unit + integration + coverage.
- **`code-quality`** — `tsc --noEmit`, ESLint, Prettier.
- **`security-scan`** — Semgrep, gitleaks, npm audit (osv-scanner was
  evaluated and dropped — see the note under "CI gate").

Rules for the orchestrating (main) agent:

- Launch the three in **one message** so they run concurrently.
- A subagent that could **not run** a check reports it as a failure/
  incomplete — never a silent pass. Treat "not run" as "not green."
- Do not mark a feature complete until all three return PASS (or a
  deviation is explicitly justified to the user).
- The subagents are **read-only reporters** — they surface findings; the
  main agent applies fixes, then re-runs the affected subagent.

The existing `/code-review` and `/security-review` skills are
complementary manual passes for higher-judgment review; they do not
replace this automated gate.

### Definition of Done

A change is done only when **all** hold:

1. Written test-first; red → green → refactor completed.
2. `test-runner`, `code-quality`, and `security-scan` all PASS locally.
3. The GitHub Actions CI gate is green on the branch.
4. Any new rule condition or resource type ships its violating + passing
   fixtures (see Test layers).

## CI gate (GitHub Actions)

The non-bypassable gate mirrors the subagents exactly, on `ubuntu-latest`
(Node 26). The engine is cross-platform by construction — pure JS + the WASM
HCL parser, no native binary — so Linux-only CI is sufficient (no per-OS
matrix; see `03-distribution-and-cli.md` §"Cross-platform implementation
notes"). The live pipeline is `.github/workflows/ci.yml` (plus
`codeql.yml`; the repo ruleset makes `test`, `audit`, `semgrep`,
`gitleaks`, and `vscode` required checks on main):

```yaml
# .github/workflows/ci.yml (abridged — see the file for the full version)
name: ci
on:
  push: { branches: [main] }   # NOT on tags — release.yml owns those
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: packages/cli } }
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: '26', cache: npm, cache-dependency-path: packages/cli/package-lock.json }
      - run: npm install --no-audit --no-fund
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check
      - run: npm test
      - run: npm run test:integration
      - run: npm run coverage
      - run: npm run check-docs      # rule-doc freshness

  # The extension package's gate: installs + builds the engine package
  # first (the file: link resolves its deps and types from packages/cli),
  # then typecheck/lint/format/test, staged `vsce package`, and a smoke
  # run of the BUNDLED engine against demo/ from the extracted VSIX.
  vscode:
    steps: [checkout, setup-node, cli npm install + build, vscode gates + package + smoke]  # abridged

  # Cross-OS parity (Windows/macOS) is a free native matrix on a public repo;
  # add `strategy: matrix: os: [ubuntu-latest, macos-latest, windows-latest]`
  # if/when parity is wanted. Currently Linux-only.

  audit:    { runs-on: ubuntu-latest, steps: [checkout, setup-node, npm install, npm audit --audit-level=high] }   # abridged
  semgrep:  { runs-on: ubuntu-latest, steps: [checkout, pipx install semgrep, semgrep scan --config auto --error packages/cli/src] }  # abridged
  gitleaks: { runs-on: ubuntu-latest, steps: [checkout (fetch-depth 0), direct checksum-pinned gitleaks binary] }  # abridged — the
            # gitleaks-action requires a per-org license since the erkos-hq transfer
```

`actions/setup-node` provides Node + an npm cache; dependency install is the
only other setup step. **We use `npm install`, not `npm ci`** — the test toolchain
(vitest → vite → rolldown) ships platform-specific optional native bindings
whose transitive `@emnapi` versions resolve differently on the Linux runner
than in a lockfile generated on another OS, which makes `npm ci` reject an
otherwise-valid lock. `npm install` honors the committed lockfile (still the
source of truth, still committed) but tolerates that per-platform optional
resolution; the prod deps (`@cdktf/hcl2json`, `jiti`) are unaffected either
way. **Actions should be digest-pinned** — a governance tool should not float
its own CI on mutable tags, mirroring the `pluvian.json` no-`@latest` principle.
`renovate.json` is configured (`:pinDigests`, npm + `github-actions` managers,
grouped, weekly) to pin and bump both the Action SHAs and the CLI dependencies.

> **GitHub-native alternative (not used).** GitHub's code-scanning +
> secret-scanning features wrap semgrep + gitleaks — the *same* tools this
> pipeline runs directly. We invoke the raw tools so local subagents and CI
> stay byte-for-byte identical (the core gate principle), but the native
> integrations are a valid swap if the GitHub Security tab integration
> becomes worth it.
>
> **osv-scanner is intentionally not wired into CI.** Its differentiated
> value is polyglot repos; pluvian is npm-only, so it would duplicate
> `npm audit` (overlapping advisory data) plus Renovate's vulnerability
> alerts. Re-add it if/when the repo becomes polyglot.

## Optional: harness-enforced triggering

The subagent gate above is a documented **convention** the agent
follows; the durable enforcement is CI. If harness-guaranteed local
triggering is later wanted (run the gate automatically on every change
rather than by convention), it can be wired as a Claude Code hook — but
that is a settings/hooks change, not part of this design, and CI remains
the real gate regardless.
