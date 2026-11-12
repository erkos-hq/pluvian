// Extension host glue: the ONLY module that imports `vscode`. Everything
// testable lives in the pure modules (diagnostics, engine-bridge, debounce).
import * as path from 'path'
import * as vscode from 'vscode'
import { readEngineConfig, type EngineError } from '@erkos/pluvian'
import { pinMismatch, runCheck } from './engine-bridge'
import { mapReport, type FindingItem, type Severity } from './diagnostics'
import { debounce } from './debounce'

const DEBOUNCE_MS = 500

const SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
}

function describeError(e: EngineError): string {
  switch (e.kind) {
    case 'ConfigNotFound':
      return `pluvian.json not found at ${e.path}`
    case 'ConfigInvalid':
      return `pluvian: invalid pluvian.json (${e.path}): ${e.detail}`
    case 'VersionMismatch':
      return `pluvian: spec pins engine ${e.required}, this extension bundles ${e.running}`
    case 'SpecLoadFailed':
      return `pluvian: could not load spec (${e.path}): ${e.detail}`
    case 'SpecInvalid':
      return `pluvian: spec is invalid:\n${e.errors
        .map((x) => `  rule #${x.ruleIndex}: ${x.problem}`)
        .join('\n')}`
    case 'PathNotFound':
      return `pluvian: path not found: ${e.path}`
    case 'ParseFailed':
      return `pluvian: failed to parse ${e.file}: ${e.detail}`
  }
}

export function activate(context: vscode.ExtensionContext): void {
  // Single-root P1 (multi-root is P2, spec 11).
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return
  const root = folder.uri.fsPath

  // Dormancy: a workspace without pluvian.json gets nothing — no UI, no
  // watchers, no status item. Scaffold one with `pluvian init` first.
  if (!readEngineConfig(root).ok) return

  const output = vscode.window.createOutputChannel('pluvian')
  const diagnostics = vscode.languages.createDiagnosticCollection('pluvian')
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0,
  )
  status.name = 'pluvian'
  status.command = 'pluvian.checkProject'
  status.tooltip = 'pluvian — click to re-check the project'
  status.text = 'pluvian …'
  status.show()

  let pinNotified = false
  let running = false

  const toDiagnostic = (item: FindingItem): vscode.Diagnostic => {
    // The engine reports block-start LINES, not columns: squiggle the
    // whole line when the document is open, an empty range otherwise.
    const lineIdx = Math.max(0, item.line - 1)
    const doc = vscode.workspace.textDocuments.find(
      (d) => d.uri.fsPath === path.join(root, item.file),
    )
    const range =
      doc && lineIdx < doc.lineCount
        ? doc.lineAt(lineIdx).range
        : new vscode.Range(lineIdx, 0, lineIdx, 0)
    const diag = new vscode.Diagnostic(
      range,
      item.message,
      SEVERITY[item.severity],
    )
    diag.source = 'pluvian'
    diag.code = item.ruleId
    return diag
  }

  const run = async (reason: string): Promise<void> => {
    if (running) return
    running = true
    try {
      const outcome = await runCheck(root)
      if (!outcome.ok) {
        const msg = describeError(outcome.error)
        output.appendLine(`[${reason}] ${msg}`)
        void vscode.window.showErrorMessage(msg)
        diagnostics.clear()
        status.text = 'pluvian ✗'
        status.tooltip = msg
        return
      }

      // Never refuse over a pin mismatch — surface it once, run anyway.
      const mm = pinMismatch(outcome.pinnedVersion, outcome.engineVersion)
      if (mm && !pinNotified) {
        pinNotified = true
        void vscode.window.showInformationMessage(
          `pluvian: spec pins engine ${mm.pinned}, extension bundles ${mm.running} — align to keep editor and CI verdicts identical`,
        )
      }

      const cfg = vscode.workspace.getConfiguration('pluvian')
      const mapped = mapReport(outcome.report, {
        showCouldNotEvaluate: cfg.get<boolean>('showCouldNotEvaluate', true),
        showUngoverned: cfg.get<boolean>('showUngoverned', false),
      })

      diagnostics.clear()
      const byFile = new Map<string, vscode.Diagnostic[]>()
      for (const item of mapped.items) {
        const list = byFile.get(item.file) ?? []
        list.push(toDiagnostic(item))
        byFile.set(item.file, list)
      }
      for (const [file, diags] of byFile) {
        diagnostics.set(
          vscode.Uri.joinPath(folder.uri, ...file.split('/')),
          diags,
        )
      }

      const { report } = outcome
      output.appendLine(
        `[${reason}] ${report.violations.length} violation(s), ` +
          `${report.passed} passed, ${report.couldNotEvaluate.length} could ` +
          `not be evaluated, ${report.ungoverned.length} ungoverned`,
      )
      for (const line of mapped.projectLevel) output.appendLine(`  ${line}`)
      for (const v of report.violations) {
        output.appendLine(
          `  ✗ ${v.resource} (${v.file}:${v.line}) — ${v.message}`,
        )
      }

      status.text =
        `pluvian ✓ ${report.passed} · ✗ ${report.violations.length} · ` +
        `? ${report.couldNotEvaluate.length}`
      status.tooltip = 'pluvian — click to re-check the project'
    } finally {
      running = false
    }
  }

  const schedule = debounce(() => void run('file change'), DEBOUNCE_MS)
  const isTf = (doc: vscode.TextDocument): boolean =>
    doc.uri.scheme === 'file' && doc.fileName.endsWith('.tf')
  const isContract = (doc: vscode.TextDocument): boolean =>
    doc.uri.scheme === 'file' &&
    (path.basename(doc.fileName) === 'pluvian.json' ||
      /\.pluvian[/\\].*\.ts$/.test(doc.fileName))

  const tfWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, '**/*.tf'),
  )
  const specWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, '**/.pluvian/**'),
  )
  const configWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, 'pluvian.json'),
  )

  const checkCommand = vscode.commands.registerCommand(
    'pluvian.checkProject',
    () => void run('command'),
  )

  context.subscriptions.push(
    output,
    diagnostics,
    status,
    checkCommand,
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isTf(doc) || isContract(doc)) schedule()
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isTf(doc)) schedule()
    }),
    tfWatcher,
    specWatcher,
    configWatcher,
  )
  tfWatcher.onDidChange(schedule, null, context.subscriptions)
  tfWatcher.onDidCreate(schedule, null, context.subscriptions)
  tfWatcher.onDidDelete(schedule, null, context.subscriptions)
  specWatcher.onDidChange(schedule, null, context.subscriptions)
  specWatcher.onDidCreate(schedule, null, context.subscriptions)
  specWatcher.onDidDelete(schedule, null, context.subscriptions)
  configWatcher.onDidChange(schedule, null, context.subscriptions)
  configWatcher.onDidCreate(schedule, null, context.subscriptions)
  configWatcher.onDidDelete(schedule, null, context.subscriptions)

  void run('startup')
}

export function deactivate(): void {
  // Disposal rides context.subscriptions.
}
