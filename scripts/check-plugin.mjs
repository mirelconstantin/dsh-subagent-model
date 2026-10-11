/**
 * dsh-subagent-model — composition checks, no DSH runtime required.
 *
 * Run: `node scripts/check-plugin.mjs`
 *
 * Asserts the manifest, the bundle patch, and the browser half's external
 * contract: that `src/client.js` is valid plain script (a classic script
 * cannot `import` or `export`), that it declares NO services, and that it
 * registers a fresh id in each of its two seats so no shipped occupant is
 * displaced. Each check names the shipped behaviour it protects.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const read = (relative) => readFile(path.join(root, relative), 'utf8')

const checks = []
const check = (name, fn) => checks.push([name, fn])

/* ------------------------------------------------------------------ *
 * Manifest
 * ------------------------------------------------------------------ */

check('package.json declares the bundle patch and the client export', async () => {
  const pkg = JSON.parse(await read('package.json'))
  assert.equal(pkg.name, 'dsh-subagent-model')
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
  assert.equal(pkg.peerDependencies, undefined)
  // This plugin reads projection values the client store already holds, so it
  // needs nothing installed to run.
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
  const source = await read('src/client.js')
  assert.ok(!/^\s*import\s/m.test(source), 'client.js must not use import')
  assert.ok(!/^\s*export\s/m.test(source), 'client.js must not use export')
  assert.ok(!/^\s*export\s*\{/m.test(source), 'client.js must not use an export block')
  // JSX does not survive an unevaluated classic script either.
  assert.ok(!/>\s*<\/?[A-Za-z]/.test(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'client.js must not contain JSX')
})

check('src/client.js registers through window.__ModuleLoader__.load', async () => {
  const source = await read('src/client.js')
  assert.match(source, /window\.__ModuleLoader__\.load\(/)
})

check('src/client.js declares no services', async () => {
  const source = await read('src/client.js')
  // Comments mention `inject: ['timer']` when explaining why the gate stays
  // empty, so strip them before asserting on the real declaration.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  // `inject: []` is load-bearing: naming `slots` parks this row on a service
  // whose provider sits in the very packages this row is mounted beside, and
  // the two can wait on each other until the boot fails.
  assert.match(code, /inject:\s*\[\s*\],/)
  assert.ok(!/inject:\s*\[(?!\s*\])/.test(code), 'client.js must not declare service dependencies')
})

/* ------------------------------------------------------------------ *
 * The two seats
 * ------------------------------------------------------------------ */

check('the additive seats use fresh ids, and only the tree takes a shipped cell', async () => {
  const source = await read('src/client.js')
  // The header chip and the hover row ADD cells, so their ids must be this
  // plugin's own. The tree is the deliberate exception: it REPLACES
  // `subagent-catalog` (see the shadowing-priority check below), and it must
  // name that id through the constant so the takeover is one edit to undo.
  const literalIds = [...source.matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1])
  for (const id of literalIds) {
    assert.notEqual(id, 'subagent-catalog', 'the shipped cell must be claimed through SHADOWED_CELL_ID')
  }
  // Anchored on the registration object literals, which are indented deeper than
  // any function parameter list — a bare `\bid:` also matches `rootId,` in a
  // signature.
  const shorthand = [...source.matchAll(/^\s{16}id:\s*([A-Za-z_][A-Za-z0-9_]*),$/gm)].map((m) => m[1])
  assert.ok(shorthand.length === 3, `all three seats must register exactly one id each (found ${shorthand.length})`)
  for (const name of shorthand) {
    assert.match(source, new RegExp(`const ${name} = '([^']+)'`), `${name} must be a declared constant`)
  }
})

check('the header seat is the session actions slot', async () => {
  const source = await read('src/client.js')
  assert.match(source, /ACTIONS_SLOT\s*=\s*'conversation\.session\.header\.actions'/)
})

check('the hover seat is the sidebar session-row hover slot', async () => {
  const source = await read('src/client.js')
  assert.match(source, /HOVER_SLOT\s*=\s*'sidebar\.session\.row\.hover'/)
})

check('both registrations are deferred through slots.inject', async () => {
  const source = await read('src/client.js')
  // `register` throws when the slot is not yet declared
  // (`dsh-client-ui-slots/lib/index.js:163-165`), so every seat is wrapped.
  const injects = source.match(/slots\.inject\(/g) ?? []
  assert.ok(injects.length >= 3, 'all three seats must be deferred through slots.inject')
})

check('the stylesheet injects idempotently', async () => {
  const source = await read('src/client.js')
  assert.match(source, /querySelector\('style\[data-plugin-css="'/)
  assert.match(source, /tag\.setAttribute\('data-plugin-css'/)
})

/* ------------------------------------------------------------------ *
 * Shared logic is mirrored, not duplicated in behaviour
 * ------------------------------------------------------------------ */

check('src/client.js inlines the model-selection key it reads', async () => {
  const client = await read('src/client.js')
  const model = await read('src/model.js')
  // The browser half cannot import the shared module, so it inlines it. The
  // two copies must agree on the projection keys or the chip reads nothing.
  assert.ok(model.includes("const PROJECTION_KEY = 'modelSelection'"))
  assert.ok(model.includes("const IDENTITY_KEY = 'subagent'"))
  assert.ok(client.includes("const PROJECTION_KEY = 'modelSelection'"))
  assert.ok(client.includes("const IDENTITY_KEY = 'subagent'"))
})

check('src/client.js inlines every exported model function', async () => {
  const client = await read('src/client.js')
  const model = await read('src/model.js')
  for (const name of ['shortenModel', 'readRoute', 'childRouteOf', 'readProjection', 'isLoaded', 'isPending', 'resolveModel', 'resolveRoute', 'catalogOf', 'orderGroups', 'groupRows', 'summarizeSubagentModels', 'formatModelGroup', 'formatCount']) {
    assert.ok(model.includes(`function ${name}(`), `src/model.js must export ${name}`)
    assert.ok(client.includes(`function ${name}(`), `src/client.js must inline ${name}`)
  }
})

check('src/client.js reads the list-row projection values as the subagent fallback', async () => {
  const client = await read('src/client.js')
  // `projectionsBySession` only holds sessions whose projection store is
  // resident, so a never-opened subagent is invisible in it. The list rows
  // carry the same values under `projectionValues`
  // (dsh-api-session-controller/lib/client.js:2942,3521,3549) — reading only
  // the first source is what made subagents show no model at all.
  assert.ok(client.includes('projectionValues'), 'client.js must read the list-row projection values')
  assert.match(client, /byId\?\.\[sessionId\]\?\.projectionValues/)
})

check('src/client.js renders the reasoning effort beside the model', async () => {
  const client = await read('src/client.js')
  // The effort is optional on the same route record, so a guard must keep the
  // chip compact when it is unset.
  assert.match(client, /route\.effort !== ''\s*\?/)
  assert.match(client, /'dsh-smr-chipEffort'/)
  assert.match(client, /chip\.titleWithEffort/)
})

check('src/client.js reports one-shot descent rather than guessing a model', async () => {
  const client = await read('src/client.js')
  // A one-shot descriptor omits the agent route
  // (dsh-subagent/lib/types/descriptor.js:37,118-126), so inherited is the
  // honest answer for a child whose explicit model is not durable.
  assert.match(client, /source === 'inherited'/)
  assert.match(client, /row\.inherited/)
})

check('the header chip renders on a child session too', async () => {
  const client = await read('src/client.js')
  // Removing the `origin === 'subagent'` guard is what makes an OPENED subagent
  // state its model. A reintroduced guard would hide it again.
  const start = client.indexOf('function ModelChip(')
  const end = client.indexOf('function ModelHoverRow(')
  assert.ok(start !== -1 && end > start, 'the header chip component must exist')
  const chip = client.slice(start, end)
  assert.ok(!/origin === 'subagent'/.test(chip), 'the header chip must not skip child sessions')
  assert.ok(chip.includes('resolveRoute('), 'the header chip must resolve the effective route')
})

check('the inherited route is recovered by walking the parent chain', async () => {
  const client = await read('src/client.js')
  const model = await read('src/model.js')
  // With model selection off (the `subagent` default) every child inherits its
  // parent's route, and that route is nowhere in the child's own log — so the
  // walk up `parentId` is what lets a subagent's header name a real model.
  for (const [source, label] of [[client, 'src/client.js'], [model, 'src/model.js']]) {
    assert.match(source, /parentId/, `${label} must read parentId`)
    assert.match(source, /visited\.has/, `${label} must guard against a cyclic chain`)
    assert.match(source, /MAX_PARENT_HOPS/, `${label} must bound the walk`)
  }
})

check('the tooltip groups subagents by the model they run on', async () => {
  const client = await read('src/client.js')
  assert.match(client, /summarizeSubagentModels\(projections, byId, sessionId\)/)
  assert.match(client, /formatModelGroup\(group\)/)
  // The summary must be a LAZY thunk: a Tooltip only calls its label once the
  // bubble is visible, so an ordinary request pays nothing for the walk.
  assert.match(client, /const tooltipLabel = \(\) => \{/)
  assert.match(client, /label: tooltipLabel/)
})

check('the tooltip also cuts the same summary by depth', async () => {
  const client = await read('src/client.js')
  // The integration with the sibling dsh-subagent-tree: both facts come from
  // one walk, so they read in one place. It is printed only when a generation
  // actually splits the flat summary.
  assert.match(client, /summary\.byDepth/)
  assert.match(client, /tip\.byDepth/)
  assert.match(client, /splits/)
})

check('the hover row shows what the session actually did', async () => {
  const client = await read('src/client.js')
  // Every fact is read from a projection the client already holds, and each row
  // appears only when its value is present, so a zero never reads as "did
  // nothing".
  assert.match(client, /values\.sessionStats/)
  assert.match(client, /values\.subagentTiming/)
  assert.match(client, /row\.turns/)
  assert.match(client, /row\.task/)
  assert.match(client, /row\.modeOneShot/)
  assert.match(client, /decodeTokens/)
})

check('the queued route switch is reported with the model it replaces', async () => {
  const client = await read('src/client.js')
  const model = await read('src/model.js')
  // No projection ships `request/header`, so the per-turn history is NOT
  // reachable from a client plugin. What IS reachable is the disagreement
  // between `next` and `lastUsed`, which names the route being replaced.
  assert.match(model, /switchedFrom: pending \? lastUsed\.model : ''/)
  assert.match(client, /route\.switchedFrom/)
  assert.match(client, /row\.switchFrom/)
})

check('the tree owns the shipped catalog cell at a written shadowing priority', async () => {
  const client = await read('src/client.js')
  // The shipped CatalogRows renders no per-row slot
  // (dsh-client-ui-subagent/lib/client.js:164-338), so a marker beside a
  // subagent REQUIRES owning the cell. A `list` slot keeps the first entry per
  // `id` cell, so a very low priority is what performs the takeover.
  assert.match(client, /const SHADOWED_CELL_ID = 'subagent-catalog'/)
  assert.match(client, /const SHADOW_PRIORITY = -9999/)
  assert.match(client, /id: SHADOWED_CELL_ID/)
  assert.match(client, /priority: SHADOW_PRIORITY/)
})

check('the route marker stays silent when nothing distinguishes the child', async () => {
  const client = await read('src/client.js')
  // With selection off every child inherits, so marking each one would mark all
  // of them and say nothing. A marker appears only for a subagent whose route
  // is its OWN.
  assert.match(client, /function routeMarker\(/)
  assert.match(client, /dsh-smt-modelDiffers/)
  assert.match(client, /chip\.differs/)
  // The tree must port through react-dom: rendered inline it would be clipped
  // by the conversation shell's overflow.
  assert.match(client, /react-dom/)
  assert.match(client, /createPortal/)
})

/* ------------------------------------------------------------------ *
 * Dictionaries
 * ------------------------------------------------------------------ */

check('every shipped dictionary exists and parses', async () => {
  for (const locale of ['en', 'ro']) {
    const raw = await read(`locale/${locale}.json`)
    const nested = JSON.parse(raw)
    assert.ok(nested.chip !== undefined, `${locale}.json needs a chip group`)
    assert.ok(nested.row !== undefined, `${locale}.json needs a row group`)
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
