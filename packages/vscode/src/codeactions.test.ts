import { describe, it, expect } from 'vitest'
import { ignoreEdit } from './codeactions'

const lines = [
  '# a comment header', // 1
  'resource "aws_security_group" "web" {', // 2
  '  name = "web-sg"', // 3
  '}', // 4
]

describe('ignoreEdit', () => {
  it('builds a rule-scoped directive with the reason placeholder', () => {
    const edit = ignoreEdit(lines, 2, 'no-open-ssh')
    expect(edit.text).toBe('# pluvian:ignore no-open-ssh: <reason>')
    expect(edit.insertBeforeLine).toBe(2)
  })

  it('inserts directly above the block-start line', () => {
    const edit = ignoreEdit(lines, 2, 'ownership-tags')
    expect(edit.insertBeforeLine).toBe(2)
  })

  it('matches the block line indentation', () => {
    const nested = ['', 'module "x" {', '  resource "aws_db_instance" "db" {']
    const edit = ignoreEdit(nested, 3, 'protect-stateful-data')
    expect(edit.text).toBe('  # pluvian:ignore protect-stateful-data: <reason>')
  })

  it('never emits the suppress-everything form', () => {
    const edit = ignoreEdit(lines, 2, 'any-rule')
    expect(edit.text).not.toMatch(/pluvian:ignore: /) // no bare colon form
    expect(edit.text).toContain('any-rule')
  })

  it('line 1 (file start) is a valid insertion point', () => {
    const edit = ignoreEdit(lines, 1, 'r')
    expect(edit.insertBeforeLine).toBe(1)
  })

  it('clamps out-of-range lines defensively', () => {
    const edit = ignoreEdit(lines, 99, 'r')
    expect(edit.insertBeforeLine).toBe(99)
    expect(edit.text).toBe('# pluvian:ignore r: <reason>') // no indent source
  })

  it('accepts a concrete reason', () => {
    const edit = ignoreEdit(lines, 2, 'no-open-ssh', 'bastion exception')
    expect(edit.text).toBe('# pluvian:ignore no-open-ssh: bastion exception')
  })
})
