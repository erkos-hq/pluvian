# 03 — Distribution and CLI Specification

This document defines exactly how pluvian reaches a developer's machine
or a CI runner, how versioning is enforced, and how the (optional) Go
HCL parser subprocess is bundled without breaking macOS. Read
`/docs/specs/00-architecture-decision-record.md` first for *why* this
distribution model was chosen over every alternative.

## The invocation contract

```bash
npx @erkos/pluvian check ./terraform/
```

This is the only command a developer or a CI pipeline needs to know.
Everything else — version resolution, platform-binary selection,
HCL-parser invocation — is invisible.

## Static analysis vs `terraform plan` — decided: static analysis is the
## default for local/pre-commit use

Two evaluation modes were considered:

1. **Static HCL analysis** — read `.tf` files directly as text/AST, no
   credentials, no state, no network. Cannot resolve variables that come
   from `terraform.tfvars`, external modules, or CI-injected environment
   variables. **Catches the large majority of real violations in
   AI-generated code anyway** because generated code tends to use
   literal values rather than parameterized ones — see
   `/docs/specs/01-product-overview.md` §"The insight that makes
   AI-generated infrastructure governable."
2. **`terraform plan` analysis** — fully resolved values, requires
   credentials and state access, cannot run offline, 30s–several-minute
   latency. Necessary for rules that depend on resolved values (e.g.
   "no more than 3 large DB instances currently exist").

**Decision: static analysis is the default and only mode for the local
CLI and pre-commit hook.** `terraform plan` analysis is a CI-pipeline
concern only, where credentials are already present as a matter of
course. This keeps the local/pre-commit path fast (sub-second, no
credentials needed) which is required for developer adoption — a
pre-commit hook that takes 30+ seconds will be disabled by developers.

Do not build a `terraform plan`-dependent mode into the local CLI path
for v1.

## Version pinning — mandatory design, not optional

**Never rely on `@latest` in any automated context.** This is a hard
rule, not a preference, because for a governance tool specifically,
`@latest` causes:

- **Silent behavior change** — a check that passed yesterday fails today
  with no code change, because the tool itself changed underneath the
  developer.
- **CI/local drift** — a developer's cached `@latest` and a CI runner's
  freshly-resolved `@latest` can disagree, causing "works on my machine"
  failures in the opposite direction from usual (CI fails, local
  passes, or vice versa, unpredictably).
- **Audit trail collapse** — "what rules applied to this infrastructure
  change on March 15th" becomes unanswerable if the CI log just says
  `npx @erkos/pluvian@latest`.

### The `pluvian.json` mechanism

A file committed to the repository (ideally at the root of a monorepo —
see `/docs/specs/04-governance-model.md`) is the single source of truth
for which version must run:

```json
{
  "version": "1.3.0",
  "spec": ".pluvian/spec.ts",
  "terraform": "./terraform"
}
```

`terraform` may also be an **array of roots**, for per-environment or
multi-service layouts — each root is parsed independently with its **own**
`var`/`local` scope (no cross-root collisions), and findings report paths
relative to the project root so you can tell which root each came from:

```json
{
  "version": "1.3.0",
  "spec": ".pluvian/spec.ts",
  "terraform": ["./env/dev", "./env/stg", "./env/prd"]
}
```

`pluvian init` auto-detects this layout (every directory containing `.tf`
directly becomes a root) and writes the array for you.

A root entry may also be an object that **declares its environment**, so
`.environment(X)` rule scoping is driven by the *folder* rather than by an
`environment` tag on each resource (see `/docs/specs/02-spec-dsl.md`):

```json
{
  "version": "1.3.0",
  "spec": ".pluvian/spec.ts",
  "terraform": [
    { "path": "./environment/sandbox",    "environment": "development" },
    { "path": "./environment/production",  "environment": "production" }
  ]
}
```

A declared `environment` **overrides** any `environment` tag on resources
in that root. Folder names are arbitrary; only the mapped value must be a
valid `Environment`.

**`pluvian init`'s mapping is only a best-effort guess — review and edit it
by hand.** It infers the environment from recognizable folder names
(`dev`/`stg`/`prd`, `sandbox`, …) and leaves anything it doesn't recognize
as a plain path for you to annotate. The mapping is a deliberate policy
decision, not something to accept blindly. For example, a company that
wants **staging held to the same rules as production** simply maps both
roots to `production` — overriding init's guess of `staging`:

```json
"terraform": [
  { "path": "./env/dev", "environment": "development" },
  { "path": "./env/stg", "environment": "production" },
  { "path": "./env/prd", "environment": "production" }
]
```

Now every `.environment(Production)` rule applies to staging *and*
production. (Conversely, mapping a folder to a *less* strict environment,
or leaving it unmapped, is equally valid — it's your call.)

On every invocation, the engine's very first action is the version gate.
As shipped it rides the `Result` failure track rather than calling
`process.exit` (see `06-engine-architecture.md` §"EngineError"):

```typescript
// src/version/config.ts (as shipped, abridged)
export function enforceVersion<T extends { version?: string }>(
  config: T,
  running: string,
): Result<T, EngineError> {
  if (!config.version) return ok(config)       // no pin configured, proceed
  if (config.version === running) return ok(config)
  return err({ kind: 'VersionMismatch', required: config.version, running })
}
// renderError prints the exact fix: `run: npx @erkos/pluvian@<required> check`
```

Since v2.1.0, embedders may pass `check(..., { enforcePin: false })` to
run despite a mismatch and surface it themselves (the VS Code extension
notifies and runs; CLI/CI keep refusing).

This means:
- The developer never needs to be manually notified when the platform
  team bumps the version — the tool tells them, at the exact moment
  they run it, with the exact fix command.
- CI and local always agree, because both read the same committed
  `pluvian.json`.
- The Slack-bot / Renovate-bot / broadcast-message notification schemes
  considered during design remain **optional conveniences for polyrepo
  setups** (see `/docs/specs/04-governance-model.md`) — they are not
  required infrastructure for v1.

### Recommended developer shell alias

```bash
alias pluvian='npx @erkos/pluvian'
```

With this alias, `pluvian check` always resolves the correct pinned
version via the `pluvian.json` mechanism above, with no version string
in the command at all. Document this in the README as the recommended
workflow, but the raw `npx @erkos/pluvian@x.y.z` form must always work
too (it's what CI configs should use explicitly).

## Package structure

```
@erkos/pluvian/
├── package.json          { "bin": { "pluvian": "./bin/pluvian.js" } }
├── bin/
│   └── pluvian.js          ← thin entry point (Node)
└── dist/                  ← compiled TypeScript engine
    ├── engine/
    ├── hcl/
    └── version/
```

### v1 recommendation: no bundled Go binary

For the reasons in the macOS Gatekeeper section below, **v1 must not ship
a bundled native Go binary.** The original plan was to fall back to a pure
TypeScript/npm HCL parser (e.g. `@evops/hcl-terraform-parser`) and accept
losing the official `hashicorp/hcl` parser.

> **What the v0 slice actually uses (better than the fallback above).**
> The engine parses with **`@cdktf/hcl2json`**, which bundles the official
> HashiCorp `hashicorp/hcl` parser **compiled to WebAssembly** (a ~6.5 MB
> `main.wasm.gz` loaded via Go's `wasm_exec` glue and
> `WebAssembly.instantiate`). This is **option 2 in the Gatekeeper
> resolution ladder** — the *preferred* path — achieved for free: we get
> official-parser correctness AND WASM's properties (no Gatekeeper, no
> notarization, no Windows AV/EDR alerts, one cross-platform artifact, no
> per-OS build matrix), with zero binary-distribution work. So pluvian is
> **not** on the community-JS-parser baseline — it is already on the
> official Go parser via WASM. A trial of `@evops/hcl-terraform-parser`
> was rejected because it returns only resource metadata, not attribute
> bodies (it cannot see `ingress`/`cidr_blocks`).
>
> Caveat: hcl2json provides HCL *syntax* parsing (the same library
> Terraform uses), not Terraform *semantic* evaluation — which is why the
> engine still resolves `var`/`local` and expands `for_each` itself, and
> reports "could not evaluate" for what it cannot statically resolve.

## Cross-platform implementation notes (Windows / macOS / Linux parity)

The zero-install cross-platform win is a property of *pure
JavaScript/TypeScript*, and it holds only if the engine code is written
portably (see `/docs/specs/00-architecture-decision-record.md` §"The
decision depends on staying pure-JS"). The common Node traps — and they
bite hardest with a Windows dev machine and Linux CI, which is the
expected setup for this project:

- **Paths:** always use `path.join` / `path.resolve`; never string-concat
  separators. Normalize separators in any reported `file:line` location
  and in glob results so output is byte-identical on every OS.
- **Line endings:** `.tf` files may be CRLF (Windows) or LF (Linux).
  Line-number reporting and any regex must not assume `\n`-only.
- **File discovery:** find `.tf` files with a library (`fast-glob` /
  `globby`), not shell globbing — PowerShell, bash, and CI runners
  expand globs differently.
- **Test on Linux CI from day one**, not only locally. "Passes on my
  Windows machine, fails in CI" is the single most common Node
  portability bug, and this project's dev/CI split invites it. Run the
  test suite on `windows-latest` *and* `ubuntu-latest` (and ideally
  `macos-latest`) in the matrix.
- **`bin` shim:** npm generates the Windows `.cmd` shim automatically
  from the `"bin"` field — no extra work is needed, *as long as no native
  binary is introduced* (see the Gatekeeper section below for what
  changes if one is).

### If official-parser correctness is ever needed: prefer WASM over a native binary

If HCL parsing edge cases in the community npm parser become a real,
specific problem (the only trigger — see CLAUDE.md §2a), the official Go
`hashicorp/hcl` parser can be adopted. **Prefer compiling it to WASM and
running it inside Node over bundling a per-platform native binary.**

Why WASM first:

- **No code-signing machinery at all.** A `.wasm` module is loaded as
  *data* by Node, not executed as an OS process, so macOS Gatekeeper,
  Apple notarization, and Windows SmartScreen/Defender/EDR alerts simply
  do not apply — see the Gatekeeper section below for what a native
  binary triggers instead.
- **One artifact, every platform.** The same `.wasm` runs identically on
  Windows/macOS/Linux and every CI runner wherever Node runs — no
  per-OS build matrix.
- **It keeps pluvian off its own audience's threat radar.** A governance
  tool that trips endpoint security, or strips OS security attributes to
  run, is the wrong first impression for the security-conscious
  organizations pluvian targets.
- **Cost:** Go→WASM plumbing (build, module size, call-in/out
  marshalling) is a one-time engineering cost, not the recurring
  signing/AV-support burden a native binary carries.

Whichever route is taken, it sits entirely behind the `hcl/` adapter
boundary (see `/docs/specs/06-engine-architecture.md`) — the engine
never sees the parser, so this swap touches one module.

#### Fallback: per-platform native binary

Only if WASM proves impractical, bundle `pluvian-hclparse` (Go, using the
official `hashicorp/hcl` library) as a subprocess, one binary per
platform:

```
bin/
├── pluvian.js                 ← Node wrapper, selects + execs binary
├── pluvian-linux-x64
├── pluvian-linux-arm64
├── pluvian-macos-x64
├── pluvian-macos-arm64
└── pluvian-win-x64.exe
```

```javascript
// bin/pluvian.js — platform selection logic
const { execFileSync } = require('child_process')
const path = require('path')
const os = require('os')

function getBinary() {
  const key = `${os.platform()}-${os.arch()}`
  const map = {
    'linux-x64':    'pluvian-linux-x64',
    'linux-arm64':  'pluvian-linux-arm64',
    'darwin-x64':   'pluvian-macos-x64',
    'darwin-arm64': 'pluvian-macos-arm64',
    'win32-x64':    'pluvian-win-x64.exe',
  }
  const binary = map[key]
  if (!binary) {
    console.error(`Unsupported platform: ${key}`)
    process.exit(1)
  }
  return path.join(__dirname, binary)
}

execFileSync(getBinary(), process.argv.slice(2), { stdio: 'inherit' })
```

Binaries must be `chmod +x` at publish time (npm preserves the
executable bit on Linux/macOS; not needed for `.exe`).

## The macOS Gatekeeper problem (only relevant if bundling the Go binary)

An unsigned binary downloaded via npm gets a `com.apple.quarantine`
extended attribute applied by macOS. Gatekeeper then blocks execution
with no "open anyway" option, because the binary isn't signed or
notarized.

**Resolution path, in order of preference:**

1. **(Recommended default) Don't bundle a native binary at all** — see
   "v1 recommendation" above. This sidesteps the problem entirely; Node
   itself is already trusted by macOS.
2. **(Preferred if the official parser is ever needed) Compile
   `hashicorp/hcl` to WASM and run it inside Node** — see "If
   official-parser correctness is ever needed: prefer WASM over a native
   binary" above. A `.wasm` module is loaded as data, not executed as an
   OS process, so Gatekeeper, notarization, and Windows
   Defender/SmartScreen/EDR alerts do not apply at all. Strictly
   preferable to any native-binary option below.
3. **(Correct native-binary solution, if a binary is truly required)
   Apple Developer ID signing + notarization** in the release pipeline
   (~$99/year):
   ```bash
   codesign --sign "Developer ID: <name> (<TEAMID>)" \
     --options runtime --timestamp pluvian-macos-arm64
   xcrun notarytool submit pluvian-macos-arm64.zip \
     --apple-id "$APPLE_ID" --password "$APPLE_APP_PASSWORD" \
     --team-id "$APPLE_TEAM_ID" --wait
   xcrun stapler staple pluvian-macos-arm64
   ```
4. **(Interim only — discouraged, never permanent) `postinstall` script
   strips the quarantine xattr:**
   ```javascript
   // scripts/postinstall.js
   const { execSync } = require('child_process')
   const path = require('path')
   const os = require('os')

   if (os.platform() === 'darwin') {
     ['pluvian-macos-x64', 'pluvian-macos-arm64'].forEach((bin) => {
       try {
         execSync(
           `xattr -d com.apple.quarantine "${path.join(__dirname, '..', 'bin', bin)}"`,
           { stdio: 'ignore' }
         )
       } catch { /* attribute may not be present, ignore */ }
     })
   }
   ```
   **Caveat:** a workaround, not a fix — and a bad look for a governance
   tool specifically: a security product programmatically bypassing an OS
   security check is a legitimate red flag reviewers will raise, and some
   enterprise endpoint-security policies flag it outright. Never present
   this as the permanent solution in customer-facing documentation.

## Optional-dependency per-platform packages (v2 optimization, not v1)

Tools like `esbuild` and `@biomejs/biome` split each platform binary
into its own tiny npm package (`@erkos/pluvian-darwin-arm64`, etc.) using
`optionalDependencies` with `os`/`cpu` fields in `package.json`, so a
developer only downloads the ~5–10MB binary relevant to their machine
instead of a ~50MB bundle containing every platform. **This is a valid
v2 optimization once there is a bundled binary at all (see above) and
download size becomes a measured problem.** Do not build this
complexity for v1.

## CI integration

### GitLab CI

```yaml
pluvian-check:
  stage: validate
  script:
    - npx @erkos/pluvian check ./terraform/
  rules:
    - changes:
        - "terraform/**/*.tf"
        - ".pluvian/**"
```

Node is pre-installed on standard GitLab CI runner images; no setup
step required. `pluvian` reads its version from the committed
`pluvian.json`.

### GitHub Actions

```yaml
- name: Governance check
  run: npx @erkos/pluvian check ./terraform/
```

Node is pre-installed on `ubuntu-latest`, `macos-latest`, and
`windows-latest` runners; no setup step required.

## Pre-commit hook integration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: pluvian-check
        name: Pluvian Governance Check
        language: node
        entry: npx
        args: ['@erkos/pluvian', 'check']
        files: \.tf$
        pass_filenames: false
```

Developer runs `pre-commit install` once; from then on every commit
touching `.tf` files is checked automatically, with the version pin
enforced by `pluvian.json` exactly as in CI.

### Cold-start mitigation

`npx`'s first invocation of a given pinned version downloads and caches
it (a few seconds); subsequent invocations of the same version are near
instant from cache. If a pre-commit hook's cold-start latency (rare —
only on first use of a newly-pinned version) becomes a real complaint,
two mitigations exist, **neither required for v1**:

- Add `@erkos/pluvian` as a `devDependency` in the project's
  `package.json` so `npm install` resolves it once, and pre-commit's
  `entry` calls the local `node_modules/.bin/pluvian` instead of going
  through `npx`'s resolution each time.
- A long-running `pluvian daemon start` mode that a pre-commit hook talks
  to over a local socket, eliminating process-startup cost entirely.
  This is real engineering effort — defer until cold-start latency is
  an actual, measured complaint from real users, not a theoretical one.

## Output formats

The engine supports three shipped formats:
- **Human-readable terminal output** (default) — colorized, points to
  file:line, includes `.message()` and `.rationale()` if present.
- **JSON** (`--format json`) — for CI artifact storage and tooling that
  consumes results programmatically (frozen `schemaVersion: 1`).
- **SARIF 2.1.0** (`--format sarif`) — shipped in v1.9.22: the OASIS
  standard consumed by GitHub Code Scanning, GitLab security artifacts,
  Azure DevOps, and VS Code's SARIF viewer; the CI templates ship
  optional upload steps.
