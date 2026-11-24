// Extension host glue: the ONLY module that imports `vscode`. Everything
// testable lives in the pure modules (diagnostics, engine-bridge, debounce,
// discover).
import * as path from 'path'
import * as vscode from 'vscode'
import { type EngineError } from '@erkos/pluvian'
import { pinMismatch, runCheck } from './engine-bridge'
import { mapReport, type FindingItem, type Severity } from './diagnostics'
import { debounce } from './debounce'
import { discoverProjects } from './discover'
import { ignoreEdit } from './codeactions'

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
  // P2 multi-root/nested discovery (spec 11): projects are found per
  // workspace folder — either the folder itself is a pluvian project
  // (multi-root) or pluvian projects live nested under it (the "I opened
  // the parent folder" case). Each project checks independently, with
  // isolated scope — exactly how the CLI treats multiple roots.
  const folders = vscode.workspace.workspaceFolders ?? []
  const projects = discoverProjects(folders.map((f) => f.uri.fsPath))
  const dormant = projects.length === 0

  // Display name for output lines: path relative to the enclosing workspace
  // folder (falls back to basename — covers nested projects).
  const displayName = (root: string): string => {
    for (const folder of folders) {
      const rel = path.relative(folder.uri.fsPath, root)
      if (rel && !rel.startsWith('..')) return rel
    }
    return path.basename(root) || root
  }

  // The palette command is ALWAYS registered: VS Code renders statically
  // contributed commands even when activation never wired them, and an
  // unregistered command surfaces as VS Code's raw "command not found".
  // Dormant must explain, not error.
  context.subscriptions.push(
    vscode.commands.registerCommand('pluvian.checkProject', () => {
      if (dormant) {
        void vscode.window.showInformationMessage(
          'pluvian is dormant: no pluvian.json found in this workspace ' +
            '(root or subfolders). Open a pluvian project folder, or ' +
            'scaffold one with `npx @erkos/pluvian init`.',
        )
        return
      }
      void run('command')
    }),
  )

  if (dormant) return

  const output = vscode.window.createOutputChannel('pluvian')
  const diagnostics = vscode.languages.createDiagnosticCollection('pluvian')
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0,
  )
  status.name = 'pluvian'
  status.command = 'pluvian.checkProject'
  status.tooltip = 'pluvian — click to re-check all projects'
  status.text = 'pluvian …'
  status.show()

  let pinNotified = false
  let running = false

  const toDiagnostic = (item: FindingItem, root: string): vscode.Diagnostic => {
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
      const cfg = vscode.workspace.getConfiguration('pluvian')
      const visibility = {
        showCouldNotEvaluate: cfg.get<boolean>('showCouldNotEvaluate', true),
        showUngoverned: cfg.get<boolean>('showUngoverned', false),
      }

      diagnostics.clear()
      let violations = 0
      let passed = 0
      let couldNotEvaluate = 0
      let errors = 0

      for (const root of projects) {
        const label = displayName(root)
        const outcome = await runCheck(root)
        if (!outcome.ok) {
          // One project failing operationally must not blank the others'
          // diagnostics or stop the sweep — log it, popup only the first.
          errors++
          const msg = describeError(outcome.error)
          output.appendLine(`[${reason}] ${label}: ${msg}`)
          if (errors === 1) void vscode.window.showErrorMessage(msg)
          continue
        }

        // Never refuse over a pin mismatch — surface it once, run anyway.
        const mm = pinMismatch(outcome.pinnedVersion, outcome.engineVersion)
        if (mm && !pinNotified) {
          pinNotified = true
          void vscode.window.showInformationMessage(
            `pluvian: spec pins engine ${mm.pinned}, extension bundles ${mm.running} — align to keep editor and CI verdicts identical`,
          )
        }

        const report = outcome.report
        violations += report.violations.length
        passed += report.passed
        couldNotEvaluate += report.couldNotEvaluate.length

        const mapped = mapReport(report, visibility)
        const byFile = new Map<string, vscode.Diagnostic[]>()
        for (const item of mapped.items) {
          const list = byFile.get(item.file) ?? []
          list.push(toDiagnostic(item, root))
          byFile.set(item.file, list)
        }
        for (const [file, diags] of byFile) {
          diagnostics.set(
            vscode.Uri.joinPath(vscode.Uri.file(root), ...file.split('/')),
            diags,
          )
        }

        output.appendLine(
          `[${reason}] ${label}: ${report.violations.length} violation(s), ` +
            `${report.passed} passed, ${report.couldNotEvaluate.length} could ` +
            `not be evaluated, ${report.ungoverned.length} ungoverned`,
        )
        for (const line of mapped.projectLevel) output.appendLine(`  ${line}`)
        for (const v of report.violations) {
          output.appendLine(
            `  ✗ ${v.resource} (${v.file}:${v.line}) — ${v.message}`,
          )
        }
      }

      status.text =
        `pluvian ✓ ${passed} · ✗ ${violations} · ? ${couldNotEvaluate}` +
        (errors > 0 ? ` ⚠ ${errors}` : '')
      status.tooltip =
        `pluvian — ${projects.length} project(s)` +
        (errors > 0 ? `, ${errors} failed to run` : '') +
        ' · click to re-check'
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

  // Watchers are per workspace folder; the recursive patterns cover
  // nested projects. `**/pluvian.json` catches nested configs too.
  for (const folder of folders) {
    const tfWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, '**/*.tf'),
    )
    const specWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, '**/.pluvian/**'),
    )
    const configWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, '**/pluvian.json'),
    )
    context.subscriptions.push(tfWatcher, specWatcher, configWatcher)
    tfWatcher.onDidChange(schedule, null, context.subscriptions)
    tfWatcher.onDidCreate(schedule, null, context.subscriptions)
    tfWatcher.onDidDelete(schedule, null, context.subscriptions)
    specWatcher.onDidChange(schedule, null, context.subscriptions)
    specWatcher.onDidCreate(schedule, null, context.subscriptions)
    specWatcher.onDidDelete(schedule, null, context.subscriptions)
    configWatcher.onDidChange(schedule, null, context.subscriptions)
    configWatcher.onDidCreate(schedule, null, context.subscriptions)
    configWatcher.onDidDelete(schedule, null, context.subscriptions)
  }
  context.subscriptions.push(
    output,
    diagnostics,
    status,
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isTf(doc) || isContract(doc)) schedule()
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isTf(doc)) schedule()
    }),
  )

  // Quick Fix (spec 11 P2): on a pluvian finding, offer to insert the
  // rule-scoped ignore directive above the block. The reason placeholder
  // must be filled by the human before the next save — an ignore is a
  // decision with a justification, not a dismiss button.
  const ignoreProvider: vscode.CodeActionProvider = {
    provideCodeActions: (document, range) => {
      const diags = vscode.languages
        .getDiagnostics(document.uri)
        .filter(
          (d) =>
            d.source === 'pluvian' &&
            d.range.start.line <= range.end.line &&
            d.range.end.line >= range.start.line,
        )
      const seen = new Set<string>()
      const actions: vscode.CodeAction[] = []
      for (const diag of diags) {
        const ruleId = typeof diag.code === 'string' ? diag.code : undefined
        if (!ruleId || seen.has(ruleId)) continue
        seen.add(ruleId)
        const edit = ignoreEdit(
          document.getText().split('\n'),
          diag.range.start.line + 1,
          ruleId,
        )
        const action = new vscode.CodeAction(
          `pluvian: ignore "${ruleId}" on this block`,
          vscode.CodeActionKind.QuickFix,
        )
        const workspaceEdit = new vscode.WorkspaceEdit()
        workspaceEdit.insert(
          document.uri,
          new vscode.Position(edit.insertBeforeLine - 1, 0),
          edit.text + '\n',
        )
        action.edit = workspaceEdit
        actions.push(action)
      }
      return actions
    },
  }
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [{ language: 'terraform' }, { pattern: '**/*.tf' }],
      ignoreProvider,
    ),
  )

  void run('startup')
}

export function deactivate(): void {
  // Disposal rides context.subscriptions.
}
