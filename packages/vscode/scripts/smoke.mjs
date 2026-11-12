// Smoke: extract the freshly packaged VSIX and run the bundled engine
// against the repo's demo project — proves the staged closure is complete
// end-to-end (engine dist + jiti alias + hcl2json WASM + fs-extra chain),
// exactly the way the installed extension will run it.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
// Derive the artifact name from the manifest — a hardcoded version string
// here broke the first version bump (2.2.0) after the script was written.
const pkgVersion = JSON.parse(
  readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'),
).version
const vsix = path.join(pkgRoot, `pluvian-${pkgVersion}.vsix`)
const tmp = path.join(pkgRoot, '.smoke-tmp')

const die = (msg) => {
  console.error(`smoke.mjs: ${msg}`)
  process.exit(1)
}

rmSync(tmp, { recursive: true, force: true })
const unzip = spawnSync('unzip', ['-q', vsix, '-d', tmp])
if (unzip.status !== 0) die('unzip failed — was `npm run package` run first?')

const require = createRequire(
  path.join(tmp, 'extension', 'dist', 'extension.js'),
)
const { check } = require('@erkos/pluvian')
const version = require('@erkos/pluvian/package.json').version

const demo = path.join(pkgRoot, '..', '..', 'demo')
const r = await check(demo, version)
rmSync(tmp, { recursive: true, force: true })

if (!r.ok) die(`engine returned an error: ${JSON.stringify(r.error)}`)
const v = r.value.violations
if (v.length !== 1 || v[0]?.resource !== 'aws_efs_mount_target.public_mt') {
  die(`unexpected demo verdict: ${JSON.stringify(v.map((x) => x.resource))}`)
}
console.log(
  `SMOKE OK — bundled engine ${version} → ${v.length} violation(s), ` +
    `${r.value.passed} passed: ${v[0]?.resource}`,
)
