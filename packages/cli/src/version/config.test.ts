import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { enforceVersion, EngineConfig, readEngineConfig } from './config'

const cfg: EngineConfig = {
  version: '1.2.0',
  spec: '.pluvian/spec.ts',
  terraform: './terraform',
}

const VALID = JSON.stringify({
  spec: '.pluvian/spec.ts',
  terraform: 'terraform',
})

const dir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'pluvian-cfg-'))

describe('enforceVersion', () => {
  it('passes when versions match', () => {
    expect(enforceVersion(cfg, '1.2.0')).toEqual({ ok: true, value: cfg })
  })

  it('fails with a VersionMismatch when they differ', () => {
    const r = enforceVersion(cfg, '1.3.0')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toEqual({
        kind: 'VersionMismatch',
        required: '1.2.0',
        running: '1.3.0',
      })
    }
  })

  it('passes when no version is pinned', () => {
    const noPin: EngineConfig = { spec: 's', terraform: 't' }
    expect(enforceVersion(noPin, '9.9.9')).toEqual({ ok: true, value: noPin })
  })
})

describe('readEngineConfig (the railway’s first stage)', () => {
  it('reads pluvian.json from the project root', () => {
    const root = dir()
    fs.writeFileSync(path.join(root, 'pluvian.json'), VALID)
    const r = readEngineConfig(root)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.config.spec).toBe('.pluvian/spec.ts')
      expect(r.value.baseDir).toBe(root)
    }
  })

  it('falls back to .pluvian/pluvian.json', () => {
    const root = dir()
    fs.mkdirSync(path.join(root, '.pluvian'))
    fs.writeFileSync(path.join(root, '.pluvian', 'pluvian.json'), VALID)
    const r = readEngineConfig(root)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.baseDir).toBe(path.join(root, '.pluvian'))
  })

  it('prefers the root candidate when both exist', () => {
    const root = dir()
    fs.mkdirSync(path.join(root, '.pluvian'))
    fs.writeFileSync(path.join(root, 'pluvian.json'), VALID)
    fs.writeFileSync(path.join(root, '.pluvian', 'pluvian.json'), VALID)
    const r = readEngineConfig(root)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.baseDir).toBe(root)
  })

  it('returns ConfigNotFound when neither candidate exists', () => {
    const r = readEngineConfig(dir())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('ConfigNotFound')
      if (r.error.kind === 'ConfigNotFound') {
        expect(r.error.path).toMatch(/pluvian\.json$/)
      }
    }
  })

  it('returns ConfigInvalid for malformed JSON instead of throwing', () => {
    const root = dir()
    fs.writeFileSync(path.join(root, 'pluvian.json'), '{ "spec": , }')
    const r = readEngineConfig(root)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('ConfigInvalid')
      if (r.error.kind === 'ConfigInvalid') {
        expect(r.error.path).toBe(path.join(root, 'pluvian.json'))
        expect(r.error.detail).toBeTruthy()
      }
    }
  })

  it('ConfigInvalid also covers unreadable files (same catch)', () => {
    // A directory named pluvian.json: existsSync is true, readFileSync
    // throws EISDIR — the IO half of the guard, portable across platforms
    // and CI users (no chmod/as-root caveats).
    const root = dir()
    fs.mkdirSync(path.join(root, 'pluvian.json'))
    const r = readEngineConfig(root)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('ConfigInvalid')
  })
})
