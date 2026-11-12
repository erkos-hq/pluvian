import * as fs from 'fs'
import * as path from 'path'
import { Result, ok, err } from '../result/result'
import { EngineError } from '../result/errors'

/**
 * A Terraform root: a bare path, or a path with a declared `environment`
 * so `.environment(X)` rule scoping is folder-driven (not tag-dependent).
 */
export type TerraformRoot =
  string | { readonly path: string; readonly environment?: string }

export interface EngineConfig {
  readonly version?: string
  readonly spec: string
  /** One Terraform root, or several (each evaluated with its own scope). */
  readonly terraform: TerraformRoot | TerraformRoot[]
}

/** Resolved config plus the directory it was found in (for relative paths). */
export interface LoadedConfig {
  readonly config: EngineConfig
  readonly baseDir: string
}

const CANDIDATES = ['pluvian.json', path.join('.pluvian', 'pluvian.json')]

export function readEngineConfig(
  cwd: string,
): Result<LoadedConfig, EngineError> {
  for (const rel of CANDIDATES) {
    const p = path.join(cwd, rel)
    if (fs.existsSync(p)) {
      // The railway starts here — a malformed or unreadable pluvian.json
      // must ride the Err track like every other operational failure, not
      // escape as a raw SyntaxError/ENOENT past the Result contract.
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as EngineConfig
        return ok({ config: parsed, baseDir: path.dirname(p) })
      } catch (e) {
        return err({
          kind: 'ConfigInvalid',
          path: p,
          detail: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }
  return err({ kind: 'ConfigNotFound', path: path.join(cwd, 'pluvian.json') })
}

/**
 * The first thing the CLI does. Refuse to run on a version mismatch
 * (doc 03 / engine-dev skill). No pin configured => proceed.
 */
export function enforceVersion<T extends { version?: string }>(
  config: T,
  running: string,
): Result<T, EngineError> {
  if (!config.version) return ok(config)
  if (config.version === running) return ok(config)
  return err({
    kind: 'VersionMismatch',
    required: config.version,
    running,
  })
}
