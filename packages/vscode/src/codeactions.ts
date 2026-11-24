// Pure logic for the ignore Quick Fix — no `vscode` import, unit-testable.
// The fix inserts an OWN-LINE directive directly above the finding's
// block-start line; the engine's scanner attaches an own-line directive to
// the NEXT block-start at-or-after it, so inserting immediately above the
// block always targets exactly that resource — even when other comments or
// directives already sit above it.
export interface IgnoreEdit {
  /** 1-based line the directive is inserted BEFORE. */
  readonly insertBeforeLine: number
  /** Full directive line text (no trailing newline). */
  readonly text: string
}

/**
 * Build the ignore edit for a finding on `blockLine` (1-based block start,
 * exactly what the engine reports and the diagnostic carries).
 *
 * The directive is rule-scoped (`# pluvian:ignore <ruleId>: <reason>`) —
 * the Quick Fix never emits the suppress-everything form — and the reason
 * ships as a placeholder the human must fill before saving: an ignore is
 * a decision with a justification, not a dismiss button.
 */
export function ignoreEdit(
  lines: readonly string[],
  blockLine: number,
  ruleId: string,
  reason = '<reason>',
): IgnoreEdit {
  const clamped = Math.max(1, blockLine)
  // Match the block's indentation so the comment reads as part of it.
  const blockText = lines[clamped - 1] ?? ''
  const indent = /^[ \t]*/.exec(blockText)?.[0] ?? ''
  return {
    insertBeforeLine: clamped,
    text: `${indent}# pluvian:ignore ${ruleId}: ${reason}`,
  }
}
