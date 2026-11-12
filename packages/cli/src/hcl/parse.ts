import * as fs from 'fs'
import * as path from 'path'
import { parse as hcl2json } from '@cdktf/hcl2json'
import { Result, ok, err } from '../result/result'
import { EngineError } from '../result/errors'
import {
  NormalizedResource,
  NormalizedOutput,
  NormalizedBinding,
  NormalizedTerraformSettings,
  NormalizedModuleCall,
  PolicyInfo,
} from './model'
import {
  normalize,
  normalizeOutputs,
  normalizeBindings,
  normalizeSettings,
  collectUngoverned,
  buildScope,
  resolveRaw,
  countIsZero,
  expandForEach,
  providerDefaults,
  mergeProviderDefaults,
  providerRegions,
  mergeProviderRegions,
  buildDataPolicies,
  buildModuleOutputPolicies,
  ProviderDefaults,
  ProviderRegionMap,
  Hcl2JsonRoot,
  Scope,
} from './normalize'

function findTfFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir) as string[]
  return entries.filter((e) => e.endsWith('.tf')).map((e) => path.join(dir, e))
}

const toPosix = (p: string): string => p.split(path.sep).join('/')

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

interface ParsedFile {
  file: string
  text: string
  parsed: Hcl2JsonRoot
}

/**
 * A `module {}` call pluvian did NOT follow (doc 08 DoD: never silently pass).
 * Surfaced as `couldNotEvaluate` (ruleId `pluvian.module-following`) by the
 * CLI so the user knows a gap exists — remote sources, escapes, missing dirs.
 */
export interface ModuleSkip {
  /** Module block label — the `"x"` in `module "x" {}`. */
  readonly label: string
  /** Raw `source` value, for the reason string. */
  readonly source: string
  /** Caller file path relative to projectRoot. */
  readonly file: string
  /** 1-based line of the `module "x"` block in the caller file. */
  readonly line: number
  /** Why it was not followed. */
  readonly reason: string
}

/** `parseTf` success payload: followed resources + skipped module calls +
 * normalized outputs (a separate surface governed by output rules) +
 * normalized bindings (variables/locals, governed by binding rules). */
export interface ParseOutput {
  readonly resources: NormalizedResource[]
  readonly skips: ModuleSkip[]
  readonly outputs: NormalizedOutput[]
  readonly bindings: NormalizedBinding[]
  readonly settings: NormalizedTerraformSettings[]
  readonly moduleCalls: NormalizedModuleCall[]
  readonly ignores: IgnoreDirective[]
  /** Resources pluvian saw but could NOT govern (type not in the vocabulary).
   *  Surfaced as informational telemetry so users know what's NOT covered —
   *  a silent skip is worse than an honest gap. */
  readonly ungoverned: UngovernedResource[]
  /** Cross-level index of `<moduleLabel>.<outputName>` → parsed PolicyInfo,
   *  for followed DIRECT child modules' `output`s whose value bottoms out at
   *  a `data.aws_iam_policy_document.<name>.json`. Consumed only at the root
   *  level (threaded into root `normalize`) so a parent resource's
   *  `policy = module.<label>.<output>` resolves. Parse-internal — the engine
   *  ignores it. */
  readonly moduleOutputPolicies: Map<string, PolicyInfo>
}

/**
 * A resource pluvian parsed but could not govern — its type is not in the
 *  closed vocabulary (`KNOWN_TYPES`). Surfaced as informational telemetry
 *  (not a violation, not could-not-evaluate) so users know coverage gaps.
 */
export interface UngovernedResource {
  readonly type: string
  readonly name: string
  readonly file: string
  readonly line: number
}

/**
 * An inline `# pluvian:ignore` (or `// pluvian:ignore`) directive. Suppresses
 * ALL findings (violations + could-not-evaluate) on the block it precedes (or
 * is on the same line as). The optional `: <reason>` text is a human
 * justification (auditability), not a matcher. Matched by (file, line) where
 * `line` is the block-START line the comment targets.
 */
export interface IgnoreDirective {
  readonly file: string
  readonly line: number
  /** Optional ruleId to suppress ONLY that rule on this block
   *  (`# pluvian:ignore rule-5: <reason>`). Undefined = suppress ALL rules. */
  readonly ruleId?: string
  readonly reason?: string
}

/** An own-line `# pluvian:ignore[: reason]` / `// pluvian:ignore[: reason]`
 *  comment. Supports an optional ruleId: `# pluvian:ignore rule-5: <reason>`
 *  to suppress only that rule. Without a ruleId, suppresses ALL findings.
 *  Anchored at `^\s*` so a token inside a string value does NOT false-match. */
const IGNORE_OWN_LINE_RE =
  /^\s*(#|\/\/)\s*pluvian:ignore(?:\s+([a-z][a-z0-9-]*))?(?::\s*(.*))?$/i

/** A trailing comment on a block-start line (same semantics as own-line). */
const IGNORE_TRAILING_RE =
  /(#|\/\/)\s*pluvian:ignore(?:\s+([a-z][a-z0-9-]*))?(?::\s*(.*))?$/i

/** A top-level block header — the target of an ignore directive. */
const BLOCK_START_RE =
  /^\s*(?:resource|data|output|variable|module|provider|terraform|locals)\b/

/**
 * Scan raw text for `pluvian:ignore` directives. Two forms:
 *  1. Own-line: `# pluvian:ignore\nresource "x" "y"` → targets the NEXT
 *     block-start line at or after the comment.
 *  2. Trailing: `resource "x" "y" { # pluvian:ignore` → targets THIS line
 *     (the block-start line the comment trails).
 * A `pluvian:ignore` token inside a string value (e.g.
 * `description = "# pluvian:ignore"`) is NOT matched — the own-line regex
 * is anchored at `^\s*`, and the trailing regex only runs on block-start
 * lines. Returns directives keyed by physical file rel path + targeted line.
 */
export function scanIgnores(text: string, fileRel: string): IgnoreDirective[] {
  const lines = text.split(/\r?\n/)
  const out: IgnoreDirective[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const isBlockStart = BLOCK_START_RE.test(line)
    // Own-line: `#`/`//` is the first non-whitespace → targets next block.
    const own = IGNORE_OWN_LINE_RE.exec(line)
    // Trailing: on a block-start line → targets this line.
    const trailing = isBlockStart ? IGNORE_TRAILING_RE.exec(line) : null
    const m = own ?? trailing
    if (!m) continue
    const ruleId = m[2]?.trim() || undefined
    const reason = m[3]?.trim() || undefined
    if (own) {
      // Find the next block-start line at or after the comment line.
      for (let j = i; j < lines.length; j++) {
        if (BLOCK_START_RE.test(lines[j] ?? '')) {
          if (!out.some((d) => d.line === j + 1))
            out.push({ file: fileRel, line: j + 1, ruleId, reason })
          break
        }
      }
    } else if (trailing) {
      // The comment is ON the block-start line → target this line.
      if (!out.some((d) => d.line === i + 1))
        out.push({ file: fileRel, line: i + 1, ruleId, reason })
    }
  }
  return out
}

/** Parse every `.tf` under `dir` (no normalization). */
async function parseDir(
  dir: string,
): Promise<Result<ParsedFile[], EngineError>> {
  if (!fs.existsSync(dir)) return err({ kind: 'PathNotFound', path: dir })
  const out: ParsedFile[] = []
  for (const file of findTfFiles(dir)) {
    try {
      // The read rides inside the same guard as the parser: a vanished or
      // unreadable .tf (TOCTOU/EACCES) is a ParseFailed, never a raw
      // exception escaping the Result contract.
      const text = fs.readFileSync(file, 'utf8')
      const parsed = (await hcl2json(path.basename(file), text)) as Hcl2JsonRoot
      out.push({ file, text, parsed })
    } catch (e) {
      return err({
        kind: 'ParseFailed',
        file,
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return ok(out)
}

// Keys on a `module` block that are meta, not `var` inputs (doc 08).
const MODULE_META = new Set([
  'source',
  'version',
  'count',
  'for_each',
  'providers',
  'depends_on',
  'lifecycle',
])

// A local relative source we can follow (doc 08 v1: local sources only).
const isLocalSource = (s: unknown): s is string =>
  typeof s === 'string' && (s.startsWith('./') || s.startsWith('../'))

/** 1-based line of `module "<label>" {` in the caller file (best-effort). */
function findModuleLine(text: string, label: string): number {
  const lines = text.split(/\r?\n/)
  const needle = new RegExp(`module\\s+"${escapeRegExp(label)}"`)
  for (let i = 0; i < lines.length; i++) {
    if (needle.test(lines[i] ?? '')) return i + 1
  }
  return 1
}

/**
 * Module-following (doc 08). For each local `module { source, <inputs> }`
 * call in the caller's files, parse the module dir and normalize its
 * resources with a scope = the module's own defaults/locals overlaid with
 * the caller's inputs (resolved in the caller's scope) as `var.*`. This is
 * what turns caller-`var` values (cidrs, tags) into concrete verdicts.
 *
 * Local sources only. `count = 0` skips the module silently (no resources).
 * `for_each` (resolvable literal map/var-list) expands per element, with
 * `each.value` / `each.key` threaded into the module scope; an unresolvable
 * `for_each` is followed once (honest; each.* degrades to could-not-evaluate).
 * Non-local sources, escapes, missing dirs, and cycles are recorded as
 * `ModuleSkip` notes per doc 08's DoD (never a silent pass) — the CLI
 * surfaces them as could-not-evaluate.
 *
 * Recursive (doc 08 tranche 5): a followed module's own `module {}` calls
 * are followed too, bounded by a path-stack of resolved module dirs (a cycle
 * yields a skip, not infinite recursion). Per-instantiation isolation is
 * preserved at every level: each call gets its own scope + trace label.
 */
async function followModules(
  callerFiles: ParsedFile[],
  /**
   * Trace prefix accumulated from the chain of enclosing module calls. Each
   * followed call appends `› <module-file> (<label>[<key>])`, so findings on
   * a nested module name every hop — full chain visibility.
   */
  traceRoot: string,
  projectRoot: string,
  callerScope: Scope,
  environmentOverride: string | undefined,
  /** Resolved absolute dirs on the current follow-path (cycle bound). */
  pathStack: Set<string> = new Set(),
  /**
   * Provider default_tags/default_labels inherited from enclosing dirs. A
   * child module with no provider block of its own inherits these (Terraform
   * provider inheritance); a child's own provider defaults merge in (child
   * wins on key conflicts). Threaded to `normalize` and to the recursive
   * `followModules` so deep modules see the full inherited chain.
   */
  inheritedPd?: ProviderDefaults,
  /** Inherited provider alias→region map (from enclosing dirs). A child
   *  module with no provider block of its own inherits the root's regions
   *  (Terraform provider inheritance); a child's own provider blocks merge
   *  in (child's aliases override). Threaded to `normalize` and the recursive
   *  `followModules` for GDPR/LGPD residency rules. */
  inheritedRegions?: ProviderRegionMap,
): Promise<Result<ParseOutput, EngineError>> {
  const out: NormalizedResource[] = []
  const skips: ModuleSkip[] = []
  const outputs: NormalizedOutput[] = []
  const bindings: NormalizedBinding[] = []
  const settings: NormalizedTerraformSettings[] = []
  const moduleCalls: NormalizedModuleCall[] = []
  const ignores: IgnoreDirective[] = []
  const ungoverned: UngovernedResource[] = []
  const moduleOutputPolicies = new Map<string, PolicyInfo>()

  for (const { file, text, parsed } of callerFiles) {
    const fileRel = toPosix(path.relative(projectRoot, file))
    // Inline ignore directives in this caller file (a directive on a module
    // block suppresses findings on the module's resources via the block line).
    ignores.push(...scanIgnores(text, fileRel))
    for (const [label, calls] of Object.entries(parsed.module ?? {})) {
      for (const raw of Array.isArray(calls) ? calls : []) {
        const block = (raw ?? {}) as Record<string, unknown>
        const source = block.source
        const line = findModuleLine(text, label)
        const note = (reason: string): ModuleSkip => ({
          label,
          source: typeof source === 'string' ? source : String(source ?? '?'),
          file: fileRel,
          line,
          reason,
        })

        // Capture the call metadata for the module-version-pinning surface
        // (#19) — BEFORE any skip, so registry modules (which are skipped
        // below) still have their `version` constraint governed. Local modules
        // carry no version and are never flagged by the condition.
        if (typeof source === 'string') {
          moduleCalls.push({
            label,
            source,
            version:
              typeof block.version === 'string' ? block.version : undefined,
            registry: !isLocalSource(source),
            file: fileRel,
            line,
          })
        }

        // count = 0 (literal, or a var resolving to it) disables the module
        // — there are no resources to evaluate; skip silently (not a gap).
        if (block.count !== undefined && countIsZero(block.count, callerScope))
          continue

        // v1: local relative paths only. Registry/git/archive → record + skip.
        if (!isLocalSource(source)) {
          skips.push(note('remote or non-local source'))
          continue
        }

        const moduleDir = path.resolve(path.dirname(file), source as string)
        // Confine to the scanned project; never escape it.
        if (path.relative(projectRoot, moduleDir).startsWith('..')) {
          skips.push(note('source resolves outside the scanned project'))
          continue
        }
        // Cycle guard: never re-enter a dir already on the current path.
        if (pathStack.has(moduleDir)) {
          skips.push(note('module cycle detected'))
          continue
        }
        if (!fs.existsSync(moduleDir)) {
          skips.push(note('module path not found'))
          continue
        }

        const parsedModule = await parseDir(moduleDir)
        if (!parsedModule.ok) return parsedModule

        // Expand for_each (or fall back to a single iteration).
        const elements = expandForEach(block.for_each, callerScope) ?? [
          { key: '', value: undefined },
        ]
        // An empty resolved collection (e.g. `for_each = toset([])`) →
        // no instances: skip silently (correct, like count=0).
        if (elements.length === 0) continue

        for (const el of elements) {
          // Module scope: its own defaults/locals, then caller inputs win.
          const moduleScope = buildScope(
            parsedModule.value.map((f) => f.parsed),
          )
          for (const [name, value] of Object.entries(block)) {
            if (MODULE_META.has(name)) continue
            const resolved = resolveRaw(value, callerScope)
            moduleScope.set(
              `var.${name}`,
              resolved !== undefined ? resolved : value,
            )
          }
          // Thread each.* into the module scope when expanded from for_each.
          if (el.key !== '') {
            moduleScope.set('each.value', el.value)
            moduleScope.set('each.key', el.key)
          }
          // Provider defaults for this module dir, merged with the inherited
          // chain: the child's own provider blocks (resolved against the
          // child's scope) override the inherited defaults on key conflicts.
          const childPd = mergeProviderDefaults(
            inheritedPd,
            providerDefaults(
              parsedModule.value.map((f) => f.parsed),
              moduleScope,
            ),
          )
          // Provider-alias remap from the module call's `providers = { aws =
          // aws.dr }` map: child provider name → parent alias. Applied to the
          // child's DEFAULT-provider resources (no explicit `provider` arg)
          // so a module run under a remapped provider inherits the alias (#13).
          // Explicit `provider = aws.x` on a child resource wins and is NOT
          // remapped; nested-module remaps are relative to the child (one
          // level — a documented limitation).
          const providerAliasRemap = new Map<string, string>()
          const pm = block.providers
          if (pm && typeof pm === 'object' && !Array.isArray(pm)) {
            for (const [childName, ref] of Object.entries(
              pm as Record<string, unknown>,
            )) {
              if (typeof ref === 'string') {
                const s = ref.replace(/^\$\{|\}$/g, '').trim()
                const dot = s.indexOf('.')
                if (dot !== -1)
                  providerAliasRemap.set(childName, s.slice(dot + 1))
              }
            }
          }
          // Provider regions: merge the child dir's own provider blocks with
          // the inherited chain (child's aliases override parent's). Threaded
          // to `normalize` so a resource's `providerRegion` resolves.
          const childRegions = mergeProviderRegions(
            inheritedRegions,
            providerRegions(parsedModule.value.map((f) => f.parsed)),
          )
          // Per-instance trace. for_each expansions append `[key]`; the
          // synthetic '?' marks an unresolvable for_each (one iteration, no
          // each bindings) and is omitted from the label.
          const keyTag = el.key && el.key !== '?' ? `[${el.key}]` : ''
          // Cross-file index of the child module's own
          // `data.aws_iam_policy_document` policies (data sources are
          // module-local in Terraform — a child does NOT inherit the
          // parent's). Threaded to normalize so a consuming resource's
          // `policy = data.aws_iam_policy_document.x.json` resolves.
          const childDataPolicies = buildDataPolicies(
            parsedModule.value.map((f) => f.parsed),
          )
          // Compute the trace prefix for nested recursion BEFORE normalizing
          // the child. We recurse into nested modules FIRST so that a child
          // resource's `policy = module.inner.x` AND a child output passthrough
          // (`output y = module.inner.x`) can both resolve against the
          // grandchild moduleOutputPolicies.
          let childTraceRoot = ''
          for (const m of parsedModule.value) {
            const modRel = toPosix(path.relative(projectRoot, m.file))
            const base = traceRoot ? `${traceRoot} › ${modRel}` : modRel
            if (!childTraceRoot) childTraceRoot = base
          }
          if (!childTraceRoot) {
            const modRel = toPosix(path.relative(projectRoot, moduleDir))
            childTraceRoot = traceRoot ? `${traceRoot} › ${modRel}` : modRel
          }
          childTraceRoot = `${childTraceRoot} (${label}${keyTag})`

          // Recurse: the child's OWN `module {}` calls (nested modules) — FIRST,
          // so the child can consume / re-export their outputs.
          const nested = await followModules(
            parsedModule.value,
            childTraceRoot,
            projectRoot,
            moduleScope,
            environmentOverride,
            new Set([...pathStack, moduleDir]),
            childPd,
            childRegions,
          )
          if (!nested.ok) return nested
          // Grandchild `<label>.<output>` → PolicyInfo (built while following
          // the child's sub-modules). Feeds BOTH the child's normalize
          // (resource-side `policy = module.inner.x`) and the child's output
          // index (passthrough re-export).
          const grandchildPolicies = nested.value.moduleOutputPolicies

          // Index the child's `output`s (keyed `<label>.<output>`) so a PARENT
          // resource's `policy = module.<label>.<output>` resolves. Resolves a
          // data-source ref (base case) AND a passthrough
          // (`output x = module.inner.y`) via the grandchild index above.
          for (const [k, v] of buildModuleOutputPolicies(
            parsedModule.value.map((f) => f.parsed),
            childDataPolicies,
            label,
            grandchildPolicies,
          ))
            moduleOutputPolicies.set(k, v)

          // Normalize the child's resources — grandchildPolicies lets a child
          // resource consume a nested module's policy output.
          for (const m of parsedModule.value) {
            const modRel = toPosix(path.relative(projectRoot, m.file))
            const base = traceRoot ? `${traceRoot} › ${modRel}` : modRel
            const trace = `${base} (${label}${keyTag})`
            out.push(
              ...normalize(
                m.parsed,
                trace,
                m.text,
                moduleScope,
                environmentOverride,
                childPd,
                providerAliasRemap,
                childRegions,
                childDataPolicies,
                grandchildPolicies,
              ),
            )
            // Outputs declared in the followed module — normalize with the
            // traced file (a leak in a module output names the hop).
            outputs.push(
              ...normalizeOutputs(m.parsed, trace, m.text, moduleScope),
            )
            // Bindings (variables/locals) declared in the followed module.
            bindings.push(...normalizeBindings(m.parsed, trace, m.text))
            // Settings (terraform block) declared in the followed module.
            settings.push(...normalizeSettings(m.parsed, trace, m.text))
            // Inline ignores in the module file — keyed by the PHYSICAL file
            // path (modRel, before the › trace) so they match findings from
            // every instantiation of this module.
            ignores.push(...scanIgnores(m.text, modRel))
            // Ungoverned resources in the followed module file.
            ungoverned.push(...collectUngoverned(m.parsed, trace, m.text))
          }

          out.push(...nested.value.resources)
          skips.push(...nested.value.skips)
          outputs.push(...nested.value.outputs)
          bindings.push(...nested.value.bindings)
          settings.push(...nested.value.settings)
          moduleCalls.push(...nested.value.moduleCalls)
          ignores.push(...nested.value.ignores)
          ungoverned.push(...nested.value.ungoverned)
        }
      }
    }
  }
  return ok({
    resources: out,
    skips,
    outputs,
    bindings,
    settings,
    moduleCalls,
    ignores,
    ungoverned,
    moduleOutputPolicies,
  })
}

/**
 * Read a terraform directory, parse each .tf via the official parser
 * (hcl2json / WASM), and normalize into pluvian's model. Async because
 * the WASM parser is async. Reported file paths are made relative to
 * `projectRoot` (defaults to `dir`) so output is readable and portable —
 * and, for multi-root layouts, shows which root each finding came from.
 * A single `parseTf` call builds ONE scope, so calling it once per root
 * keeps each root's `var`/`local` values isolated. Local `module {}` calls
 * are followed (doc 08), evaluating the module's resources with the
 * caller's inputs threaded in as `var.*`. Non-followed modules (remote
 * source, project escape, missing dir) are returned as `skips` so the CLI
 * can surface them as could-not-evaluate (doc 08 DoD — never a silent pass).
 */
export async function parseTf(
  dir: string,
  projectRoot: string = dir,
  environmentOverride?: string,
): Promise<Result<ParseOutput, EngineError>> {
  const parsedFiles = await parseDir(dir)
  if (!parsedFiles.ok) return parsedFiles

  // Build the cross-file var/local scope, then normalize direct resources.
  const scope = buildScope(parsedFiles.value.map((p) => p.parsed))
  // Provider default_tags/default_labels declared in this root dir — every
  // direct resource inherits them, and they're threaded into followed modules
  // (a child with no provider block inherits the root's defaults).
  const pd = providerDefaults(
    parsedFiles.value.map((p) => p.parsed),
    scope,
  )
  // Provider alias→region map for this root dir — threaded to `normalize`
  // (for providerRegion on resources) and into `followModules` (children
  // inherit the root's regions for GDPR/LGPD residency rules).
  const regions = providerRegions(parsedFiles.value.map((p) => p.parsed))
  // Cross-file index of `data.aws_iam_policy_document` policies — lets a
  // consuming resource's `policy = data.aws_iam_policy_document.x.json`
  // resolve to the data source's parsed statements. Scoped per-directory
  // (data sources are module-local in Terraform).
  const dataPolicies = buildDataPolicies(parsedFiles.value.map((p) => p.parsed))
  const rootRel = toPosix(path.relative(projectRoot, dir))

  // Follow local module calls FIRST. A root resource may consume a child
  // module's exposed policy via `policy = module.<label>.<output>`, so the
  // module-output policy index (built while following) must exist before root
  // resources normalize. Order of the returned `resources` array is preserved
  // (root resources appended AFTER followed ones — but evaluate builds its
  // indexes from ALL resources, so order does not affect verdicts).
  const followed = await followModules(
    parsedFiles.value,
    rootRel,
    projectRoot,
    scope,
    environmentOverride,
    new Set(),
    pd,
    regions,
  )
  if (!followed.ok) return followed

  const resources: NormalizedResource[] = []
  const outputs: NormalizedOutput[] = []
  const bindings: NormalizedBinding[] = []
  const settings: NormalizedTerraformSettings[] = []
  const moduleCalls: NormalizedModuleCall[] = []
  const ignores: IgnoreDirective[] = []
  const ungoverned: UngovernedResource[] = []
  for (const { file, text, parsed } of parsedFiles.value) {
    const rel = toPosix(path.relative(projectRoot, file))
    resources.push(
      ...normalize(
        parsed,
        rel,
        text,
        scope,
        environmentOverride,
        pd,
        undefined,
        regions,
        dataPolicies,
        followed.value.moduleOutputPolicies,
      ),
    )
    // Ungoverned resources in this root file (type not in vocabulary).
    ungoverned.push(...collectUngoverned(parsed, rel, text))
    // Direct outputs in this root (the common case — outputs live at the
    // root, not inside child modules).
    outputs.push(...normalizeOutputs(parsed, rel, text, scope))
    // Direct bindings (variables/locals) in this root.
    bindings.push(...normalizeBindings(parsed, rel, text))
    // Direct terraform settings in this root.
    settings.push(...normalizeSettings(parsed, rel, text))
    // Inline ignore directives in this root file.
    ignores.push(...scanIgnores(text, rel))
  }

  resources.push(...followed.value.resources)
  outputs.push(...followed.value.outputs)
  bindings.push(...followed.value.bindings)
  settings.push(...followed.value.settings)
  moduleCalls.push(...followed.value.moduleCalls)
  ignores.push(...followed.value.ignores)
  ungoverned.push(...followed.value.ungoverned)

  // If NO terraform {} block was found in any file (root or followed module),
  // synthesize a default entry so settings-surface rules still evaluate
  // against the implicit defaults (no backend = local, no required_version =
  // floating). Without this, requireEncryptedBackend / denyLocalBackend /
  // requireExactTerraformVersion would silently not fire — a false negative.
  if (settings.length === 0) {
    settings.push({
      requiredVersion: undefined,
      requiredProviders: [],
      backend: undefined,
      file: rootRel,
      line: 1,
    })
  }

  return ok({
    resources,
    skips: followed.value.skips,
    outputs,
    bindings,
    settings,
    moduleCalls,
    ignores,
    ungoverned,
    moduleOutputPolicies: followed.value.moduleOutputPolicies,
  })
}
