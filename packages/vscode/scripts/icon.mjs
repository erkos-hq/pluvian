/**
 * Extension icon generator — "/p" in teal on dark, Red Hat Display Bold
 * glyph paths (no font dependency at raster time).
 *
 * Outputs (relative to packages/vscode/):
 *   icon.png        128×128 — the icon shipped in the VSIX
 *   icon-paths.svg  path-based source of truth for regeneration
 *
 * Usage: node scripts/icon.mjs [scale]   — scale = fraction of the canvas
 * the /p bbox height fills (default 0.58). Try a few, then preview:
 *   open icon-preview.html
 *
 * Rasterization: sharp (resolved from the erkos-dev checkout — pluvian has
 * no raster dep; adjust ICON_RASTERIZER below if that moves).
 */
import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')

const FILL_RATIO = Number(process.argv[2] ?? 0.58)

const require = createRequire(import.meta.url)
const opentype = require('opentype.js') // devDep of this package
const sharp = require('/Users/ealmachado/projects/erkos-dev/node_modules/sharp')

const TTF =
  '/Users/ealmachado/projects/erkos-dev/brand/fonts/RedHatDisplay-Bold.ttf'
const font = opentype.parse(readFileSync(TTF))

// Serialize Path commands with our own rounding — do NOT use
// Path.toPathData(): opentype.js's roundDecimal builds scientific notation
// by string concat and caches NaN forever for denormal decimal parts
// (poisoned coordinates land in the d attribute and librsvg drops the
// path). See docs/LESSONS.md 2026-11-27 and erkos-dev brand/generate.mjs.
function pathToD(p) {
  const fmt = (v) => {
    const r = Math.round(v * 100) / 100
    return Number.isInteger(r) ? String(r) : r.toFixed(2)
  }
  let d = ''
  for (const c of p.commands) {
    if (c.type === 'Z') d += 'Z'
    else
      d +=
        c.type +
        (c.type === 'C'
          ? [c.x1, c.y1, c.x2, c.y2, c.x, c.y]
          : c.type === 'Q'
            ? [c.x1, c.y1, c.x, c.y]
            : [c.x, c.y]
        )
          .map(fmt)
          .join(' ')
  }
  return d
}

const S = 128
// Render as ONE string so the font's own "/p" kerning and baseline hold.
const probe = font.getPath('/p', 0, 0, 100)
const bb = probe.getBoundingBox()
const size = (100 * S * FILL_RATIO) / (bb.y2 - bb.y1)
const p = font.getPath('/p', 0, 0, size)
const b = p.getBoundingBox()
const tx = S / 2 - (b.x1 + b.x2) / 2
const ty = S / 2 - (b.y1 + b.y2) / 2
const d = pathToD(p)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" fill="#050505" rx="28"/><g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)})"><path d="${d}" fill="#4DB6AC"/></g></svg>`

writeFileSync(path.join(pkgRoot, 'icon-paths.svg'), svg)
await sharp(Buffer.from(svg)).png().toFile(path.join(pkgRoot, 'icon.png'))
console.log(
  `icon.png + icon-paths.svg — /p fills ${(FILL_RATIO * 100).toFixed(0)}% of height, size ${size.toFixed(1)}px`,
)
