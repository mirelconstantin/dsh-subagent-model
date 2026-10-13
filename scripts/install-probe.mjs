// Reproduces `dsh plugin add` for a clean user, so "works on install" is proven
// rather than asserted.
//
// The thing this has to catch: a plugin can be perfectly correct and still do
// NOTHING on a clean install, because the Host only composes a package that
// (a) carries `dsh.bundle.patch` and (b) is listed in `dsh.profile.bundles`.
// The shipped installer does both itself
// (dsh-plugin-manager/lib/index.js:247-265: it loads the bundle's patch
// overlays AND pushes the name onto `profile.bundles`), so the question is not
// whether that works — it is whether THIS package satisfies the preconditions,
// and whether it needs anything a user would not have.
//
// Every assertion below is about the PACKAGE, so it holds on any machine with
// no profile, no harness and no network.
import { readFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const PKG = join(here, '..')

let failures = 0
const assert = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}${label.startsWith('  ') ? ' ' : '  '}${label}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures += 1
}

const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'))

// ---- 1. the two preconditions the installer checks -------------------------
assert('dsh.bundle.patch is declared', typeof pkg.dsh?.bundle?.patch === 'string',
  JSON.stringify(pkg.dsh))
assert('the patch file it names exists', existsSync(join(PKG, pkg.dsh.bundle.patch)))

const patch = readFileSync(join(PKG, pkg.dsh.bundle.patch), 'utf8')
const rows = patch.match(/^\s*-\s*id:/gm) ?? []
// One row: a second `insert` for the same package would re-register it and
// throw in the Loader (reconcilePackage throws on >1 live source).
assert('the patch inserts exactly one Loader row', rows.length === 1, `${rows.length} rows`)

// ---- 2. the browser half is discoverable ------------------------------------
assert('exports "./client" (the loader requires it or throws)',
  typeof pkg.exports?.['./client'] === 'string')
assert('dsh.client.platform is "web" (anything else is skipped silently)',
  pkg.dsh?.client?.platform === 'web', String(pkg.dsh?.client?.platform))

// ---- 3. THE FILE A CLEAN USER ACTUALLY GETS --------------------------------
// `files` decides the tarball. Anything missing here is a user who installs and
// sees nothing — with no error, because the failure is a 404 on a chunk.
// `npm pack --json` prints a JSON array; PowerShell/cmd wrappers can prepend
// banner lines, so the first `[` opens the document rather than the whole stream.
const packOut = execFileSync('npm', ['pack', '--json', '--dry-run'], { cwd: PKG, encoding: 'utf8', shell: true })
const packed = JSON.parse(packOut.slice(packOut.indexOf('[')))[0]

// ---- 4. install as a fresh profile and compose it for real ------------------
// This is the end-to-end the user asked for: install the PACKED tarball into an
// empty profile directory, then check the installer would actually compose it.
//
// The tarball is the only thing worth asserting on — `files` in package.json is
// what selects it, and a file missing there is a user who installs and sees
// nothing, with no error, because the failure is a 404 on a chunk.
const dir = mkdtempSync(join(tmpdir(), 'dsh-install-'))
const profile = join(dir, 'profile')
mkdirSync(profile, { recursive: true })
const tarball = join(dir, packed.filename)
execFileSync('npm', ['pack', '--pack-destination', dir], { cwd: PKG, encoding: 'utf8', shell: true })

// Unpack the tarball the way a profile's node_modules would hold it, so the
// manifest resolution the installer performs is exercised against real bytes.
const unpacked = join(profile, 'node_modules', pkg.name)
mkdirSync(unpacked, { recursive: true })
execFileSync('tar', ['-xzf', tarball, '-C', unpacked, '--strip-components', '1'], { encoding: 'utf8', shell: true })

for (const required of ['package.json', 'cordis.patch.yml', 'README.md', 'LICENSE',
  'AGENTS.md', 'RELEASING.md',
  'src/index.js', 'src/client.js', 'src/client.model.js', 'src/model.js',
  'locale/en.json', 'locale/ro.json', 'icon.svg']) {
  assert(`the tarball ships ${required}`, existsSync(join(unpacked, required)))
}

// ---- 5. the browser half runs from the INSTALLED bytes ---------------------
// Not the working tree: the shipped tarball. A source-map comment, a stray
// non-ASCII byte or a stray `import` that only passes locally fails here.
const source = readFileSync(join(unpacked, 'src/client.js'), 'utf8')
const chunkSource = readFileSync(join(unpacked, 'src/client.model.js'), 'utf8')
for (const [name, text] of [['client.js', source], ['client.model.js', chunkSource]]) {
  // Parse OUTSIDE the try, or the passing `assert` would itself be caught and
  // reported as a parse failure with an empty message.
  let parsed = true
  let parseError = ''
  try {
    // eslint-disable-next-line no-new-func
    new Function('window', text)
  } catch (e) {
    parsed = false
    parseError = e.message
  }
  assert(`the shipped ${name} parses as a classic script`, parsed, parseError)
  assert(`the shipped ${name} has no import/export`, !/^\s*(import|export)\s/m.test(text))
}
// The chunk id is the defect that blanked every seat; it must hold in the
// tarball too, not only in the working tree.
const chunkId = chunkSource.match(/^\s*id:\s*'([^']+)'/m)
assert('the shipped chunk registers under the bare package name',
  chunkId?.[1] === pkg.name, `got ${JSON.stringify(chunkId?.[1])}`)
// And the peer range must accept the runtime the plugin is verified against.
assert('the peer range accepts 0.2.0-rc.2', pkg.peerDependencies?.['@deepseek-ai/dsh-app-boot']?.includes('0.2.0-rc.2'),
  JSON.stringify(pkg.peerDependencies))

console.log('')
console.log(`packed ${packed.filename} — ${packed.entryCount} files, ${Math.round(packed.unpackedSize / 1024)} KB unpacked`)
console.log(failures === 0 ? 'INSTALL PASS' : `INSTALL FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)