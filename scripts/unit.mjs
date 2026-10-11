/**
 * dsh-subagent-model — unit suite for the shared model-reading logic.
 *
 * Run: `node --test scripts/unit.mjs`
 *
 * Covers `src/model.js` (the tested source of truth) and the parity of the
 * three nested `locale/*.json` files with the FLATTENED copies inlined in
 * `src/client.js`. A classic script cannot import the JSON files, so the
 * browser half carries its own flattened copies; the two sets must agree or a
 * locale renders a raw key string at runtime
 * (`dsh-client-locale/lib/client.js:1425`), which is visible garbage rather
 * than a failure.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  IDENTITY_KEY,
  MAX_PARENT_HOPS,
  PROJECTION_KEY,
  catalogOf,
  childRouteOf,
  formatModelGroup,
  groupRows,
  isLoaded,
  isPending,
  modelLabelOf,
  modelOf,
  modelTooltip,
  orderGroups,
  readProjection,
  readRoute,
  resolveModel,
  resolveRoute,
  shortenModel,
  summarizeSubagentModels,
} from '../src/model.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

/** Build one resident projection snapshot in the shape the store hands over. */
function snapshot(next, lastUsed) {
  return { values: { [PROJECTION_KEY]: { lastUsed: lastUsed ?? null, next: next ?? null } } }
}

/** Build one list-row attachment, the `byId[id].projectionValues` shape. */
function attached(values) {
  return values
}

/** One `subagent` identity value. */
function identity(overrides = {}) {
  return { mode: 'continuable', label: 'child', ...overrides }
}

/** Read and flatten one nested dictionary file. */
async function readFlatDictionary(locale) {
  const raw = await readFile(path.join(root, 'locale', `${locale}.json`), 'utf8')
  const nested = JSON.parse(raw)
  const flat = {}
  for (const [group, keys] of Object.entries(nested)) {
    for (const [key, value] of Object.entries(keys)) {
      flat[`${group}.${key}`] = value
    }
  }
  return flat
}

/**
 * Read the flattened dictionaries inlined in `src/client.js`.
 *
 * The browser half is a classic script whose only entry point is the
 * `window.__ModuleLoader__.load({ id, factory })` call. Evaluating the source
 * under a stub `window` captures that argument; the factory is then invoked
 * with a `require` stub that resolves the two seed words this bundle needs and
 * throws on anything else. The dictionaries are captured by running the
 * returned `apply` with a minimal locale stub whose `register` records what
 * was handed over.
 */
async function readInlinedDictionaries() {
  const source = await readFile(path.join(root, 'src', 'client.js'), 'utf8')

  let loaded = null
  const invoke = new Function('window', `${source}\nreturn window.__ModuleLoader__`)
  const loader = invoke({ __ModuleLoader__: { load: (entry) => { loaded = entry } } })
  assert.ok(loader !== null && typeof loader === 'object', 'client.js did not expose window.__ModuleLoader__')
  assert.ok(loaded !== null, 'client.js did not call window.__ModuleLoader__.load')
  assert.equal(typeof loaded.factory, 'function', 'the load() entry has no factory')

  const registered = new Map()
  const locale = {
    register: (namespace, localeId, dictionary) => {
      registered.set(localeId, dictionary)
      return () => undefined
    },
    addLanguage: () => () => undefined,
  }
  // `slots` is deliberately not provided, so the slot registration path is
  // never reached; the locale registration is reached immediately through the
  // `ctx.get` below, which is what `whenService` polls for.
  const ctx = {
    get: (name) => (name === 'locale' ? locale : undefined),
    effect: (fn) => fn(),
  }
  const entry = loaded.factory((name) => {
    if (name === 'react') return { createElement: () => null }
    throw new Error(`unexpected seed word: ${name}`)
  })
  entry.apply(ctx)

  return Object.fromEntries(registered)
}

/* ------------------------------------------------------------------ *
 * shortenModel
 * ------------------------------------------------------------------ */

test('shortenModel drops the implied preview and latest suffixes', () => {
  assert.equal(shortenModel('step-5-preview-free'), 'step-5-preview-free')
  assert.equal(shortenModel('deepseek-chat-preview'), 'deepseek-chat')
  assert.equal(shortenModel('deepseek-chat-latest'), 'deepseek-chat')
  assert.equal(shortenModel('deepseek-chat'), 'deepseek-chat')
})

test('shortenModel is case-insensitive and trims', () => {
  assert.equal(shortenModel('  deepseek-chat-PREVIEW  '), 'deepseek-chat')
  assert.equal(shortenModel(' DeepSeek-Latest '), 'DeepSeek')
})

test('shortenModel keeps every other id verbatim', () => {
  assert.equal(shortenModel('gpt-4o-mini-2024-07-18'), 'gpt-4o-mini-2024-07-18')
  assert.equal(shortenModel('claude-sonnet-4-5-20250929'), 'claude-sonnet-4-5-20250929')
})

test('shortenModel rejects unusable input', () => {
  assert.equal(shortenModel(''), '')
  assert.equal(shortenModel('   '), '')
  assert.equal(shortenModel(null), '')
  assert.equal(shortenModel(undefined), '')
  assert.equal(shortenModel(42), '')
})

/* ------------------------------------------------------------------ *
 * readRoute — model plus reasoning effort
 * ------------------------------------------------------------------ */

test('readRoute reads the model and the effort from one record', () => {
  assert.deepEqual(readRoute({ provider: 'p', model: 'deepseek-chat', reasoningEffort: 'high' }), {
    model: 'deepseek-chat',
    effort: 'high',
  })
})

test('readRoute leaves the effort empty when it is unset', () => {
  assert.deepEqual(readRoute({ provider: 'p', model: 'deepseek-chat' }), { model: 'deepseek-chat', effort: '' })
})

test('readRoute rejects unusable input', () => {
  assert.deepEqual(readRoute(null), { model: '', effort: '' })
  assert.deepEqual(readRoute(undefined), { model: '', effort: '' })
  assert.deepEqual(readRoute('nope'), { model: '', effort: '' })
})

test('readRoute trims a padded effort and ignores a non-string one', () => {
  assert.deepEqual(readRoute({ model: 'm', reasoningEffort: '  low  ' }), { model: 'm', effort: 'low' })
  assert.deepEqual(readRoute({ model: 'm', reasoningEffort: 7 }), { model: 'm', effort: '' })
})

/* ------------------------------------------------------------------ *
 * readProjection — effort rides the pending route, else the used one
 * ------------------------------------------------------------------ */

test('readProjection reports the route and where it came from', () => {
  assert.deepEqual(readProjection(snapshot({ provider: 'p', model: 'deepseek-chat' })), {
    model: 'deepseek-chat',
    effort: '',
    pending: false,
    source: 'selection', switchedFrom: '',
    switchedFrom: '',
  })
})

test('readProjection reads the effort off the pending route', () => {
  const value = snapshot(
    { provider: 'p', model: 'deepseek-chat', reasoningEffort: 'high' },
    { provider: 'p', model: 'deepseek-chat', reasoningEffort: 'low' },
  )
  assert.equal(readProjection(value).effort, 'high')
})

test('readProjection keeps the used effort when the pending route declares none', () => {
  // A queued model that has not named an effort still runs at the effort in
  // force, so the used one is shown rather than an empty value.
  const value = snapshot({ provider: 'p', model: 'next-model' }, { provider: 'p', model: 'used-model', reasoningEffort: 'low' })
  const route = readProjection(value)
  assert.equal(route.effort, 'low')
  assert.equal(route.pending, true)
})

test('readProjection reads a list-row attachment with no values wrapper', () => {
  const route = readProjection(attached({ [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } }))
  assert.equal(route.model, 'deepseek-chat')
  assert.equal(route.source, 'selection')
})

test('readProjection falls back to the child descriptor', () => {
  const route = readProjection({ values: { [IDENTITY_KEY]: identity({ agentModel: 'deepseek-reasoner', agentReasoningEffort: 'high' }) } })
  assert.deepEqual(route, { model: 'deepseek-reasoner', effort: 'high', pending: false, source: 'descriptor', switchedFrom: '' })
})

test('readProjection reports one-shot descent when the descriptor omits the route', () => {
  // A one-shot descriptor deliberately omits agentModel
  // (dsh-subagent/lib/types/descriptor.js:37,118-126), so inherited is the
  // honest answer rather than a guessed model.
  const route = readProjection({ values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: 'child' }) } })
  assert.deepEqual(route, { model: '', effort: '', pending: false, source: 'inherited', switchedFrom: '', switchedFrom: '' })
})

test('readProjection returns none for a snapshot with no projections at all', () => {
  assert.deepEqual(readProjection({ values: {} }), { model: '', effort: '', pending: false, source: 'none', switchedFrom: '', switchedFrom: '' })
  assert.deepEqual(readProjection(undefined), { model: '', effort: '', pending: false, source: 'none', switchedFrom: '', switchedFrom: '' })
})

test('readProjection tolerates a selection whose fields are all null', () => {
  // The key exists with a null route, so the source is named while the value is
  // empty — that is a loaded session which has made no request, not an absent
  // projection.
  const route = readProjection(snapshot(null))
  assert.equal(route.model, '')
  assert.equal(route.effort, '')
  assert.equal(route.pending, false)
})

test('readProjection tolerates a selection whose model is not a string', () => {
  assert.equal(readProjection(snapshot({ provider: 'p', model: null })).model, '')
  assert.equal(readProjection(snapshot({ provider: 'p', model: 7 })).model, '')
})

/* ------------------------------------------------------------------ *
 * childRouteOf
 * ------------------------------------------------------------------ */

test('childRouteOf reads a continuable descriptor route', () => {
  assert.deepEqual(childRouteOf(identity({ agentModel: 'deepseek-reasoner', agentReasoningEffort: 'medium' })), {
    model: 'deepseek-reasoner',
    effort: 'medium',
    pending: false,
    source: 'descriptor', switchedFrom: '',
  })
})

test('childRouteOf reads a descriptor with a model but no effort', () => {
  assert.deepEqual(childRouteOf(identity({ agentModel: 'deepseek-chat' })), {
    model: 'deepseek-chat',
    effort: '',
    pending: false,
    source: 'descriptor', switchedFrom: '',
  })
})

test('childRouteOf reports inherited for a one-shot with no route', () => {
  assert.equal(childRouteOf(identity({ mode: 'one-shot', label: 'child' })).source, 'inherited')
})

test('childRouteOf returns none for a child with no descriptor route', () => {
  assert.equal(childRouteOf(identity({ mode: 'continuable', label: 'child' })).source, 'none')
})

test('childRouteOf rejects unusable input', () => {
  for (const value of [null, undefined, 'x', 7]) {
    assert.equal(childRouteOf(value).source, 'none')
  }
})

/* ------------------------------------------------------------------ *
 * resolveModel — the fix for subagents
 * ------------------------------------------------------------------ */

test('resolveModel reads a resident session', () => {
  const projections = { a: snapshot({ provider: 'p', model: 'deepseek-chat' }) }
  assert.deepEqual(resolveModel(projections, {}, 'a'), {
    loaded: true,
    model: 'deepseek-chat',
    effort: '',
    pending: false,
    source: 'selection',
    switchedFrom: '',
  })
})

test('resolveModel falls back to the list row for a session with no resident store', () => {
  // This is the case that made the chip invisible on subagents: the projection
  // store is created lazily
  // (dsh-api-session-controller/lib/client.js:2525), so a child the user never
  // opened is absent from projectionsBySession but PRESENT as a list row.
  const projections = {}
  const byId = {
    child: { projectionValues: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-reasoner', reasoningEffort: 'high' } } } },
  }
  assert.deepEqual(resolveModel(projections, byId, 'child'), {
    loaded: true,
    model: 'deepseek-reasoner',
    effort: 'high',
    pending: false,
    source: 'selection',
    switchedFrom: '',
  })
})

test('resolveModel reads a subagent descriptor off a list row', () => {
  const projections = {}
  const byId = {
    child: { projectionValues: { [IDENTITY_KEY]: identity({ agentModel: 'deepseek-reasoner' }) } },
  }
  assert.equal(resolveModel(projections, byId, 'child').model, 'deepseek-reasoner')
})

test('resolveModel prefers the resident store over the list row', () => {
  const projections = { a: snapshot({ provider: 'p', model: 'resident-model' }) }
  const byId = { a: { projectionValues: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'row-model' } } } } }
  assert.equal(resolveModel(projections, byId, 'a').model, 'resident-model')
})

test('resolveModel reports not loaded only when neither store knows the session', () => {
  assert.deepEqual(resolveModel({}, {}, 'absent'), {
    loaded: false,
    model: '',
    effort: '',
    pending: false,
    source: 'none', switchedFrom: '',
  })
  assert.deepEqual(resolveModel({}, { a: {} }, 'a'), {
    loaded: false,
    model: '',
    effort: '',
    pending: false,
    source: 'none', switchedFrom: '',
  })
})

test('resolveModel rejects unusable stores', () => {
  assert.equal(resolveModel(null, null, 'a').loaded, false)
  assert.equal(resolveModel(undefined, undefined, 'a').loaded, false)
  assert.equal(resolveModel({}, null, 'a').loaded, false)
})

/* ------------------------------------------------------------------ *
 * isLoaded — absent is not the same fact as empty
 * ------------------------------------------------------------------ */

test('isLoaded tells a loaded session from an unloaded one', () => {
  const map = { a: snapshot({ provider: 'p', model: 'm' }) }
  assert.equal(isLoaded(map, 'a'), true)
  assert.equal(isLoaded(map, 'b'), false)
})

test('isLoaded uses own properties, so an inherited key is not a session', () => {
  const map = Object.create({ inherited: snapshot({ provider: 'p', model: 'm' }) })
  assert.equal(isLoaded(map, 'inherited'), false)
})

test('isLoaded rejects unusable input', () => {
  assert.equal(isLoaded(null, 'a'), false)
  assert.equal(isLoaded(undefined, 'a'), false)
  assert.equal(isLoaded({}, ''), false)
  assert.equal(isLoaded({}, null), false)
})

test('a loaded session with no selection still counts as loaded', () => {
  const map = { a: snapshot(null) }
  assert.equal(isLoaded(map, 'a'), true)
  assert.equal(modelOf(map, 'a').model, '')
})

/* ------------------------------------------------------------------ *
 * isPending
 * ------------------------------------------------------------------ */

test('isPending is true when the queued model differs from the used one', () => {
  const value = snapshot({ provider: 'p', model: 'next-model' }, { provider: 'p', model: 'used-model' })
  assert.equal(isPending(value), true)
})

test('isPending is false when the queued model is the used one', () => {
  const used = { provider: 'p', model: 'same-model' }
  assert.equal(isPending(snapshot({ ...used }, { ...used })), false)
})

test('isPending is false for a first selection with no prior request', () => {
  assert.equal(isPending(snapshot({ provider: 'p', model: 'first-model' }, null)), false)
})

test('isPending is false when nothing is queued', () => {
  assert.equal(isPending(snapshot(null, { provider: 'p', model: 'used-model' })), false)
  assert.equal(isPending(snapshot(null)), false)
  assert.equal(isPending({ values: {} }), false)
  assert.equal(isPending(undefined), false)
})

test('isPending compares the model only, ignoring effort and provider', () => {
  const used = { provider: 'p', model: 'same', reasoningEffort: 'low' }
  const next = { provider: 'p', model: 'same', reasoningEffort: 'high' }
  assert.equal(isPending(snapshot(next, used)), false)
})

test('isPending reads a list-row attachment too', () => {
  const value = attached({
    [PROJECTION_KEY]: {
      lastUsed: { provider: 'p', model: 'used-model' },
      next: { provider: 'p', model: 'next-model' },
    },
  })
  assert.equal(isPending(value), true)
})

/* ------------------------------------------------------------------ *
 * modelLabelOf and modelOf — the narrow shapes
 * ------------------------------------------------------------------ */

test('modelLabelOf reads next, which is the pending route then the used one', () => {
  assert.equal(modelLabelOf(snapshot({ provider: 'p', model: 'deepseek-chat' })), 'deepseek-chat')
})

test('modelLabelOf prefers next over lastUsed', () => {
  const value = snapshot({ provider: 'p', model: 'next-model' }, { provider: 'p', model: 'used-model' })
  assert.equal(modelLabelOf(value), 'next-model')
})

test('modelLabelOf is empty for a session with no selection', () => {
  assert.equal(modelLabelOf(snapshot(null)), '')
  assert.equal(modelLabelOf({ values: {} }), '')
  assert.equal(modelLabelOf(undefined), '')
})

test('modelOf separates an unloaded session from one with no model', () => {
  const map = { loaded: snapshot({ provider: 'p', model: 'deepseek-chat' }), empty: snapshot(null) }
  assert.deepEqual(modelOf(map, 'loaded'), { loaded: true, model: 'deepseek-chat' })
  assert.deepEqual(modelOf(map, 'empty'), { loaded: true, model: '' })
  assert.deepEqual(modelOf(map, 'absent'), { loaded: false, model: '' })
})

/* ------------------------------------------------------------------ *
 * modelTooltip
 * ------------------------------------------------------------------ */

test('modelTooltip reports the unknown text for both unknown cases', () => {
  assert.equal(modelTooltip({ loaded: false, model: '' }, 'No model yet'), 'No model yet')
  assert.equal(modelTooltip({ loaded: true, model: '' }, 'No model yet'), 'No model yet')
})

test('modelTooltip reports the model when there is one', () => {
  assert.equal(modelTooltip({ loaded: true, model: 'deepseek-chat' }, 'No model yet'), 'deepseek-chat')
})

/* ------------------------------------------------------------------ *
 * resolveRoute — following an inherited route up the lineage
 * ------------------------------------------------------------------ */

test('resolveRoute returns an own route untouched', () => {
  const projections = { a: snapshot({ provider: 'p', model: 'deepseek-chat' }) }
  const result = resolveRoute(projections, { a: {} }, 'a')
  assert.equal(result.model, 'deepseek-chat')
  assert.equal(result.source, 'selection')
})

test('resolveRoute walks to the parent when the child inherited its route', () => {
  // A one-shot descriptor omits the route, and with model selection off the
  // child runs the parent's — so the header can still name a real model.
  const projections = {
    parent: snapshot({ provider: 'p', model: 'deepseek-chat' }),
    child: { values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: 'child' }) } },
  }
  const byId = { parent: {}, child: { parentId: 'parent' } }
  const result = resolveRoute(projections, byId, 'child')
  assert.equal(result.model, 'deepseek-chat')
  assert.equal(result.source, 'inherited')
  assert.equal(result.inheritedFrom, 'parent')
})

test('resolveRoute walks more than one level when every link inherited', () => {
  const projections = {
    root: snapshot({ provider: 'p', model: 'deepseek-reasoner', reasoningEffort: 'high' }),
    mid: { values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: 'mid' }) } },
    leaf: { values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: 'leaf' }) } },
  }
  const byId = { root: {}, mid: { parentId: 'root' }, leaf: { parentId: 'mid' } }
  const result = resolveRoute(projections, byId, 'leaf')
  assert.equal(result.model, 'deepseek-reasoner')
  assert.equal(result.effort, 'high')
  assert.equal(result.inheritedFrom, 'root')
})

test('resolveRoute reports an unknown model when no ancestor has one either', () => {
  const projections = {
    parent: { values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: 'p' }) } },
    child: { values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: 'c' }) } },
  }
  const byId = { parent: {}, child: { parentId: 'parent' } }
  const result = resolveRoute(projections, byId, 'child')
  assert.equal(result.model, '')
  assert.equal(result.source, 'inherited')
  assert.equal(result.inheritedFrom, undefined)
})

test('resolveRoute terminates on a cyclic parent chain', () => {
  const projections = {
    a: { values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: 'a' }) } },
    b: { values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: 'b' }) } },
  }
  const byId = { a: { parentId: 'b' }, b: { parentId: 'a' } }
  const result = resolveRoute(projections, byId, 'a')
  assert.equal(result.model, '')
  assert.equal(result.source, 'inherited')
})

test('resolveRoute does not walk past the hop bound', () => {
  const projections = {}
  const byId = {}
  const root = snapshot({ provider: 'p', model: 'deepseek-chat' })
  projections.r = root
  byId.r = {}
  // A chain longer than the bound: the last ancestor's model must not surface.
  for (let index = 0; index < MAX_PARENT_HOPS + 4; index += 1) {
    const id = `n${index}`
    projections[id] = { values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: id }) } }
    byId[id] = index === 0 ? { parentId: 'r' } : { parentId: `n${index - 1}` }
  }
  const result = resolveRoute(projections, byId, `n${MAX_PARENT_HOPS + 3}`)
  assert.equal(result.model, '')
})

/* ------------------------------------------------------------------ *
 * summarizeSubagentModels — grouping subagents by the model they run on
 * ------------------------------------------------------------------ */

test('summarizeSubagentModels groups descendants and orders by count', () => {
  const projections = {
    root: { values: { subagentCatalog: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] } },
    a: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } } },
    b: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } } },
    c: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-reasoner' } } } },
    d: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } } },
  }
  const summary = summarizeSubagentModels(projections, {}, 'root')
  assert.equal(summary.total, 4)
  assert.equal(summary.distinct, 2)
  assert.deepEqual(summary.groups.map((group) => [group.model, group.count]), [
    ['deepseek-chat', 3],
    ['deepseek-reasoner', 1],
  ])
})

test('summarizeSubagentModels separates models by reasoning effort', () => {
  const projections = {
    root: { values: { subagentCatalog: [{ id: 'a' }, { id: 'b' }] } },
    a: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat', reasoningEffort: 'high' } } } },
    b: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } } },
  }
  const summary = summarizeSubagentModels(projections, {}, 'root')
  assert.equal(summary.distinct, 2)
})

test('summarizeSubagentModels counts inherited and running descendants', () => {
  // The root must carry its own route for the inherited child to resolve one:
  // `a` has no route of its own, so `resolveRoute` walks up to the root.
  const projections = {
    root: { values: { subagentCatalog: [{ id: 'a' }, { id: 'b' }], [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } } },
    a: { values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: 'a' }) } },
    b: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-reasoner' } } } },
  }
  const byId = { a: { parentId: 'root' }, b: { parentId: 'root', running: true } }
  const summary = summarizeSubagentModels(projections, byId, 'root')
  assert.equal(summary.inherited, 1)
  assert.equal(summary.running, 1)
  assert.equal(summary.distinct, 2)
  assert.deepEqual(summary.groups.map((group) => group.model), ['deepseek-chat', 'deepseek-reasoner'])
})

test('summarizeSubagentModels cuts the same grouping by depth', () => {
  const projections = {
    root: { values: { subagentCatalog: [{ id: 'a' }] } },
    a: { values: { subagentCatalog: [{ id: 'b' }], [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } } },
    b: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-reasoner' } } } },
  }
  const summary = summarizeSubagentModels(projections, {}, 'root')
  assert.equal(summary.total, 2)
  assert.deepEqual(summary.byDepth.map((level) => [level.depth, level.total]), [[1, 1], [2, 1]])
  assert.equal(summary.byDepth[0].groups[0].model, 'deepseek-chat')
  assert.equal(summary.byDepth[1].groups[0].model, 'deepseek-reasoner')
})

test('summarizeSubagentModels counts a depth whose models are unknown', () => {
  const projections = {
    root: { values: { subagentCatalog: [{ id: 'a' }] } },
    a: { values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: 'a' }) } },
  }
  const summary = summarizeSubagentModels(projections, {}, 'root')
  assert.equal(summary.total, 1)
  assert.equal(summary.distinct, 0)
  assert.equal(summary.byDepth[0].total, 1)
  assert.deepEqual(summary.byDepth[0].groups, [])
})

test('summarizeSubagentModels returns an empty summary for a childless session', () => {
  const projections = { root: { values: { subagentCatalog: [] } } }
  const summary = summarizeSubagentModels(projections, {}, 'root')
  assert.equal(summary.total, 0)
  assert.deepEqual(summary.groups, [])
  assert.deepEqual(summary.byDepth, [])
})

test('summarizeSubagentModels terminates on a cyclic catalog', () => {
  const projections = {
    a: { values: { subagentCatalog: [{ id: 'b' }], [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } } },
    b: { values: { subagentCatalog: [{ id: 'a' }], [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } } },
  }
  const summary = summarizeSubagentModels(projections, {}, 'a')
  assert.equal(summary.total, 1)
})

/* ------------------------------------------------------------------ *
 * orderGroups
 * ------------------------------------------------------------------ */

test('orderGroups keeps ties in first-appearance order', () => {
  const rows = [
    { route: { model: 'b-model', effort: '' }, running: false },
    { route: { model: 'a-model', effort: '' }, running: false },
    { route: { model: 'a-model', effort: '' }, running: false },
  ]
  assert.deepEqual(orderGroups(rows).map((group) => [group.model, group.count]), [
    ['a-model', 2],
    ['b-model', 1],
  ])
})

test('orderGroups drops rows with no readable model', () => {
  const rows = [
    { route: { model: 'a-model', effort: '' }, running: false },
    { route: { model: '', effort: '' }, running: false },
  ]
  assert.equal(orderGroups(rows).length, 1)
})

test('formatModelGroup writes the count, the model and the effort when set', () => {
  assert.equal(formatModelGroup({ model: 'deepseek-chat', effort: '', count: 3 }), '3× deepseek-chat')
  assert.equal(formatModelGroup({ model: 'deepseek-chat', effort: 'high', count: 2 }), '2× deepseek-chat (high)')
})

/* ------------------------------------------------------------------ *
 * Locale parity: nested on-disk files vs flattened inlined copies
 * ------------------------------------------------------------------ */

test('the three nested dictionaries share one key set', async () => {
  const en = await readFlatDictionary('en')
  const ro = await readFlatDictionary('ro')
  const zh = await readFlatDictionary('zh')

  const enKeys = Object.keys(en).sort()
  assert.deepEqual(Object.keys(ro).sort(), enKeys)
  assert.deepEqual(Object.keys(zh).sort(), enKeys)
})

test('the nested dictionaries flatten to exactly the inlined browser copies', async () => {
  const inlined = await readInlinedDictionaries()

  for (const locale of ['en', 'ro', 'zh']) {
    const flat = await readFlatDictionary(locale)
    assert.deepEqual(Object.keys(inlined[locale]).sort(), Object.keys(flat).sort(), `${locale} key set`)
    for (const [key, value] of Object.entries(flat)) {
      assert.equal(inlined[locale][key], value, `${locale}.${key}`)
    }
  }
})

test('every dictionary value uses the same single-brace placeholders', async () => {
  const en = await readFlatDictionary('en')
  const inlined = await readInlinedDictionaries()

  const placeholdersOf = (value) => (value.match(/\{[a-zA-Z]+\}/g) ?? []).sort()

  for (const locale of ['en', 'ro', 'zh']) {
    const flat = await readFlatDictionary(locale)
    for (const [key, value] of Object.entries(flat)) {
      assert.deepEqual(placeholdersOf(value), placeholdersOf(en[key]), `${locale}.${key} placeholders`)
      assert.ok(!value.includes('{{'), `${locale}.${key} has a double brace`)
      assert.equal(inlined[locale][key], value, `${locale}.${key} matches the inlined copy`)
    }
  }
})
