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
  formatCount,
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

test('formatCount renders whole non-negative counts', () => {
  assert.equal(formatCount(0), '0')
  assert.equal(formatCount(1), '1')
  assert.equal(formatCount(1234), '1234')
})

test('formatCount refuses values a label cannot decline', () => {
  // Each of these reaches a call site inside a locale-owned label; rendering one
  // would print "-3 subagents" or "2.9 subagents" inside text that was written
  // for a count.
  assert.equal(formatCount(-3), '')
  assert.equal(formatCount(2.9), '')
  assert.equal(formatCount(NaN), '')
  assert.equal(formatCount(Infinity), '')
  assert.equal(formatCount(-Infinity), '')
  assert.equal(formatCount('3'), '')
  assert.equal(formatCount(null), '')
  assert.equal(formatCount(undefined), '')
  assert.equal(formatCount({}), '')
})

test('formatCount renders a count only when both the total and the noun exist', () => {
  // The count is substituted into dictionary text such as "{count} subagents",
  // so an empty rendering must leave a label the dictionary can still speak.
  assert.notEqual(formatCount(3), '')
  assert.equal(formatCount(-3), '')
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

test('childRouteOf reports inherited for a continuable with no route either', () => {
  // A continuable descriptor that records no agentModel has no route of its own
  // to show, so it ran on its parent's — the same fact the one-shot descriptor
  // reports. Answering 'none' here was what hid the model for continuable
  // children while one-shot children showed one.
  assert.equal(childRouteOf(identity({ mode: 'continuable', label: 'child' })).source, 'inherited')
})

test('childRouteOf gives an unrouted child the same answer in either mode', () => {
  const oneShot = childRouteOf(identity({ mode: 'one-shot', label: 'child' }))
  const continuable = childRouteOf(identity({ mode: 'continuable', label: 'child' }))
  assert.deepEqual(continuable, oneShot)
})

test('childRouteOf keeps an effort on a descriptor with no model', () => {
  // A continuable descriptor may carry the effort without the model, which is
  // exactly the descriptor this change routes to the lineage.
  const route = childRouteOf(identity({ agentReasoningEffort: 'high' }))
  assert.equal(route.source, 'inherited')
  assert.equal(route.effort, 'high')
  assert.equal(route.model, '')
})

test('childRouteOf rejects unusable input', () => {
  // Only the absent-descriptor case is 'none'; a descriptor that is present but
  // carries no route is 'inherited' in every mode.
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

test('isPending and readProjection agree on every malformed selection', () => {
  // The two exported predicates read the same snapshot, so a caller that renders
  // `pending` from one and a chip marker from the other must never contradict
  // itself. An empty model on either side is not a switch away from a model:
  // comparing '' against 'chat' used to report a queued switch that no route
  // could actually explain.
  const cases = [
    ['next model empty', snapshot({ provider: 'p', model: '' }, { provider: 'p', model: 'chat' })],
    ['lastUsed model empty', snapshot({ provider: 'p', model: 'chat' }, { provider: 'p', model: '' })],
    ['both models empty', snapshot({ provider: 'p', model: '' }, { provider: 'p', model: '' })],
    ['next selection null', snapshot(null, { provider: 'p', model: 'chat' })],
    ['next selection undefined', snapshot(undefined, { provider: 'p', model: 'chat' })],
    ['lastUsed selection null', snapshot({ provider: 'p', model: 'chat' }, null)],
    ['lastUsed selection undefined', snapshot({ provider: 'p', model: 'chat' }, undefined)],
    ['selection not an object', { values: { [PROJECTION_KEY]: 'nope' } }],
    ['selection key absent', { values: {} }],
    ['values absent entirely', {}],
    ['snapshot absent entirely', undefined],
  ]

  for (const [name, value] of cases) {
    assert.equal(isPending(value), readProjection(value).pending, name)
  }

  // The specific disagreement that was pinned wrong: a route with no readable
  // model is not moving away from one.
  assert.equal(isPending(snapshot({ provider: 'p', model: '' }, { provider: 'p', model: 'chat' })), false)
})

test('isPending still reports a real queued switch on a malformed neighbour', () => {
  // A genuinely different pair of readable models is still a switch, so the
  // empty-model guard does not swallow every disagreement.
  assert.equal(isPending(snapshot({ provider: 'p', model: 'next' }, { provider: 'p', model: 'used' })), true)
  assert.equal(isPending(snapshot({ provider: 'p', model: 'chat-preview' }, { provider: 'p', model: 'chat-latest' })), false)
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

test('resolveRoute drops the effort when no ancestor model was found', () => {
  // A descriptor can carry the effort without the model. Reporting that effort
  // beside an empty model renders a bare "(high)" naming an effort no ancestor
  // was found for, so the effort is dropped with the model it belonged to.
  const projections = {
    child: { values: { [IDENTITY_KEY]: identity({ agentReasoningEffort: 'high' }) } },
    parent: { values: { [IDENTITY_KEY]: identity({ agentReasoningEffort: 'high' }) } },
  }
  const byId = { parent: {}, child: { parentId: 'parent' } }
  const result = resolveRoute(projections, byId, 'child')
  assert.equal(result.model, '')
  assert.equal(result.effort, '')
  assert.equal(result.source, 'inherited')
})

test('resolveRoute walks a continuable child with no route of its own', () => {
  // The defect this fixes: with model selection off, every child inherits, and
  // the one-shot children said so while continuable ones reported 'none' and
  // stopped the walk before it started.
  const projections = {
    parent: snapshot({ provider: 'p', model: 'deepseek-chat', reasoningEffort: 'high' }),
    child: { values: { [IDENTITY_KEY]: identity({ mode: 'continuable', label: 'child' }) } },
  }
  const byId = { parent: {}, child: { parentId: 'parent' } }
  const result = resolveRoute(projections, byId, 'child')
  assert.equal(result.model, 'deepseek-chat')
  assert.equal(result.effort, 'high')
  assert.equal(result.source, 'inherited')
  assert.equal(result.inheritedFrom, 'parent')
})

test('resolveRoute names the same model for a continuable and a one-shot child', () => {
  // Side by side, with only the descriptor's mode differing.
  const projections = {
    parent: snapshot({ provider: 'p', model: 'deepseek-chat' }),
    continuable: { values: { [IDENTITY_KEY]: identity({ mode: 'continuable', label: 'c' }) } },
    oneShot: { values: { [IDENTITY_KEY]: identity({ mode: 'one-shot', label: 'o' }) } },
  }
  const byId = {
    parent: {},
    continuable: { parentId: 'parent' },
    oneShot: { parentId: 'parent' },
  }
  const continuableResult = resolveRoute(projections, byId, 'continuable')
  const oneShotResult = resolveRoute(projections, byId, 'oneShot')
  assert.equal(continuableResult.model, oneShotResult.model)
  assert.equal(continuableResult.model, 'deepseek-chat')
  assert.equal(continuableResult.inheritedFrom, oneShotResult.inheritedFrom)
  assert.deepEqual(continuableResult, oneShotResult)
})

test('resolveRoute walks through a parent that has no list row of its own', () => {
  // The parent is in the resident store but absent from byId: its own parent
  // link cannot be read, so the walk stops there, but its route is still the
  // answer. This is a loaded parent whose row the list has not built yet.
  const projections = {
    child: { values: { [IDENTITY_KEY]: identity({ mode: 'continuable', label: 'child' }) } },
    parent: snapshot({ provider: 'p', model: 'deepseek-chat', reasoningEffort: 'high' }),
  }
  const byId = { child: { parentId: 'parent' } }
  const result = resolveRoute(projections, byId, 'child')
  assert.equal(result.model, 'deepseek-chat')
  assert.equal(result.effort, 'high')
  assert.equal(result.source, 'inherited')
  assert.equal(result.inheritedFrom, 'parent')
})

test('resolveRoute terminates on a parent chain that points at itself', () => {
  // A self-loop is not the two-cycle the other test covers: `visited` starts as
  // the session itself, so the first hop is already a repeat.
  const projections = {
    a: { values: { [IDENTITY_KEY]: identity({ mode: 'continuable', label: 'a' }) } },
  }
  const byId = { a: { parentId: 'a' } }
  const result = resolveRoute(projections, byId, 'a')
  assert.equal(result.model, '')
  assert.equal(result.source, 'inherited')
  assert.equal(result.inheritedFrom, undefined)
})

test('resolveRoute terminates on a self-loop whose own route is explicit', () => {
  // An own route short-circuits the walk, so the self-loop is never followed.
  const projections = { a: snapshot({ provider: 'p', model: 'deepseek-chat' }) }
  const byId = { a: { parentId: 'a' } }
  const result = resolveRoute(projections, byId, 'a')
  assert.equal(result.model, 'deepseek-chat')
  assert.equal(result.source, 'selection')
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

test('resolveRoute walks a child the client store knows only as a list row', () => {
  // The defect this fixes, measured over the real session cache: a subagent listed
  // in its parent's catalog but never opened has NO resident projection store, so
  // `resolveModel` reached for `byId[child].projectionValues` — and the list row
  // carries none for a session that never ran. That returned source 'none', which
  // `resolveRoute` treats as "owns its route", so the parent walk never happened
  // and every child reported an empty model. The summary then had total > 0 with
  // zero groups, and the header chip showed no model beside any subagent.
  //
  // A child is a child by lineage, not by which store happens to hold it, so the
  // absence of a list row's values must not end the walk.
  const projections = { parent: snapshot({ provider: 'p', model: 'deepseek-chat', reasoningEffort: 'high' }) }
  const byId = { parent: {}, child: { parentId: 'parent' } }
  const result = resolveRoute(projections, byId, 'child')
  assert.equal(result.model, 'deepseek-chat')
  assert.equal(result.effort, 'high')
  assert.equal(result.source, 'inherited')
  assert.equal(result.inheritedFrom, 'parent')
})

test('summarizeSubagentModels groups children known only as list rows', () => {
  // The user-visible consequence, on the exact shape a real parent has: a catalog
  // of children that were never opened. `byId` rows exist (the controller
  // synthesizes them from the catalog) but carry no projectionValues.
  const projections = {
    root: {
      values: {
        subagentCatalog: [{ id: 'a' }, { id: 'b' }],
        [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } },
      },
    },
  }
  const byId = {
    root: { origin: 'root' },
    a: { parentId: 'root', origin: 'subagent' },
    b: { parentId: 'root', origin: 'subagent' },
  }
  const summary = summarizeSubagentModels(projections, byId, 'root')
  assert.equal(summary.total, 2)
  assert.equal(summary.groups.length, 1, 'the two children share one inherited model, so they form one group')
  assert.equal(summary.groups[0].count, 2)
})

test('summarizeSubagentModels reports children whose model is unreadable', () => {
  // A child with no selection projection anywhere in its lineage cannot be placed
  // on any model row. It still counts in `total`, so without `unrouted` the panel's
  // rows would look like the whole story while silently omitting it.
  const projections = { root: { values: { subagentCatalog: [{ id: 'a' }] } } }
  const byId = { root: { origin: 'root' }, a: { parentId: 'root', origin: 'subagent' } }
  const summary = summarizeSubagentModels(projections, byId, 'root')
  assert.equal(summary.total, 1, 'the unroutable child is still a descendant')
  assert.equal(summary.unrouted, 1)
  assert.equal(summary.models.length, 0, 'and it forms no model row')
})

test('the model roll-up collapses one model used at several efforts', () => {
  // The panel lists MODELS. `orderGroups` splits on model AND effort, so a run
  // that used deepseek-reasoner at `high` and at the default would otherwise show
  // that model on two adjacent rows, reading as two different models.
  const projections = {
    root: { values: { subagentCatalog: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } },
    a: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-reasoner', reasoningEffort: 'high' } } } },
    b: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-reasoner' } } } },
    c: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } } },
  }
  const byId = {
    root: { origin: 'root' },
    a: { parentId: 'root', origin: 'subagent', running: false },
    b: { parentId: 'root', origin: 'subagent', running: true },
    c: { parentId: 'root', origin: 'subagent', running: false },
  }
  const summary = summarizeSubagentModels(projections, byId, 'root')

  assert.equal(summary.groups.length, 3, 'the precise model+effort view keeps them apart')
  assert.equal(summary.models.length, 2, 'the roll-up names each model once')
  const reasoner = summary.models.find((entry) => entry.model === 'deepseek-reasoner')
  assert.ok(reasoner, 'deepseek-reasoner must appear in the roll-up')
  assert.equal(reasoner.count, 2, 'both efforts count toward the one model')
  assert.equal(reasoner.running, 1, 'and the running child is counted against it')
  assert.deepEqual(reasoner.efforts.map((e) => e.effort), ['high', ''],
    'both efforts are named, in first-appearance order')
  // Busiest first, which is what the bar and the row order rely on.
  assert.equal(summary.models[0].model, 'deepseek-reasoner')
  assert.equal(summary.unrouted, 0)
})

test('the model roll-up keeps one entry for a model used at one effort', () => {
  const projections = {
    root: { values: { subagentCatalog: [{ id: 'a' }, { id: 'b' }] } },
    a: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } } },
    b: { values: { [PROJECTION_KEY]: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } } } },
  }
  const byId = {
    root: { origin: 'root' },
    a: { parentId: 'root', origin: 'subagent', running: false },
    b: { parentId: 'root', origin: 'subagent', running: false },
  }
  const summary = summarizeSubagentModels(projections, byId, 'root')
  assert.equal(summary.models.length, 1)
  assert.equal(summary.models[0].count, 2)
  assert.deepEqual(summary.models[0].efforts.map((e) => e.effort), [''])
})

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
 * catalogOf
 * ------------------------------------------------------------------ */

test('catalogOf returns the entries of a loaded parent', () => {
  const projections = { root: { values: { subagentCatalog: [{ id: 'a' }, { id: 'b' }] } } }
  assert.deepEqual(catalogOf(projections, 'root'), [{ id: 'a' }, { id: 'b' }])
})

test('catalogOf tells a childless parent from an unloaded one', () => {
  // A loaded leaf is an empty array; a session nobody has touched is undefined.
  // Collapsing the two would make an unopened parent look childless.
  assert.deepEqual(catalogOf({ root: { values: { subagentCatalog: [] } } }, 'root'), [])
  assert.equal(catalogOf({ root: { values: {} } }, 'root'), undefined)
  assert.equal(catalogOf({}, 'root'), undefined)
})

test('catalogOf returns undefined when the catalog is not an array', () => {
  assert.equal(catalogOf({ root: { values: { subagentCatalog: null } } }, 'root'), undefined)
  assert.equal(catalogOf({ root: { values: { subagentCatalog: { id: 'a' } } } }, 'root'), undefined)
})

test('catalogOf rejects unusable stores', () => {
  assert.equal(catalogOf(null, 'root'), undefined)
  assert.equal(catalogOf(undefined, 'root'), undefined)
  assert.equal(catalogOf({}, null), undefined)
  assert.equal(catalogOf({}, ''), undefined)
})

/* ------------------------------------------------------------------ *
 * groupRows
 * ------------------------------------------------------------------ */

test('groupRows cuts one grouping and repeats it per depth', () => {
  const rows = [
    { depth: 1, route: { model: 'a-model', effort: '' }, running: false },
    { depth: 1, route: { model: 'a-model', effort: '' }, running: false },
    { depth: 2, route: { model: 'b-model', effort: '' }, running: true },
  ]
  const levels = groupRows(rows)
  assert.deepEqual(levels.all.map((group) => [group.model, group.count]), [['a-model', 2], ['b-model', 1]])
  assert.deepEqual(levels.byDepth.map((level) => level.depth), [1, 2])
  assert.deepEqual(levels.byDepth.map((level) => level.total), [2, 1])
  assert.equal(levels.byDepth[1].groups[0].running, 1)
})

test('groupRows orders depths ascending and omits the ones with no rows', () => {
  // Depth 3 is absent from the rows and must not appear as an empty bucket.
  const rows = [
    { depth: 3, route: { model: 'a-model', effort: '' }, running: false },
    { depth: 1, route: { model: 'a-model', effort: '' }, running: false },
  ]
  assert.deepEqual(groupRows(rows).byDepth.map((level) => level.depth), [1, 3])
})

test('groupRows counts unroutable rows in the depth total but not as a group', () => {
  const rows = [
    { depth: 1, route: { model: '', effort: '' }, running: false },
    { depth: 1, route: { model: '', effort: '' }, running: false },
    { depth: 1, route: { model: 'a-model', effort: '' }, running: false },
  ]
  const levels = groupRows(rows)
  assert.equal(levels.byDepth[0].total, 3)
  assert.deepEqual(levels.byDepth[0].groups.map((group) => [group.model, group.count]), [['a-model', 1]])
})

test('groupRows returns nothing to group for an empty walk', () => {
  assert.deepEqual(groupRows([]), { all: [], byDepth: [] })
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

test('the nested dictionaries share one key set', async () => {
  const en = await readFlatDictionary('en')
  const ro = await readFlatDictionary('ro')

  const enKeys = Object.keys(en).sort()
  assert.deepEqual(Object.keys(ro).sort(), enKeys)
})

test('the nested dictionaries flatten to exactly the inlined browser copies', async () => {
  const inlined = await readInlinedDictionaries()

  for (const locale of ['en', 'ro']) {
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

  for (const locale of ['en', 'ro']) {
    const flat = await readFlatDictionary(locale)
    for (const [key, value] of Object.entries(flat)) {
      assert.deepEqual(placeholdersOf(value), placeholdersOf(en[key]), `${locale}.${key} placeholders`)
      assert.ok(!value.includes('{{'), `${locale}.${key} has a double brace`)
      assert.equal(inlined[locale][key], value, `${locale}.${key} matches the inlined copy`)
    }
  }
})
