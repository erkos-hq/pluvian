import { CheckReport, Violation } from '../engine/evaluate'
import { EngineError } from '../result/errors'
import { Effect } from '../vocabulary'

const assertNever = (x: never): never => {
  throw new Error(`unhandled: ${JSON.stringify(x)}`)
}

const byEffect = (r: CheckReport, e: Effect): Violation[] =>
  r.violations.filter((v) => v.effect === e)

// Tiny ANSI helper — no dependency (stay pure-JS, minimal deps).
const ANSI = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

type Painter = (text: string, ...codes: string[]) => string
const makePaint =
  (color: boolean): Painter =>
  (text, ...codes) =>
    color ? codes.join('') + text + ANSI.reset : text

/** A blocking violation fired (only Block fails the build). */
export const hasBlocking = (r: CheckReport): boolean =>
  r.violations.some((v) => v.effect === Effect.Block)

/** A require_approval rule fired — the pipeline must pause for sign-off. */
export const requiresApproval = (r: CheckReport): boolean =>
  r.violations.some((v) => v.effect === Effect.RequireApproval)

/**
 * Only BLOCK violations fail the build (exit 1). Warnings and
 * require_approval do not hard-fail — the pipeline proceeds (to a manual
 * approval gate when approval is required). See doc 04.
 */
export function reportExitCode(report: CheckReport): 0 | 1 {
  return hasBlocking(report) ? 1 : 0
}

export function renderTerminal(
  report: CheckReport,
  opts: { color?: boolean } = {},
): string {
  const paint = makePaint(opts.color ?? false)
  const lines: string[] = []
  const cne = report.couldNotEvaluate.length

  const section = (
    title: string,
    marker: string,
    tone: string,
    vs: Violation[],
  ) => {
    if (vs.length === 0) return
    lines.push(paint(`── ${title.toUpperCase()} ──`, tone, ANSI.bold))
    for (const v of vs) {
      lines.push(`${paint(marker, tone)} ${v.resource}  (${v.file}:${v.line})`)
      lines.push(`    ${v.message}`)
      if (v.rationale) lines.push(`    ↳ ${v.rationale}`)
      if (v.approvers?.length)
        lines.push(`    approvers: ${v.approvers.join(', ')}`)
    }
  }

  // Most severe first.
  section('blocking', '✗', ANSI.red, byEffect(report, Effect.Block))
  section(
    'approval required',
    '⏸',
    ANSI.yellow,
    byEffect(report, Effect.RequireApproval),
  )
  section('warnings', '‼', ANSI.yellow, byEffect(report, Effect.Warn))

  if (report.couldNotEvaluate.length > 0) {
    lines.push(paint('── COULD NOT EVALUATE ──', ANSI.magenta, ANSI.bold))
    for (const u of report.couldNotEvaluate) {
      lines.push(
        `${paint('?', ANSI.magenta)} ${u.resource}  (${u.file}:${u.line}): ${u.reason} (${u.ruleId})`,
      )
    }
  }

  if (report.ungoverned.length > 0) {
    lines.push(
      paint('── NOT GOVERNED (vocabulary gap) ──', ANSI.yellow, ANSI.bold),
    )
    for (const r of report.ungoverned) {
      lines.push(
        `${paint('•', ANSI.yellow)} ${r.type}.${r.name}  (${r.file}:${r.line})`,
      )
    }
  }

  lines.push('')
  if (report.violations.length === 0) {
    if (cne === 0) {
      // Reserve the unqualified green check for a truly complete pass.
      lines.push(`${paint('✓ passed', ANSI.green)} (${report.passed} checks)`)
    } else {
      // No violations, but some checks couldn't be evaluated — those are
      // gaps to review, not successes, so don't show a clean green ✓.
      lines.push(
        `${paint('⚠ no violations', ANSI.magenta)}, but ${paint(
          `${cne} could not be evaluated`,
          ANSI.magenta,
        )} — review the section above (${report.passed} passed)`,
      )
    }
  } else {
    const count = `${report.violations.length} violation(s)`
    const vmark = hasBlocking(report)
      ? paint(`✗ ${count}`, ANSI.red)
      : paint(`⚠ ${count}`, ANSI.yellow)
    lines.push(
      `${vmark}, ${paint(`${report.passed} passed`, ANSI.green)}, ${paint(`${cne} could not be evaluated`, ANSI.magenta)}`,
    )
    if (requiresApproval(report))
      lines.push(
        paint(
          '⏸ approval required before apply (PLUVIAN_REQUIRES_APPROVAL)',
          ANSI.yellow,
        ),
      )
  }
  return lines.join('\n')
}

/**
 * The JSON output schema version. Frozen for 1.0 — external tooling (CI
 * dashboards, PR annotators) can depend on this shape. Bumped only on a
 * breaking change to the JSON contract (a removed/renamed field); additive
 * fields (a new violation attribute) do NOT bump it (consumers must ignore
 * unknown fields per robust JSON handling). See doc 09.
 */
export const JSON_SCHEMA_VERSION = 1

export function renderJson(report: CheckReport): string {
  return JSON.stringify(
    {
      schemaVersion: JSON_SCHEMA_VERSION,
      ...report,
      requiresApproval: requiresApproval(report),
    },
    null,
    2,
  )
}

/**
 * Tool identity for the SARIF `runs[].tool.driver`. The renderer is pure
 * (no fs/env reads) so it is unit-testable; the CLI passes the engine
 * version (read from package.json) and the package informationUri.
 */
export interface SarifToolInfo {
  readonly version: string
  readonly informationUri: string
}

/** SARIF 2.1.0 schema URI (the OASIS standard). */
const SARIF_SCHEMA =
  'https://docs.oasis-open.org/sarif/sarif/v2.1.0/cs01/schemas/sarif-schema-2.1.0.json'

/**
 * The raw `file` pluvian carries may embed a module-trace annotation from
 * `followModules` — e.g. `modules/rds/main.tf (db_bad)`. That suffix (spaces,
 * parens) is NOT a valid RFC 3986 URI reference, and GitHub/GitLab code-
 * scanning deep-links by `uri`, so a trace-laden uri would 404 the annotation.
 * Strip the annotation for the SARIF `artifactLocation.uri` (the clean
 * filesystem path — what a dashboard opens) and surface the full trace via
 * `properties.moduleTrace` so the pluvian-specific context round-trips.
 */
const TRACE_SUFFIX = /\s*\([^)]*\)\s*$/
const cleanUri = (file: string): string => file.replace(TRACE_SUFFIX, '')
const moduleTraceOf = (file: string): string | undefined => {
  const m = TRACE_SUFFIX.exec(file)
  return m ? file : undefined
}

/**
 * Project-level findings (`requireResource` conditions like the IAM Access
 * Analyzer presence check) carry the synthetic location `<project>:0` — there
 * is no real file or line. SARIF requires `region.startLine >= 1` and a valid
 * URI, so emitting a physical location would fail schema validation (and a
 * bogus deep-link). SARIF permits a result with zero locations (§3.27.5), so
 * these findings carry their context in the message + properties instead.
 */
const isProjectFinding = (file: string, line: number): boolean =>
  file === '<project>' || line <= 0

/**
 * Map a pluvian `Effect` to a SARIF result `level` (none | note | warning |
 * error). `Block` → `error` (fails the build); `Warn` and `RequireApproval`
 * → `warning` (RequireApproval needs human action, not a silent note). The
 * could-not-evaluate / ungoverned informational entries use `note`.
 */
const effectToSarifLevel = (e: Effect): 'error' | 'warning' =>
  e === Effect.Block ? 'error' : 'warning'

/**
 * Render the report as a SARIF 2.1.0 document — the OASIS-standard JSON
 * schema consumed by GitHub Code Scanning (`github/codeql-action/upload-
 * sarif`), GitLab's security report artifacts, Azure DevOps, and VS Code's
 * SARIF viewer. Makes pluvian a first-class CI security stage: findings land
 * in the Security tab / MR widgets with file:line deep-links, alongside
 * semgrep/gitleaks, instead of a CI log.
 *
 * Maps:
 *  - Each violation → a `results[]` entry with ruleId, level (effect→error/
 *    warning), message, file:line `locations`, and a `properties` bag that
 *    round-trips pluvian-specific data (resource, effect, rationale,
 *    approvers) so consumers can filter/group beyond the SARIF baseline.
 *  - Each could-not-evaluate / ungoverned entry → a `note`-level result so
 *    the engine's "gaps must be visible" discipline carries through (they
 *    surface in the dashboard but do NOT gate like violations).
 *  - The deduplicated rule set → `tool.driver.rules[]` (id, message, default
 *    level) so dashboards can group/suppress by rule.
 *
 * Pure function over CheckReport; the engine version + informationUri come
 * from the caller (the CLI reads package.json; tests pass a stub). Output
 * contract per the engine-dev skill is preserved: every violation carries
 * rule/message/resource/file:line/severity/rationale.
 */
export function renderSarif(report: CheckReport, tool: SarifToolInfo): string {
  // Deduplicate rules by id across violations + could-not-evaluate. A rule
  // that fires as a violation sets its default level from the effect; a rule
  // seen ONLY as could-not-evaluate defaults to note.
  const ruleMeta = new Map<
    string,
    { message: string; level: 'error' | 'warning' | 'note' }
  >()
  for (const v of report.violations) {
    if (!ruleMeta.has(v.ruleId))
      ruleMeta.set(v.ruleId, {
        message: v.message,
        level: effectToSarifLevel(v.effect),
      })
  }
  for (const c of report.couldNotEvaluate) {
    if (!ruleMeta.has(c.ruleId))
      ruleMeta.set(c.ruleId, { message: `rule ${c.ruleId}`, level: 'note' })
  }
  const rules = [...ruleMeta.entries()].map(([id, m]) => ({
    id,
    shortDescription: { text: m.message },
    defaultConfiguration: { level: m.level },
  }))

  /**
   * Build a SARIF location array for a finding. Returns `[]` for project-level
   * findings (no valid file:line) so the result carries no physical location
   * (SARIF-permitted) instead of a schema-invalid one. Otherwise emits a
   * clean URI (trace suffix stripped) + startLine, with the pluvian trace
   * annotation surfaced separately via `properties.moduleTrace` by the caller.
   */
  const locationsFor = (
    file: string,
    line: number,
  ): Array<{
    physicalLocation: {
      artifactLocation: { uri: string }
      region: { startLine: number }
    }
  }> => {
    if (isProjectFinding(file, line)) return []
    return [
      {
        physicalLocation: {
          artifactLocation: { uri: cleanUri(file) },
          region: { startLine: line },
        },
      },
    ]
  }

  const violationResults = report.violations.map((v) => ({
    ruleId: v.ruleId,
    level: effectToSarifLevel(v.effect),
    message: { text: v.message },
    locations: locationsFor(v.file, v.line),
    properties: {
      resource: v.resource,
      effect: v.effect,
      ...(v.rationale ? { rationale: v.rationale } : {}),
      ...(v.approvers ? { approvers: v.approvers } : {}),
      ...(moduleTraceOf(v.file) ? { moduleTrace: v.file } : {}),
    },
  }))

  const cneResults = report.couldNotEvaluate.map((c) => ({
    ruleId: c.ruleId,
    level: 'note' as const,
    message: { text: `could not evaluate: ${c.reason}` },
    locations: locationsFor(c.file, c.line),
    properties: {
      resource: c.resource,
      kind: 'couldNotEvaluate',
      ...(moduleTraceOf(c.file) ? { moduleTrace: c.file } : {}),
    },
  }))

  const ungovernedResults = report.ungoverned.map((u) => ({
    ruleId: 'pluvian.ungoverned',
    level: 'note' as const,
    message: { text: `resource type not governed by any rule: ${u.type}` },
    locations: locationsFor(u.file, u.line),
    properties: {
      resource: `${u.type}.${u.name}`,
      kind: 'ungoverned',
      ...(moduleTraceOf(u.file) ? { moduleTrace: u.file } : {}),
    },
  }))

  return JSON.stringify(
    {
      $schema: SARIF_SCHEMA,
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: '@erkos/pluvian',
              version: tool.version,
              informationUri: tool.informationUri,
              rules,
            },
          },
          results: [...violationResults, ...cneResults, ...ungovernedResults],
        },
      ],
    },
    null,
    2,
  )
}

/** Exhaustive over EngineError.kind (doc 06). */
export function renderError(error: EngineError): string {
  switch (error.kind) {
    case 'ConfigNotFound':
      return `✗ pluvian config not found: ${error.path}`
    case 'ConfigInvalid':
      return `✗ invalid pluvian config ${error.path}: ${error.detail}`
    case 'VersionMismatch':
      return [
        `✗ pluvian version mismatch`,
        `  required: ${error.required} (from pluvian.json)`,
        `  running:  ${error.running}`,
        ``,
        `  run: npx @erkos/pluvian@${error.required} check`,
      ].join('\n')
    case 'SpecLoadFailed':
      return `✗ could not load spec ${error.path}: ${error.detail}`
    case 'SpecInvalid':
      return [
        `✗ spec has invalid rules:`,
        ...error.errors.map((e) => `  rule ${e.ruleIndex + 1}: ${e.problem}`),
      ].join('\n')
    case 'PathNotFound':
      return `✗ terraform path not found: ${error.path}`
    case 'ParseFailed':
      return `✗ failed to parse ${error.file}: ${error.detail}`
    default:
      return assertNever(error)
  }
}
