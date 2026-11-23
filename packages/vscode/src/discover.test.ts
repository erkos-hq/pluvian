import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { discoverProjects } from './discover'

const dir = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'pluvian-disc-'))

const project = (root: string, name = 'proj'): string => {
  const p = path.join(root, name)
  fs.mkdirSync(p, { recursive: true })
  fs.writeFileSync(path.join(p, 'pluvian.json'), '{}')
  return p
}

describe('discoverProjects', () => {
  it('a workspace folder that IS a project is returned as-is', () => {
    const root = project(dir())
    expect(discoverProjects([root])).toEqual([root])
  })

  it('nested projects under an opened parent folder are found (the P2 case)', () => {
    const parent = dir()
    const positivo = project(parent, 'positivo')
    const negativo = project(parent, 'negativo')
    // Deterministic order: bytewise alphabetical, independent of locale.
    expect(discoverProjects([parent])).toEqual([negativo, positivo])
  })

  it('multiple workspace folders each contribute their projects', () => {
    const a = project(dir(), 'a')
    const parentB = dir()
    const b1 = project(parentB, 'b1')
    const b2 = project(parentB, 'b2')
    expect(discoverProjects([a, parentB])).toEqual([a, b1, b2])
  })

  it('the .pluvian/pluvian.json candidate also marks a project', () => {
    const root = dir()
    const p = path.join(root, 'dotted')
    fs.mkdirSync(path.join(p, '.pluvian'), { recursive: true })
    fs.writeFileSync(path.join(p, '.pluvian', 'pluvian.json'), '{}')
    expect(discoverProjects([root])).toEqual([p])
  })

  it('a discovered project stops the descent (no nested projects)', () => {
    const parent = dir()
    const outer = project(parent, 'outer')
    const inner = project(outer, 'inner') // would be found only by descending
    expect(discoverProjects([parent])).toEqual([outer])
    expect(discoverProjects([parent])).not.toContain(inner)
  })

  it('node_modules and VCS dirs are never scanned', () => {
    const parent = dir()
    const skipped = project(path.join(parent, 'node_modules'), 'fake')
    expect(discoverProjects([parent])).toEqual([])
    expect(skipped).toBeTruthy()
  })

  it('deep projects beyond the depth cap are not found', () => {
    const parent = dir()
    let deep = parent
    for (let i = 0; i < 8; i++) deep = path.join(deep, `d${i}`)
    const p = project(deep)
    expect(discoverProjects([parent])).toEqual([])
    expect(p).toBeTruthy()
  })

  it('nonexistent folders are skipped, not thrown', () => {
    expect(discoverProjects(['/nonexistent-pluvian-test'])).toEqual([])
  })
})
