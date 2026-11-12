# 00 — Architecture Decision Record

Status: **Decided and locked.** The engine is Node.js / TypeScript,
distributed via npm and run with `npx`. This document records *why*, so
the decision is not re-litigated. If you think an alternative deserves
reconsideration, read the "Why alternatives lost" section first — the
reasoning is usually still valid, and the decisive criterion (adoption
friction) has not changed.

## Decision

**Engine: Node.js / TypeScript, distributed via npm and run with `npx`.
HCL parsing: a pure-npm HCL parser for v1 (no bundled native binary),
with an optional Go `hashicorp/hcl` subprocess kept open for later if
parser correctness demands it.**

## Context

Two questions had to be answered together:

1. **The engine** — the program that reads a spec, parses Terraform HCL,
   evaluates rules, and reports violations.
2. **The distribution mechanism** — how the engine reaches a developer's
   machine or a CI runner with the least possible friction.

Many languages and runtimes were compared in depth during design. The
comparison is summarized at the **category level** below rather than
enumerated language-by-language, because the *categories* of tradeoff —
not the individual languages — are what a future contributor needs in
order to understand (and not re-open) the decision.

## Decision drivers (in priority order for a public product)

1. **Adoption friction** — time from "developer hears about pluvian" to
   "developer successfully runs a check." This was ultimately weighted
   above every other criterion, because a governance tool that isn't
   run provides zero governance.
2. **Spec (DSL) readability** — can a security architect who does not
   write code read `.pluvian/spec.ts` and understand it correctly.
3. **Type safety / correctness** — can the engine make invalid rule
   combinations unrepresentable, and does the language support
   exhaustive pattern matching so that adding a new resource type forces
   every relevant code path to be updated.
4. **Standalone binary quality** — size, startup time, cross-platform
   coverage (especially Windows).
5. **Enterprise trust** — will a security architect or platform engineer
   accept the tool without friction based on its implementation
   language.
6. **Community contribution potential** — how many developers can read
   and meaningfully contribute to pluvian itself.

## Why npx-based Node/TypeScript won on the decisive criterion

Every other option requires an explicit installation step of *some*
kind — a package-manager install, a `curl | sh` script, or a runtime
that itself needs installing first. **Node.js is the one runtime that is
already present on essentially every developer machine and every major
CI runner (GitHub Actions, GitLab CI, CircleCI, Jenkins) without any
setup step.** `npx @erkos/pluvian@2 check` is a complete,
zero-install, cross-platform invocation on day one.

This single property — "the adoption flywheel requires zero
installation" — outweighed every technical advantage the other options
offered. A tool with stronger type guarantees that nobody installs
governs nothing.

### The version-pinning answer to the obvious objection

The objection to Node/npx is usually "but you lose control over which
version runs." This is solved, not a fundamental limitation:
`npx @erkos/pluvian@1.2.0` pins an exact version, and — more
importantly — the engine itself reads a `pluvian.json` file committed to
the repository and **refuses to run** if its own version doesn't match
the pinned version, printing the exact corrective `npx` command. See
`/docs/specs/03-distribution-and-cli.md`. This makes governance
consistent across every developer's machine and every CI run without
requiring a notification system, a Slack bot, or a Renovate
configuration (those remain optional conveniences, not requirements).

## Why alternatives lost (category-level)

Every alternative fell into one of a few groups, each losing for a
structural reason that still holds. These reasons are recorded so the
categories are not re-opened one language at a time.

- **Native-compiled languages** (the best raw fit for a CLI engine —
  smallest/fastest binaries, strongest exhaustive pattern matching,
  growing infra-tooling trust). They lost the **v1** decision on one
  thing only: every one still requires an install step, with no
  equivalent to `npx`'s zero-install reach. A native **v2 engine rewrite
  remains an explicitly open path** once the product is validated and
  correctness/performance become the binding constraint — see
  Consequences.
- **JVM / managed-runtime languages** (strong type safety via sealed
  types and exhaustive matching). Standalone distribution needs
  ahead-of-time-compilation complexity, and again there is no zero-install
  story. One runtime in this group is documented as the strongest
  *fallback* if a runtime-native build is ever required — but it
  is not the public product's path, because the public product must work
  for people who have never installed that toolchain.
- **Dynamically-typed scripting languages** (several produced the most
  English-like DSLs of anything evaluated). They give no compile-time
  exhaustiveness — a real loss for a governance tool's correctness story
  — and none improved on npx's install friction.
- **Image-based / slow-startup runtimes.** Disqualified for the fast
  path: a pre-commit hook that pays a multi-second runtime warmup on
  every `git commit` gets disabled by developers. One of these is
  nonetheless recommended as a *future asynchronous analysis tier* (it
  never sits in the fast path) — see `/docs/specs/05-future-cloud-layer.md`.
- **A second TypeScript runtime.** Same language advantages as Node plus
  a better default permissions model, but it is not pre-installed the
  way Node is, so the zero-install property does not hold. Revisit only
  if it becomes as ubiquitous as Node.
- **Custom-syntax / static-AST approaches** (a bespoke spec grammar, or
  reading `spec.<lang>` as an AST without executing it). Rejected
  because genuinely new syntax breaks the TypeScript IDE toolchain
  (autocomplete, inline type errors), and AST-only reading moves
  vocabulary validation from compile time to load time — a net
  type-safety regression versus what `const enum` + builder validation
  now achieves. See `/docs/specs/02-spec-dsl.md`.

The single property that beat every group: **Node is already present on
essentially every developer machine and CI runner, so
`npx @erkos/pluvian check` is a complete, zero-install, cross-platform
invocation on day one.**

## The decision depends on staying pure-JS

The cross-platform win above is a property of *pure JavaScript/TypeScript*,
not of Node in general. The moment a native binary is bundled (e.g. a Go
HCL parser), most of the advantage is lost: a per-OS binary matrix,
macOS Gatekeeper/notarization, Windows `.exe` handling, and
executable-bit handling at publish time all return. **v1 therefore ships
no native binary** — a pure-npm HCL parser is used instead. Guard this
boundary: adding a bundled binary "just for parser correctness" silently
converts a clean four-platform story (Windows/macOS/Linux + CI) into a
signing-and-bundling project. The tradeoff accepted (a community HCL
parser may not match Terraform's parser on every edge case) is a
*correctness* risk to track, not a portability one. See
`/docs/specs/03-distribution-and-cli.md`.

**Supply-chain risk to track (added 2026-07).** The HCL parser used is
`@cdktf/hcl2json`, which is CDKTF's compile of the HashiCorp Go HCL parser
(`github.com/hashicorp/hcl/v2`) to **WASM** — it ships a `main.wasm.gz`, not a
native binary, so the pure-JS / no-Gatekeeper property holds. Its source repo,
`hashicorp/terraform-cdk`, is **archived** (HashiCorp sunset CDKTF; last push
2025-12). The npm package is frozen at `0.21.0` (2025-06), not marked
deprecated, still installable and functionally correct — HCL is a stable
language and the parser works — but there is no upstream maintenance: no fixes,
no security patches, and medium-term install-rot risk if a transitive
dependency breaks. This is accepted for now (documented, monitored) rather than
acted on. The mitigation path if it bites: compile `hashicorp/hcl/v2` to WASM
ourselves and **vendor the `.wasm` artifact** in this repo — same parser
correctness, same no-native-binary/no-Gatekeeper distribution, but pluvian owns
the build (a build-time Go toolchain, not a user-facing one). Owning the build
matters beyond the archived-upstream risk: `hashicorp/hcl/v2` itself continues
to release (parser fixes, new HCL constructs, security patches), and a frozen
`@cdktf/hcl2json` snapshot means pluvian cannot track those — only a pluvian-owned
build lets us bump `hcl/v2` on our own cadence. Bundling the Go parser as a
native subprocess binary is *not* the mitigation — that reintroduces the
per-OS / signing / Gatekeeper cost this decision deliberately avoids.

## Internal validation note

The internal proof-of-concept environment has a JVM toolchain available
but not a native (compiled-language) one. **This does not change the
decision.** The Node/TypeScript engine runs anywhere Node runs, which
includes that environment and essentially every CI runner. A
runtime-native fallback is documented above only for completeness; it is
not currently pursued.

## Consequences

- The spec DSL (`/docs/specs/02-spec-dsl.md`) is designed around
  TypeScript's type system specifically — `const enum`, discriminated
  unions, and optionally `ts-pattern` for exhaustiveness in the engine
  (not the spec surface).
- The distribution model (`/docs/specs/03-distribution-and-cli.md`) is
  built entirely around `npx` and `pluvian.json`-driven version
  enforcement.
- A future v2 rewrite of the *engine* in a native-compiled language
  remains an open, explicitly-considered option — but the
  **distribution layer** (an npm package invoked via `npx`) should be
  preserved regardless of engine language, because the adoption-friction
  argument that won this ADR is independent of what computes the rule
  evaluation. If that rewrite bundles a native binary, the cross-platform
  and signing costs described in "The decision depends on staying
  pure-JS" come back and must be budgeted.
