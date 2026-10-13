/**
 * dsh-subagents-model — composition checks, no DSH runtime required.
 *
 * Run: `node scripts/check-plugin.mjs`
 *
 * Asserts the manifest, the bundle patch, and the browser half's external
 * contract: that `src/client.js` is valid plain script (a classic script
 * cannot `import` or `export`), that it declares NO services, and that it
 * registers a fresh id in each of its two seats so no shipped occupant is
 * displaced. Each check names the shipped behaviour it protects.
 *
 * Every assertion here runs against `code()`, which blanks comments AND string
 * literals while preserving offsets and line breaks. A plain `.includes()` over
 * raw source is satisfied by a comment that quotes the thing it claims to check
 * — which is how a check stops guarding anything without going red.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const read = (relative) => readFile(path.join(root, relative), 'utf8')

const checks = []
const check = (name, fn) => checks.push([name, fn])

/** Dictionaries shipped in `locale/`. `ro` is registered at runtime, not shipped in the catalog. */
const SHIPPED_LOCALES = ['en', 'ro']

/**
 * Keys whose Romanian value is deliberately identical to the English one.
 * Adding a key here is a claim that it needs no translation — the reason is
 * the key's own comment in the check below, so it cannot drift silently.
 */
const UNCHANGED_BY_DESIGN = new Set(['chip.prefix', 'chip.modeOneShot', 'tip.depth', 'row.label', 'row.cache'])

/**
 * Flatten a nested dictionary into dotted keys.
 * @param {Record<string, unknown>} node the parsed dictionary
 * @returns {Map<string, string>} dotted key to leaf string
 */
function flattenDictionary(node, prefix = '') {
  const out = new Map()
  for (const [key, value] of Object.entries(node)) {
    const dotted = `${prefix}${key}`
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of flattenDictionary(value, `${dotted}.`)) out.set(k, v)
    } else {
      out.set(dotted, String(value))
    }
  }
  return out
}

/**
 * The `{name}` placeholders in one string, sorted so order is not a failure.
 * @param {string} text a dictionary value
 * @returns {string[]} placeholder names
 */
const placeholdersIn = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

/**
 * Blank comments, preserving every character offset and newline so a match
 * still reports the caller's line numbers.
 *
 * A scanner, not a regex: `//` appears inside strings often enough that regex
 * stripping deletes real code, and the whole point of this helper is that a
 * check can still go red.
 *
 * @param {string} source Raw file text.
 * @returns {string} the same text with comment bodies blanked.
 */
function stripComments(source) {
  const out = source.split('')
  const blank = (from, to) => {
    for (let k = from; k < to && k < source.length; k += 1) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  while (i < source.length) {
    const c = source[i]
    const n = source[i + 1]
    if (c === '/' && n === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      blank(i, stop)
      i = stop
    } else if (c === '/' && n === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      blank(i, stop)
      i = stop
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue }
        if (source[j] === c || source[j] === '\n') break
        j += 1
      }
      i = j + 1
    } else {
      i += 1
    }
  }
  return out.join('')
}

/**
 * The raw and comment-free views of one file.
 *
 * `code` keeps string literals, so a pattern shaped like a CALL —
 * `t('chip.differs')`, `require('react-dom')`, `querySelector('style[…')`,
 * `locale.addLanguage({ id: 'ro'` — matches only at a real call site. That is
 * the anchor that matters here: the inline en/ro FALLBACK dictionaries repeat
 * every key as `'chip.differs': '…'`, so a bare key search was satisfied by
 * data, not by wiring.
 *
 * @param {string} relative repo-relative path
 * @returns {Promise<{raw: string, code: string}>} the two views
 */
async function views(relative) {
  const raw = await read(relative)
  return { raw, code: stripComments(raw) }
}

/**
 * Assert a declaration exists as real code, anchored at line start so a prose
 * mention can never satisfy it.
 * @param {string} source stripped source
 * @param {string} name the declared identifier
 * @param {string} label file the declaration must live in
 */
function assertDeclaresFunction(source, name, label) {
  const re = new RegExp(`^\\s*(?:async\\s+)?function\\s+${name}\\s*\\(`, 'm')
  assert.ok(re.test(source), `${label} must declare function ${name}(...)`)
}

/**
 * The names `src/model.js` actually exports, read from its export block rather
 * than a hand-copied list that goes stale the moment an export is added.
 * @param {string} source stripped `src/model.js`
 * @returns {string[]} exported identifiers
 */
function exportedNames(source) {
  const block = source.match(/^export\s*\{([\s\S]*?)\}/m)
  assert.ok(block, 'src/model.js must have an `export { ... }` block')
  return block[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(/\s+as\s+/)[0].trim())
}

/* ------------------------------------------------------------------ *
 * Manifest
 * ------------------------------------------------------------------ */

check('package.json declares the bundle patch and the client export', async () => {
  const pkg = JSON.parse(await read('package.json'))
  assert.equal(pkg.name, 'dsh-subagents-model')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.exports['.'], './src/index.js')
  // `@deepseek-ai/dsh-client-modules` resolves the browser half through
  // `exports["./client"]` (`lib/index.js:701-731`).
  assert.equal(pkg.exports['./client'], './src/client.js')
  assert.equal(pkg.exports['./cordis.patch.yml'], './cordis.patch.yml')
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
  // A client package must declare the platform its half runs on.
  assert.equal(pkg.dsh?.client?.platform, 'web')
})

check('package.json carries no runtime dependency', async () => {
  const pkg = JSON.parse(await read('package.json'))
  assert.equal(pkg.dependencies, undefined)
  // This plugin reads projection values the client store already holds, so it
  // needs nothing installed to run. `peerDependencies` is the exception — see
  // the compatibility-gate check below.
})

check('a release is versioned, and the release rules travel with it', async () => {
  const pkg = JSON.parse(await read('package.json'))
  // The version must be a plain semver triple with no prerelease tag: this plugin
  // is installed by name, so a `-rc` would be a different install target.
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, `version must be MAJOR.MINOR.PATCH, got ${pkg.version}`)
  const [major, minor, patch] = pkg.version.split('.').map(Number)
  assert.ok(major >= 1, 'a published plugin starts at 1.0.0')
  assert.ok(minor >= 0 && patch >= 0)

  // The rule has to be readable by whoever does the next release, and it has to
  // be in the tarball, not only in the repo — an unpacked install is where the
  // next contributor will actually be.
  for (const doc of ['RELEASING.md', 'AGENTS.md']) {
    assert.ok(existsSync(path.join(root, doc)), `${doc} must exist`)
    const text = await read(doc)
    assert.ok(/npm version (patch|minor|major)/.test(text),
      `${doc} must state the bump command`)
    assert.ok(/RELEASING\.md/.test(text) || doc === 'RELEASING.md',
      `${doc} must point at the other`)
  }
  // AGENTS.md is the file an AI or a new contributor reads first, so the release
  // rule cannot be buried in RELEASING.md alone.
  const agents = await read('AGENTS.md')
  assert.match(agents, /Every release bumps|version/i,
    'AGENTS.md must state the version-bump rule')

  // And both must be in `files`, or npm silently drops them from the tarball.
  assert.ok(pkg.files.includes('RELEASING.md'), 'RELEASING.md must be in files')
  assert.ok(pkg.files.includes('AGENTS.md'), 'AGENTS.md must be in files')

  // The README must name the version that ships, or a pinned install silently
  // resolves to something older than this tarball.
  const readme = await read('README.md')
  assert.ok(readme.includes(pkg.version),
    `README.md must mention the released version ${pkg.version}`)
})

check('the release publishes over OIDC, with no stored token', async () => {
  const yml = await read('.github/workflows/release.yml')
  // npm TRUSTED PUBLISHING, not a long-lived token. `id-token: write` is what
  // lets GitHub mint the short-lived token npm exchanges for a publish token;
  // the npm CLI detects the OIDC environment on its own, so the publish step must
  // carry NO credentials at all.
  assert.match(yml, /id-token:\s*write/, 'OIDC needs the id-token: write permission')
  assert.match(yml, /npm publish/, 'the workflow must publish')

  // Comment-free, so the prose that NAMES the secret cannot satisfy the negative
  // assertions below.
  const { code } = await views('.github/workflows/release.yml')
  assert.ok(!/secrets\./.test(code),
    'the release must not read any repository secret — that is the whole point of OIDC')
  assert.ok(!/NPM_TOKEN|NPM_READ_TOKEN|NODE_AUTH_TOKEN/.test(code),
    'no npm token may appear in the workflow')

  // Without the trusted publisher configured on npmjs.com the publish step fails
  // E401/E403, so the configuration has to be written down where the next person
  // will read it at the moment it is needed.
  assert.match(code, /dsh-subagents-model/, 'the workflow must name the package')
  assert.ok(/release\.yml/.test(yml), 'the workflow must name itself, as npm requires a filename')
  // Node 22.14.0+ and npm 11.5.1+ are hard requirements for trusted publishing.
  const node = yml.match(/node-version:\s*(\S+)/)
  assert.ok(node, 'the workflow must pin a node version')
  assert.match(node[1], /^'?2[2-9]/, `trusted publishing needs Node >= 22.14.0, got ${node[1]}`)
})

check('package.json pins the dsh runtime it was verified against', async () => {
  const pkg = JSON.parse(await read('package.json'))
  // The ONLY compatibility field the runtime evaluates is a `@deepseek-ai/dsh*`
  // entry in `peerDependencies`: `evaluatePluginCompatibility` returns undefined
  // immediately when the field is absent (dsh-app-boot/lib/index.js:289), so a
  // manifest without one is never version-checked at all. `dsh.compatibility`
  // is invented — `dsh` has only `bundle`, `client` and `profile` namespaces.
  assert.equal(pkg.dsh?.compatibility, undefined, 'no dsh.compatibility namespace is read by the runtime')
  const peers = pkg.peerDependencies
  assert.ok(peers && typeof peers === 'object', 'peerDependencies must be an object')
  const dshPeers = Object.entries(peers).filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
  assert.ok(dshPeers.length > 0, 'a dsh peer is required, or no version check ever runs')
  for (const [name, range] of dshPeers) {
    // :293 rejects a non-string range outright; :300 treats an empty range as
    // incompatible and everything else through semver.
    assert.equal(typeof range, 'string', `${name} range must be a string`)
    assert.ok(range.trim() !== '', `${name} range must not be empty`)
    // `workspace:^` / `workspace:~` / `workspace:*` are rewritten to the running
    // runtime version (:295-299) — a pin that can never go red.
    assert.ok(!['workspace:^', 'workspace:~', 'workspace:*'].includes(range), `${name} must be a real range, not a workspace: wildcard`)
    assert.ok(!range.includes('||'), `${name} must name one verified release line, not a union`)
  }
})

check('the declared dsh range accepts the runtime this plugin was tested on', async () => {
  const pkg = JSON.parse(await read('package.json'))
  const range = pkg.peerDependencies['@deepseek-ai/dsh-app-boot']
  assert.ok(range, 'the plugin must name the runtime package it was verified against')
  // The gate's whole test is `semver.satisfies(runtimeVersion, range,
  // { includePrerelease: true })` (:300), with `includePrerelease` making every
  // component numeric. So for the comparator forms this check accepts, plain
  // tuple comparison of [major, minor, patch, prerelease] is faithful.
  const TESTED = '0.2.0-rc.2'
  const tuple = (version) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version)
    assert.ok(m, `${range}: ${version} is not MAJOR.MINOR.PATCH[-prerelease]`)
    return [Number(m[1]), Number(m[2]), Number(m[3]), ...(m[4] === undefined ? [] : m[4].split('.'))]
  }
  const compare = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const x = a[i] ?? 0
      const y = b[i] ?? 0
      if (x === y) continue
      return x > y ? 1 : -1
    }
    return 0
  }
  const actual = tuple(TESTED)
  for (const comparator of range.split(/\s+/).filter(Boolean)) {
    const [, operator = '=', version] = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(comparator) ?? []
    assert.ok(!['^', '~'].includes(operator), `${range}: use explicit comparators so the pin stays readable and testable`)
    const order = compare(actual, tuple(version))
    assert.ok(
      { '=': order === 0, '>=': order >= 0, '>': order > 0, '<=': order <= 0, '<': order < 0 }[operator],
      `${range}: \`${comparator}\` rejects the tested runtime ${TESTED}, so dsh would skip this bundle at boot`,
    )
  }
})

/* ------------------------------------------------------------------ *
 * Bundle patch
 * ------------------------------------------------------------------ */

check('cordis.patch.yml inserts exactly one Loader row', async () => {
  const yaml = await read('cordis.patch.yml')
  const rows = [...yaml.matchAll(/^\s*-\s+id:\s*(\S+)\s*$/gm)].map((m) => m[1])
  assert.deepEqual(rows, ['subagent-model'])
})

check('the Loader row points at the Host anchor', async () => {
  const yaml = await read('cordis.patch.yml')
  assert.match(yaml, /name:\s*'\.\/src\/index\.js'/)
})

/* ------------------------------------------------------------------ *
 * The browser half is a classic script
 * ------------------------------------------------------------------ */

check('src/client.js is plain script: no import and no export statement', async () => {
  const { code } = await views('src/client.js')
  // Comment-free, so the module doc comment's own "no `import`, no `export`"
  // cannot satisfy these.
  assert.ok(!/^\s*import\s/m.test(code), 'client.js must not use import')
  assert.ok(!/^\s*export\s/m.test(code), 'client.js must not use export')
  assert.ok(!/^\s*export\s*\{/m.test(code), 'client.js must not use an export block')
  // JSX does not survive an unevaluated classic script either.
  assert.ok(!/>\s*<\/?[A-Za-z]/.test(code), 'client.js must not contain JSX')
})

check('src/client.js registers through window.__ModuleLoader__.load', async () => {
  const { code } = await views('src/client.js')
  assert.match(code, /window\.__ModuleLoader__\.load\(/)
})

check('src/client.js declares exactly the two seat services', async () => {
  const { code } = await views('src/client.js')
  // `inject` names `slots` and `locale` — the same pair the sibling
  // `dsh-opencode-router` half declares (src/client/index.ts:64). Declaring them
  // makes cordis hold the row until the renderer and locale runtime have
  // ACTIVATED, which turns the service race into a guarantee.
  //
  // An empty `inject` with a `setTimeout` poll was the shape before, and it was
  // NOT enough: `ctx.get` is gated on the provider fiber reaching state 2
  // (`@deepseek-ai/cordis/lib/index.js:770`), so the seats registered only if the
  // poll happened to outlive the renderer's activation. Declaring the dependency
  // removes the race rather than winning it.
  //
  // `sessions` is deliberately absent: the store hooks are standard PROPS handed
  // to a slot component by the renderer, not services.
  assert.match(code, /inject:\s*\[\s*'slots',\s*'locale',?\s*\]/)
  // Anything beyond the pair would park the row on a provider it never uses.
  for (const name of ['sessions', 'timer', 'resources', 'uiWorkspace']) {
    assert.ok(
      !new RegExp(`inject:\\s*\\[[^\\]]*'${name}'`).test(code),
      `${name} must not be a declared service dependency`,
    )
  }
  // The non-strict read is what makes the remaining poll a usable fallback: the
  // strict read returns undefined for a provider that exists but is still booting.
  assert.match(code, /ctx\.get\(name, false\)/)
})

/* ------------------------------------------------------------------ *
 * The seats
 * ------------------------------------------------------------------ */

check('every seat registers its own id through a declared constant', async () => {
  const { code } = await views('src/client.js')
  // All three seats ADD cells, so each id must be this plugin's own and must be
  // named by a constant, which is what makes a seat renameable in one edit.
  // Anchored on the registration object literals, which are indented deeper than
  // any function parameter list — a bare `\bid:` also matches `rootId,` in a
  // signature.
  const shorthand = [...code.matchAll(/^\s{16}id:\s*([A-Za-z_][A-Za-z0-9_]*),$/gm)].map((m) => m[1])
  assert.ok(shorthand.length === 3, `all three seats must register exactly one id each (found ${shorthand.length})`)
  for (const name of shorthand) {
    assert.match(code, new RegExp(`^\\s*const ${name} = '`, 'm'), `${name} must be a declared constant`)
  }
})

check('the header seat is the session actions slot', async () => {
  const { code } = await views('src/client.js')
  // The slot name is a string literal, so the constant's DECLARATION is
  // asserted from the comment-free copy and its VALUE from the raw text: the
  // declaration is what binds the two together.
  assert.match(code, /^\s*const ACTIONS_SLOT = /m)
  assert.match((await read('src/client.js')), /ACTIONS_SLOT\s*=\s*'conversation\.session\.header\.actions'/)
})

check('the hover seat is the sidebar session-row hover slot', async () => {
  const { code } = await views('src/client.js')
  assert.match(code, /^\s*const HOVER_SLOT = /m)
  assert.match((await read('src/client.js')), /HOVER_SLOT\s*=\s*'sidebar\.session\.row\.hover'/)
})

check('every registration is deferred through slots.inject', async () => {
  const { code } = await views('src/client.js')
  // `register` throws when the slot is not yet declared
  // (`dsh-client-ui-slots/lib/index.js:163-165`), so every seat is wrapped.
  const injects = code.match(/slots\.inject\(/g) ?? []
  assert.ok(injects.length >= 3, 'all three seats must be deferred through slots.inject')
})

check('the stylesheet injects idempotently', async () => {
  const { code } = await views('src/client.js')
  // The early return on an existing marker is what makes the injection
  // idempotent; the attribute write is what makes it findable. Asserted
  // together, because neither alone proves the other is still wired.
  const start = code.indexOf('function injectStyles(')
  const fn = code.slice(start, start + 900)
  assert.match(fn, /querySelector\('style\[data-plugin-css="/)
  assert.match(fn, /if \([^)]*querySelector\([^)]*\) !== null\) return/)
  assert.match(fn, /\.setAttribute\('data-plugin-css'/)
})

/* ------------------------------------------------------------------ *
 * Shared logic is mirrored, not duplicated in behaviour
 * ------------------------------------------------------------------ */

check('the model-selection keys are spelled once, in the chunk', async () => {
  const { code: chunk } = await views('src/client.model.js')
  const { code: model } = await views('src/model.js')
  const { code: client } = await views('src/client.js')
  // The browser half used to inline these two so the two files could not drift;
  // it now reads them off the chunk. So the single declaration must live in the
  // chunk, `src/model.js` must only re-export it, and the browser half must not
  // redeclare either one. Anchored at line start, so a comment cannot satisfy it.
  for (const [name, value] of [['PROJECTION_KEY', 'modelSelection'], ['IDENTITY_KEY', 'subagent']]) {
    assert.match(chunk, new RegExp(`^\\s*const ${name} = '${value}'$`, 'm'), `src/client.model.js must declare ${name}`)
    assert.ok(!new RegExp(`^\\s*const ${name} = '${value}'$`, 'm').test(client), `src/client.js must not redeclare ${name}`)
    assert.ok(!new RegExp(`^const ${name} = '${value}'$`, 'm').test(model), `src/model.js must re-export ${name}, not redeclare it`)
  }
})

check('the shared logic lives in the chunk, which is loaded through require.async', async () => {
  const { code: client } = await views('src/client.js')
  const { code: chunk } = await views('src/client.model.js')
  const { code: model } = await views('src/model.js')
  const exported = exportedNames(model)
  // The list is derived from the module's own export block, so an export added to
  // src/model.js is covered here the moment it lands.
  assert.ok(exported.length >= 20, `src/model.js exports at least the known surface (found ${exported.length})`)

  // REPLACES the old "src/client.js inlines every exported model function".
  // That check asserted the bug this change removes: the browser half used to
  // carry its own copies because a comment claimed the Host serves one file per
  // package. It does not — `require.async('./x.js')` routes to `importChunk`
  // (dsh-client-modules/lib/client.js:707-713) and the Host serves the sibling
  // chunk (dsh-client-modules/lib/index.js:915-932, CLIENT_CHUNK at :169) —
  // which three shipped packages already rely on. The invariant is now the
  // opposite one: the logic is declared ONCE, in the chunk, and both the page
  // and `node --test` reach THAT copy.
  // The chunk's own bindings are checked below; here the browser half must simply
  // not declare a function of its own for any exported name.
  for (const name of exported) {
    assert.match(chunk, new RegExp(`^\\s*const ${name}\\s*=|^\\s*function ${name}\\s*\\(|^\\s*${name}\\s*,`, 'm'), `src/client.model.js must declare ${name}`)
    assert.ok(!new RegExp(`^\\s*(?:async\\s+)?function\\s+${name}\\s*\\(`, 'm').test(client), `${name} must not be inlined into src/client.js`)
  }

  // The browser half really loads that chunk, and reads the functions off the
  // resolved exports rather than through a name of its own.
  assert.match(client, /require\.async\(['"]\.\/client\.model\.js['"]\)/, 'src/client.js must load the chunk through require.async')
  assert.match(client, /^\s*let modelChunk = null$/m, 'src/client.js must hold the resolved chunk in one place')
  for (const name of ['resolveRoute', 'summarizeSubagentModels', 'isLoaded', 'formatCount', 'formatModelGroup']) {
    assert.match(client, new RegExp(`\\bm\\.${name}\\b`), `src/client.js must read ${name} off the resolved chunk`)
  }

  // The chunk is served raw, so it must self-register under the name
  // `importChunk` looks for, and it must stay a classic script. The `id` is the
  // bare PACKAGE name — the runtime appends `/<chunk>` itself
  // (dsh-client-modules/lib/client.js:476-478).
  assert.match(chunk, /window\.__ModuleLoader__\.load\(/)
  assert.match(chunk, /id:\s*'dsh-subagents-model'/)
  assert.match(chunk, /chunk:\s*'client\.model\.js'/)
  assert.match(chunk, /return module\.exports/)
  assert.ok(!/^\s*import\s/m.test(chunk), 'client.model.js must not use import')
  assert.ok(!/^\s*export\s/m.test(chunk), 'client.model.js must not use export')
  assert.ok(!/>\s*<\/?[A-Za-z]/.test(chunk), 'client.model.js must not contain JSX')

  // `src/model.js` is the ESM face of that same chunk, so the Node suite and the
  // page cannot be exercising two different implementations.
  assert.match(model, /^\s*import \{ readFileSync \} from 'node:fs'$/m, 'src/model.js must reach the chunk over node:fs')
  assert.match(model, /'\.\/client\.model\.js'/, 'src/model.js must name the chunk it re-exports')
})

check('src/model.js exports exactly what the chunk exports', async () => {
  const { code: chunk } = await views('src/client.model.js')
  const { code: model } = await views('src/model.js')
  // Guard the re-export against rotting in either direction: a name added to the
  // chunk and forgotten in model.js fails the Node suite at import time, and one
  // exported from model.js with no binding behind it fails here.
  const assignment = /module\.exports\s*=\s*\{([\s\S]*?)\n\s*\}/.exec(chunk)
  assert.ok(assignment, 'src/client.model.js must assign a module.exports object')
  const names = assignment[1].split(',').map((entry) => entry.trim()).filter(Boolean)
  assert.ok(names.length >= 20, `the chunk exports the full surface (found ${names.length})`)
  assert.deepEqual([...names].sort(), [...exportedNames(model)].sort(), 'src/model.js must export exactly what the chunk exports')
  for (const name of names) {
    assert.match(model, new RegExp(`^\\s*${name},$`, 'm'), `src/model.js must bind ${name} from the chunk`)
  }
})

check('src/client.js reads the list-row projection values as the subagent fallback', async () => {
  const { code } = await views('src/client.js')
  // `projectionsBySession` only holds sessions whose projection store is
  // resident, so a never-opened subagent is invisible in it. The list rows
  // carry the same values under `projectionValues`
  // (dsh-api-session-controller/lib/client.js:2942,3521,3549) — reading only
  // the first source is what made subagents show no model at all. Both anchors
  // are real code; the raw text appeared in 4 comments as well.
  assert.ok(code.includes('projectionValues'), 'client.js must read the list-row projection values')
  assert.match(code, /byId\?\.\[sessionId\]\?\.projectionValues/)
})

check('src/client.js renders the reasoning effort beside the model', async () => {
  const { code } = await views('src/client.js')
  // `dsh-smr-chipEffort` and `chip.titleWithEffort` appeared 4 times each as raw
  // text: twice in the en/ro FALLBACK dictionaries, and once each in the
  // FALLBACK `t()` calls. Deleting the real wiring left the check green. The
  // `className:` and the `t(` CALL are what prove it.
  assert.match(code, /route\.effort !== ''\s*\?/)
  assert.match(code, /className:\s*'dsh-smr-chipEffort'/)
  assert.match(code, /t\(\s*'chip\.titleWithEffort'/)
})

check('src/client.js reports one-shot descent rather than guessing a model', async () => {
  const { code } = await views('src/client.js')
  // A one-shot descriptor omits the agent route
  // (dsh-subagent/lib/types/descriptor.js:37,118-126), so inherited is the
  // honest answer for a child whose explicit model is not durable.
  // `row.inherited` matched 6 raw hits and NONE was a call — 4 were the
  // FALLBACK dictionaries' own `row` keys. The `t(` CALL is the proof.
  assert.match(code, /source === 'inherited'/)
  assert.match(code, /t\('row\.inherited'\)/)
})

check('the tooltip also cuts the same summary by depth', async () => {
  const { code } = await views('src/client.js')
  // The integration with the sibling dsh-subagent-tree: both facts come from
  // one walk, so they read in one place. It is printed only when a generation
  // actually splits the flat summary. `tip.byDepth` matched 3 raw hits and 2
  // were FALLBACK dictionary keys.
  assert.match(code, /summary\.byDepth/)
  assert.match(code, /t\('tip\.byDepth'\)/)
  assert.match(code, /\bconst splits = /)
})

check('the hover row shows what the session actually did', async () => {
  const { code } = await views('src/client.js')
  // Every fact is read from a projection the client already holds, and each row
  // appears only when its value is present, so a zero never reads as "did
  // nothing". `row.turns` matched 3 raw hits, all dictionary keys.
  assert.match(code, /values\.sessionStats/)
  assert.match(code, /values\.subagentTiming/)
  assert.match(code, /t\('row\.turns',/)
  assert.match(code, /t\('row\.task'\)/)
  assert.match(code, /'one-shot' \? 'row\.modeOneShot' : 'row\.modeContinuable'/)
  assert.match(code, /decodeTokens/)
})

check('the header chip renders on a child session too', async () => {
  const { code } = await views('src/client.js')
  // Removing the `origin === 'subagent'` guard is what makes an OPENED subagent
  // state its model. A reintroduced guard would hide it again. Slicing the
  // comment-free copy means a guard quoted in a comment beside the component
  // cannot produce a false pass.
  const start = code.search(/^\s*function ModelChip\(/m)
  const end = code.search(/^\s*function ModelHoverRow\(/m)
  assert.ok(start !== -1 && end > start, 'the header chip component must exist')
  const chip = code.slice(start, end)
  assert.ok(!/origin === 'subagent'/.test(chip), 'the header chip must not skip child sessions')
  assert.ok(/\bresolveRoute\(/.test(chip), 'the header chip must resolve the effective route')
})

check('the inherited route is recovered by walking the parent chain', async () => {
  const { code: client } = await views('src/client.js')
  const { code: chunk } = await views('src/client.model.js')
  // With model selection off (the `subagent` default) every child inherits its
  // parent's route, and that route is nowhere in the child's own log — so the
  // walk up `parentId` is what lets a subagent's header name a real model. The
  // walk lives in the chunk now; the browser half must still CALL it.
  for (const source of [chunk]) {
    assert.match(source, /parentId/, 'the chunk must read parentId')
    assert.match(source, /visited\.has/, 'the chunk must guard against a cyclic chain')
    assert.match(source, /MAX_PARENT_HOPS/, 'the chunk must bound the walk')
  }
  assert.match(client, /\bm\.resolveRoute\(/, 'src/client.js must resolve routes through the chunk')
})

check('the tooltip groups subagents by the model they run on', async () => {
  const { code } = await views('src/client.js')
  // `formatModelGroup(group)` matched 3 raw hits and all 3 were code — but one
  // is the function DECLARATION, so the pattern was satisfied by the definition
  // even with every call site deleted. Anchored on the call instead: the
  // template literal that puts a formatted group into the tooltip body. Both
  // calls now go through the chunk, so the `m.` prefix is part of the anchor.
  assert.match(code, /m\.summarizeSubagentModels\(projections, byId, sessionId\)/)
  // Both call shapes: the flat summary body and the by-depth breakdown. Missing
  // either leaves the tooltip silently showing a different list than the walk
  // computed.
  assert.match(code, /\$\{m\.formatModelGroup\(group\)\}/)
  assert.match(code, /\.map\(m\.formatModelGroup\)/)
  // The summary must be a LAZY thunk: a Tooltip only calls its label once the
  // bubble is visible, so an ordinary request pays nothing for the walk.
  assert.match(code, /const tooltipLabel = \(\) => \{/)
  assert.match(code, /label: tooltipLabel/)
})

check('the queued route switch is reported with the model it replaces', async () => {
  const { code } = await views('src/client.js')
  const { code: chunk } = await views('src/client.model.js')
  // No projection ships `request/header`, so the per-turn history is NOT
  // reachable from a client plugin. What IS reachable is the disagreement
  // between `next` and `lastUsed`, which names the route being replaced. The
  // field is produced in the chunk now and read by the hover row.
  assert.match(chunk, /switchedFrom: pending \? lastUsed\.model : ''/)
  assert.match(code, /route\.switchedFrom/)
  assert.match(code, /t\('row\.switchFrom',/)
})

check('no seat claims a shipped cell', async () => {
  const raw = await read('src/client.js')
  const { code } = await views('src/client.js')
  // The regression that matters most: an earlier version registered
  // `id: 'subagent-catalog'` at `priority: -9998` to replace the shipped
  // dropdown. Replacing that cell means reimplementing its whole navigation
  // contract (dsh-client-ui-subagent/lib/client.js:949-974), and every mistake
  // in that reimplementation removes the stock subagent list from the UI. The
  // plugin now only ADDS cells, so the shipped dropdown is untouchable.
  assert.ok(
    !/id:\s*['"]subagent-catalog['"]/.test(raw),
    'this plugin must never claim the shipped subagent-catalog cell',
  )
  assert.ok(!/SHADOW_PRIORITY|SHADOWED_CELL_ID/.test(code), 'the shadowing constants must not come back')
  assert.ok(!/\bpriority:\s*-?\d/.test(code), 'no seat may register a shadowing priority')
  // And the tree that the takeover existed for must stay deleted: its CSS and
  // its helpers would otherwise be dead weight that lints as live code.
  assert.ok(!/dsh-smt-/.test(code), 'the removed tree stylesheet must not come back')
  for (const gone of ['SubagentModelTree', 'SubagentTreeRows', 'isKnownLeaf', 'visibleRowIds', 'rowDomId', 'routeMarker', 'catalogActions']) {
    assert.ok(!code.includes(gone), `${gone} was removed with the tree and must not return`)
  }
})

check('client.model.js registers under the bare package name', async () => {
  // Comment-free: the explanatory comment above the registration QUOTES the old
  // wrong value, and a raw-text match would read that as the declaration.
  const { code: chunk } = await views('src/client.model.js')
  const main = await read('src/client.js')
  // THE defect that made this plugin render nothing at all, silently.
  //
  // The runtime keys a chunk itself as `chunkId(ownerId, chunk)` = `${id}/${chunk}`
  // (dsh-client-modules/lib/client.js:476-478, and the same composition at
  // `:572`). So the `id` field must be the bare PACKAGE name — exactly what the
  // shipped sibling chunks use
  // (@deepseek-ai/dsh-client-ui-sidebar-terminal/lib/client.terminal.js:2).
  //
  // This file used to say `id: 'dsh-subagents-model/client.model.js'`, which
  // registered the chunk under `dsh-subagents-model/client.model.js/client.model.js`
  // — a key no `require.async('./client.model.js')` ever looks up. That request
  // rejected, `apply` swallowed the rejection, `modelChunk` stayed null, and
  // `withModel` returned null for EVERY seat: no header chip, no bottom-bar chip,
  // no hover row, and nothing on screen to explain it.
  const id = chunk.match(/^\s*id:\s*'([^']+)'/m)
  assert.ok(id, 'client.model.js must declare an id')
  assert.equal(id[1], 'dsh-subagents-model',
    `the chunk id must be the bare package name, got ${JSON.stringify(id[1])}`)
  assert.match(chunk, /^\s*chunk:\s*'client\.model\.js',?$/m)
  // The main bundle must declare the same package id, or the owner differs and
  // the derived key can never match.
  const mainId = main.match(/^\s*id:\s*'([^']+)'/m)
  assert.equal(mainId?.[1], 'dsh-subagents-model', 'client.js must declare the same package id')
  // And the request must be relative, which is the only form that routes to a
  // package-local chunk (`require.async` ignores anything not starting with './').
  assert.match(main, /require\.async\('\.\/client\.model\.js'\)/)
})

// The defect that made subagents vanish from the summaries the chips read.
check('the catalog is read from every session row, not only loaded stores', async () => {
  const { code } = await views('src/client.js')
  const chunk = await read('src/client.model.js')
  // `projectionsBySession` is populated LAZILY, so a session that was delegated
  // to but never opened has no entry there and carries its catalog only on the
  // list row's `projectionValues`. Reading the projection map alone therefore
  // dropped exactly the sessions the summary is about, and the chips showed
  // nothing. The shipped client reads the same fallback
  // (dsh-client-ui-subagent/lib/client.js:71, :200, :816).
  assert.match(chunk, /function catalogFor\(projectionsBySession, byId, sessionId\)/)
  assert.match(chunk, /byId\?\.\[sessionId\]\?\.projectionValues\?\.subagentCatalog/, 'catalogFor must read the list-row attachment')
  assert.match(chunk, /catalogFor\(projectionsBySession, byId, id\)/, 'the summary walk must use catalogFor')
  // The walk must not regress to the projection-only read.
  assert.ok(!/catalogOf\(projectionsBySession, id\)/.test(chunk), 'the summary walk must not read the projection map alone')
  assert.ok(code.includes('m.catalogFor') || code.includes('m.resolveRoute'), 'the browser half resolves through the chunk')
})

check('the bottom-bar chip occupies the composer dock beside the built-in controls', async () => {
  const { code } = await views('src/client.js')
  assert.match(code, /^\s*const DOCK_SLOT = /m)
  assert.match((await read('src/client.js')), /DOCK_SLOT\s*=\s*'conversation\.composer\.dock'/)
  // `todo` sits at order 0 and `queue` at 20
  // (dsh-client-ui-conversation/lib/client.js:17748-17759, :15668-15697), so the
  // chip must sort after both to avoid displacing a shipped occupant.
  const order = code.match(/^\s*const DOCK_ORDER = (\d+)$/m)
  assert.ok(order, 'src/client.js must declare a numeric DOCK_ORDER')
  assert.ok(Number(order[1]) > 20, 'the dock chip must sort after the shipped todo and queue cells')
  assert.match(code, /id: DOCK_SLOT_ID/)
  assert.match(code, /order: DOCK_ORDER/)
  // The trigger is a real button with a dialog popup, because the two controls
  // share one row with the ContextMeter and an invented shape reads as a
  // stranger (research/context-meter-anatomy.md).
  assert.match(code, /function ModelDockChip\(props\)/)
  assert.match(code, /'aria-haspopup': 'dialog'/)
  assert.match(code, /useAnchoredPosition/)
  // Both hooks fall back rather than being called conditionally, or the hook
  // count changes between renders of one mounted component.
  assert.match(code, /\(useAnchoredPosition \?\? noopAnchoredPosition\)/)
  assert.match(code, /\(useDismissOnOutsidePointer \?\? noopDismiss\)/)
})

check('the dock panel portals through react-dom, children first', async () => {
  const { code } = await views('src/client.js')
  // The panel must port to document.body: rendered inline it would be clipped by
  // the conversation shell's overflow. The bare word appears only in comments;
  // the `require` call is what proves it is actually reached for.
  assert.match(code, /require\('react-dom'\)/)
  assert.match(code, /createPortal = reactDom\.createPortal/)

  // `createPortal(children, container)` — CHILDREN FIRST. This used to call
  // `h(container, ref, props, …)` instead, which throws inside React's
  // createChild the moment the panel opens. The renderer contains a throwing
  // entry and abdicates the slot (dsh-client-ui-renderer/lib/client.js:605-625),
  // so the failure was silent: the chip vanished on click rather than opening.
  // Same shape as the shipped ContextMeter panel and the sibling proxy chip
  // (plugins/dsh-opencode-router/src/client/ProxyStatusChip.tsx:254).
  const start = code.indexOf('const panel = open')
  // The container sits ~27 lines below the call, past a 700-char window, so the
  // slice has to reach the closing paren rather than just the opening call.
  const call = code.slice(start, code.indexOf('return h(\'span\', { ref: rootRef', start))
  assert.match(call, /\? createPortal\(/, 'the panel must be built by createPortal, not by h(container, …)')
  // The container is the final argument: `…),<container>)` — here it is
  // `portalTarget(),` followed by the closing paren on its own line.
  assert.match(call, /portalTarget\(\),?\s*\n\s*\)/, 'the container must be the LAST createPortal argument')
  assert.ok(!/\? h\(\s*\n\s*portalTarget\(\)/.test(call),
    'createPortal takes children first; h(container, …) is not a portal')
})

check('src/client.js registers the Romanian language', async () => {
  const { code } = await views('src/client.js')
  // `ro` is NOT a shipped catalog language (`LOCALE_IDS = ["zh", "en"]`,
  // dsh-client-locale/lib/client.js:922) and the fallback chain walks the
  // CATALOG, not the registered dictionaries (`:1369-1386`) — so without this
  // call the whole ro dictionary is unreachable and the chip silently renders
  // English. Nothing guarded this: deleting the block kept every check green.
  assert.match(code, /locale\.addLanguage\(\{\s*id: 'ro'/)
  // The guard is the other half: an older runtime has no `addLanguage`, and an
  // unguarded call would throw inside the locale registration and take the
  // whole chip down with it. The word appears in the explanatory comment too,
  // so the `typeof` test is what must be present as code.
  assert.match(code, /if \(typeof locale\.addLanguage === 'function'\)/)
  // And the registration must be deferred, so it runs once the locale service
  // is up rather than during activation.
  assert.match(code, /ctx\.effect\(addLanguage/)
})

/* ------------------------------------------------------------------ *
 * Dictionaries
 * ------------------------------------------------------------------ */

check('every shipped dictionary exists and parses', async () => {
  for (const locale of SHIPPED_LOCALES) {
    const nested = JSON.parse(await read(`locale/${locale}.json`))
    assert.ok(nested.chip !== undefined, `${locale}.json needs a chip group`)
    assert.ok(nested.row !== undefined, `${locale}.json needs a row group`)
  }
})

check('ro is a complete, translated twin of en', async () => {
  const en = flattenDictionary(JSON.parse(await read('locale/en.json')))
  const ro = flattenDictionary(JSON.parse(await read('locale/ro.json')))

  // A missing key is not a cosmetic difference: the locale face falls through to
  // the English string, so an untranslated row appears with no warning.
  assert.deepEqual([...ro.keys()].sort(), [...en.keys()].sort(), 'locale/ro.json must define exactly the keys locale/en.json defines')

  for (const [key, english] of en) {
    const romanian = ro.get(key)

    // Placeholders are the interpolation contract. A renamed or dropped
    // `{effort}` renders `undefined` into the tooltip.
    const expected = placeholdersIn(english)
    const actual = placeholdersIn(romanian)
    assert.deepEqual(actual, expected, `${key}: ro placeholders ${JSON.stringify(actual)} do not match en ${JSON.stringify(expected)}`)

    // An identical value is the shape of a forgotten translation. These four are
    // the exceptions, each for a reason:
    //   chip.prefix      — the word rendered before the model id; "model" is the
    //                      same noun in Romanian, and a translated prefix would
    //                      read as a different label than the chip's own title.
    //   chip.modeOneShot — the shipped mode keyword "one-shot" (the same token
    //                      `dsh-subagent` uses); translating it would stop
    //                      matching what the session list prints.
    //   tip.depth        — "gen {depth}", an abbreviation of "generation" used
    //                      as a column head, not a sentence.
    //   row.label        — the literal word "Model", the plugin's name in both
    //                      languages.
    //   row.cache        — the prompt cache is named "cache" in Romanian
    //                      technical usage; a translation would name a different
    //                      thing than the projection reports.
    if (english === romanian && !UNCHANGED_BY_DESIGN.has(key)) {
      assert.fail(`${key}: ro still reads the English string ${JSON.stringify(english)} — translate it or add it to UNCHANGED_BY_DESIGN with a reason`)
    }
  }
})

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

let failed = 0
for (const [name, fn] of checks) {
  try {
    await fn()
    console.log(`ok   ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}`)
    console.error(`     ${error.message.split('\n').join('\n     ')}`)
  }
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
if (failed > 0) process.exitCode = 1
