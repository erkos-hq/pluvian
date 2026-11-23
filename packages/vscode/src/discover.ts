// Pure project discovery — no `vscode` import, fully unit-testable.
// A "project" is a directory whose own root carries pluvian.json (or
// .pluvian/pluvian.json) — the same contract the CLI checks from cwd.
// Discovery answers TWO layouts with one rule:
//   - multi-root workspaces: each workspace folder that is itself a project;
//   - a parent folder opened directly: pluvian projects NESTED in
//     subdirectories (the "I opened the folder containing my projects" case).
// A discovered project stops the descent (projects don't nest), and
// dependency/VCS directories are never scanned.
import * as fs from 'fs'
import * as path from 'path'

const CONFIG_CANDIDATES = [
  'pluvian.json',
  path.join('.pluvian', 'pluvian.json'),
]

/** Never scanned, regardless of depth. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.vscode',
  'dist',
  'out',
  'coverage',
  '.vsce-pack',
  '.smoke-tmp',
])

/** Hard bounds so a pathological tree can't stall activation. */
const MAX_DEPTH = 5
const MAX_SCANNED_DIRS = 2000

const isProject = (dir: string): boolean =>
  CONFIG_CANDIDATES.some((rel) => fs.existsSync(path.join(dir, rel)))

/**
 * Discover pluvian project roots under the given workspace folders, in
 * deterministic order (folders in order; within a folder, depth-first
 * alphabetical). A folder that IS a project is returned without scanning
 * its children.
 */
export function discoverProjects(folders: readonly string[]): string[] {
  const roots: string[] = []
  let scanned = 0
  const scan = (dir: string, depth: number): void => {
    if (scanned >= MAX_SCANNED_DIRS) return
    scanned++
    let entries: fs.Dirent[]
    try {
      entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
        // Bytewise, NOT localeCompare: discovery order must be identical
        // on every machine/locale (CI included) — findings order rides it.
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    } catch {
      return // unreadable dir — honest skip, not a crash
    }
    for (const entry of entries) {
      if (scanned >= MAX_SCANNED_DIRS) return
      const child = path.join(dir, entry.name)
      if (isProject(child)) {
        roots.push(child)
      } else if (depth + 1 < MAX_DEPTH) {
        scan(child, depth + 1)
      }
    }
  }
  for (const folder of folders) {
    if (!fs.existsSync(folder)) continue
    if (isProject(folder)) {
      roots.push(folder)
      continue // a project root is not scanned for nested projects
    }
    scan(folder, 0)
  }
  return roots
}
