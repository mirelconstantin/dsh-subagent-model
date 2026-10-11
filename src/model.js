/**
 * dsh-subagent-model — shared, dependency-free model-reading logic.
 *
 * This module is the seam between the Host-side tests (`scripts/unit.mjs`) and
 * the browser half (`src/client.js`), which the Host concatenates and executes
 * as a CLASSIC script. It therefore declares no imports, no exports the browser
 * cannot carry, and no runtime dependency: the browser half reads these
 * functions out of its own factory scope, and `node --test` imports the file
 * directly.
 *
 * TWO STORE SHAPES, AND WHY BOTH ARE READ. The client exposes session
 * projections in two places, and they hold DIFFERENT sessions:
 *
 *   - `useSessions((state) => state.projectionsBySession)` — one entry per
 *     session whose projection store is resident in the client. Stores are
 *     created lazily (`dsh-api-session-controller/lib/client.js:2525`
 *     `projectionStore()`), so a session only appears here once the client has
 *     actually touched it. That is why a subagent the user never opened is
 *     ABSENT: nothing asked for its projections, so its model is unreadable
 *     from this map alone.
 *
 *   - `useSessions((state) => state.byId[id].projectionValues)` — the values
 *     the Session-list manager attaches to a row while building the list
 *     snapshot (`lib/client.js:2942` and `:3521`, `:3549`). Rows for subagent
 *     sessions are synthesized from the parent's `subagentCatalog` projection
 *     (`:3518-3542`), so this is the source that covers children which are
 *     LISTED but never LOADED.
 *
 * Reading only the first source is what made the chip appear on ordinary
 * conversations and nowhere else. `resolveModel` below therefore takes both
 * and falls back: prefer `projectionsBySession` (it is live and seq-exact), use
 * the list row's `projectionValues` when the session is absent from it.
 *
 * THE PROJECTION THAT IS READ. `modelSelection`, registered by
 * `dsh-api-session-controller` (`lib/types/model-selection-projection.js`,
 * mounted at `lib/index.js:2114` by `installModelSelectionProjection`). Its
 * wire view is `{ lastUsed, next }`:
 *
 *   - `lastUsed` — the route of the last request the session actually made,
 *     folded from that request's own `request/header` config.
 *   - `next`     — the pending selection while a `model/selection` event has
 *     not been consumed by a request, and `lastUsed` otherwise.
 *
 * So `next` is the single value that answers "which model is this session on":
 * it agrees with the last request when nothing is pending and shows the queued
 * switch while one is outstanding. `reasoningEffort` is optional and rides
 * beside the model in the same record.
 *
 * A SECOND PROJECTION FOR SUBAGENTS. `subagent`, registered by `dsh-subagent`
 * (`lib/types/projection.js:142`), carries a child's durable
 * `subagent/descriptor` identity: `mode`, `label`, and for a continuable child
 * also `agentProvider` / `agentModel` / `agentReasoningEffort`. A one-shot
 * descriptor deliberately OMITS the agent route
 * (`dsh-subagent/lib/types/descriptor.js:37,118-126` — it snapshots only what
 * cold resume needs), so a one-shot child's explicit route is not durable and
 * cannot be recovered from it. `childRouteOf` reads it as a fallback, and
 * reports one-shot descent explicitly rather than inventing a value.
 *
 * @module dsh-subagent-model/model
 */

/**
 * The projection key whose route this plugin shows. Spelled once so the Host
 * tests and the browser half cannot drift apart. @type {string}
 */
const PROJECTION_KEY = 'modelSelection'

/** The durable-child identity projection key. @type {string} */
const IDENTITY_KEY = 'subagent'

/**
 * How far up the lineage {@link resolveRoute} follows an inherited route.
 *
 * A bound rather than a loop-until-root, so a pathological or cyclic `parentId`
 * chain terminates with an answer instead of spinning. Delegation depth is
 * bounded well below this in every shipped configuration.
 * @type {number}
 */
const MAX_PARENT_HOPS = 16

/* ------------------------------------------------------------------ *
 * Route values
 * ------------------------------------------------------------------ */

/**
 * Shorten a model id to a compact, still-recognisable label.
 *
 * Provider ids are already short (`deepseek-chat`, `step-5-preview`); the
 * `-preview` / `-latest` suffixes are the part worth dropping in a chip or a
 * hover row, because they are implied by the row the user is already looking
 * at. Everything else is kept verbatim: a truncated id the user cannot map back
 * to the model they chose is worse than a long one.
 *
 * @param {string} model - Raw model id from the projection.
 * @returns {string} The label to display, or an empty string when unusable.
 */
function shortenModel(model) {
  if (typeof model !== 'string') return ''
  const trimmed = model.trim()
  if (trimmed === '') return ''
  return trimmed.replace(/-(preview|latest)$/i, '')
}

/**
 * Format a count for display inside a locale-owned label.
 *
 * The number is rendered here while the noun stays in the dictionary, so it can
 * decline correctly in each language.
 *
 * @param {number} count - The count to render.
 * @returns {string} A decimal rendering, or an empty string when not finite.
 */
function formatCount(count) {
  if (typeof count !== 'number' || !Number.isFinite(count)) return ''
  return String(Math.trunc(count))
}

/**
 * Read one `{ model, reasoningEffort }` pair, tolerating a missing value.
 *
 * @param {any} selection - A `modelSelection` route record, or undefined/null.
 * @returns {{model: string, effort: string}} Both fields, empty when unset.
 */
function readRoute(selection) {
  if (selection === null || selection === undefined) return { model: '', effort: '' }
  if (typeof selection !== 'object') return { model: '', effort: '' }
  const effort = typeof selection.reasoningEffort === 'string' ? selection.reasoningEffort.trim() : ''
  return { model: shortenModel(selection.model), effort }
}

/* ------------------------------------------------------------------ *
 * The two sources
 * ------------------------------------------------------------------ */

/**
 * Read the route out of one projection snapshot, whichever shape it has.
 *
 * A resident snapshot carries its values under `values`; a list-row attachment
 * carries them directly on `projectionValues`. Both are accepted so one
 * function serves either store without the caller knowing which it holds.
 *
 * @param {any} source - A `projectionsBySession` value or a `projectionValues` object.
 * @returns {{model: string, effort: string, pending: boolean, source: string}}
 *   The display route, whether it is a queued switch, and which projection
 *   supplied it (`'selection'`, `'descriptor'`, `'inherited'`, or `'none'`).
 */
function readProjection(source) {
  const values = source?.values ?? source
  if (values === null || values === undefined) return { model: '', effort: '', pending: false, source: 'none', switchedFrom: '' }

  const selection = values[PROJECTION_KEY]
  if (selection !== null && selection !== undefined) {
    const route = readRoute(selection.next)
    // `next` is `pending ?? lastUsed`, so a disagreement with `lastUsed` is the
    // queued switch. A snapshot with no request yet (`lastUsed` null) is NOT a
    // switch: there is no earlier model to move away from.
    const lastUsed = readRoute(selection.lastUsed)
    const pending = route.model !== '' && lastUsed.model !== '' && route.model !== lastUsed.model
    // An explicit effort rides the pending route; otherwise keep the used one
    // so a queued model that has not declared an effort still shows the effort
    // currently in force.
    const effort = route.effort !== '' ? route.effort : lastUsed.effort
    return {
      model: route.model,
      effort,
      pending,
      source: 'selection',
      // The route being moved away from, named only while a switch is queued.
      // This is the only turn-accurate "the route changed here" signal the
      // client holds: no projection ships `request/header`, so the per-turn
      // history itself is not reachable from a client plugin.
      switchedFrom: pending ? lastUsed.model : '',
    }
  }

  // No selection projection at all. A child session that never made a request
  // falls here, and its durable descriptor is the only remaining evidence.
  return childRouteOf(values[IDENTITY_KEY])
}

/**
 * Read the durable route from a child's `subagent` identity projection.
 *
 * The descriptor snapshots `agentProvider` / `agentModel` /
 * `agentReasoningEffort` for a continuable child
 * (`dsh-subagent/lib/types/descriptor.js:38-45`), and deliberately omits them
 * for a one-shot child (`:37`, `:118-126`) because cold resume does not need
 * them. A one-shot child therefore has no durable explicit route: it inherited
 * its parent's, and that fact is reported rather than guessed at.
 *
 * @param {any} identity - One `subagent` projection value, or undefined.
 * @returns {{model: string, effort: string, pending: boolean, source: string}}
 *   The route with `source` named `'descriptor'` or `'inherited'`, or an empty
 *   route with `source: 'none'` when there is nothing to read.
 */
function childRouteOf(identity) {
  if (identity === null || identity === undefined || typeof identity !== 'object') {
    return { model: '', effort: '', pending: false, source: 'none', switchedFrom: '' }
  }
  const effort = typeof identity.agentReasoningEffort === 'string' ? identity.agentReasoningEffort.trim() : ''
  const model = shortenModel(identity.agentModel)
  if (model !== '') {
    return { model, effort, pending: false, source: 'descriptor', switchedFrom: '' }
  }
  // A one-shot (or a continuable whose descriptor predates the route fields)
  // inherits the parent's route, which is not recorded anywhere durable.
  return { model: '', effort, pending: false, source: identity.mode === 'one-shot' ? 'inherited' : 'none', switchedFrom: '' }
}

/* ------------------------------------------------------------------ *
 * Store lookups
 * ------------------------------------------------------------------ */

/**
 * Whether a session id is present in the resident-projection map.
 *
 * A missing session is not the same fact as a session with no model: the first
 * means "we have not looked yet", the second means "this session never made a
 * request". {@link resolveModel} keeps them apart, and falls back to the list
 * row before concluding anything.
 *
 * @param {Record<string, any>} projectionsBySession - Store map of session id to snapshot.
 * @param {string} sessionId - Session id to test.
 * @returns {boolean} True when the session has its own snapshot in the map.
 */
function isLoaded(projectionsBySession, sessionId) {
  if (projectionsBySession === null || typeof projectionsBySession !== 'object') return false
  if (typeof sessionId !== 'string' || sessionId === '') return false
  return Object.prototype.hasOwnProperty.call(projectionsBySession, sessionId)
}

/**
 * Resolve one session's route from either store.
 *
 * Prefers the resident projection, which is seq-exact and live, and falls back
 * to the list row's `projectionValues` — the source that covers a subagent
 * listed in a parent's catalog but never opened. `modelSelection` wins over the
 * durable descriptor inside a source, because a request the session actually
 * made is stronger evidence than the composition it was started with.
 *
 * @param {Record<string, any>} projectionsBySession - `state.projectionsBySession`.
 * @param {Record<string, any>} byId - `state.byId`, the list-row summaries.
 * @param {string} sessionId - Session whose route is requested.
 * @returns {{loaded: boolean, model: string, effort: string, pending: boolean, source: string}}
 *   `loaded` is false only when NEITHER store knows the session.
 */
function resolveModel(projectionsBySession, byId, sessionId) {
  // Spread the whole route rather than destructuring it: a new field added to
  // `readProjection` (such as `switchedFrom`) must reach the caller without
  // this function having to be told about it.
  if (isLoaded(projectionsBySession, sessionId)) {
    return { ...readProjection(projectionsBySession[sessionId]), loaded: true }
  }

  const row = byId === null || byId === undefined ? undefined : byId[sessionId]
  const attached = row?.projectionValues
  if (attached === null || attached === undefined) {
    return { loaded: false, model: '', effort: '', pending: false, source: 'none', switchedFrom: '' }
  }

  // The row is known to the list even though its projection store is not
  // resident, so the session IS a fact — its projections are simply attached to
  // the row rather than to a store of its own.
  return { ...readProjection(attached), loaded: true }
}

/**
 * Resolve one session's route by following parent links when it inherited its
 * route.
 *
 * A child whose descriptor records no route of its own runs its parent's
 * (`dsh-tool-subagent/README.md:67` — with `modelSelectionSettings` off, the
 * default, every child inherits). The inherited route is not recorded anywhere
 * in the child's own log, so it is recovered from the ancestor that owns it by
 * walking `parentId` up the lineage.
 *
 * The walk is bounded and cycle-safe: at most `MAX_PARENT_HOPS` levels are
 * followed, and a session id already visited is never re-entered. A chain that
 * never yields an explicit route reports `inherited` with an empty model rather
 * than inventing one.
 *
 * @param {Record<string, any>} projectionsBySession - `state.projectionsBySession`.
 * @param {Record<string, any>} byId - `state.byId`, whose rows carry `parentId`.
 * @param {string} sessionId - Session whose effective route is requested.
 * @returns {{loaded: boolean, model: string, effort: string, pending: boolean, source: string, inheritedFrom?: string}}
 *   The route, plus the ancestor id it was inherited from when that is the
 *   answer. `model` is empty when no ancestor records an explicit route either.
 */
function resolveRoute(projectionsBySession, byId, sessionId) {
  const own = resolveModel(projectionsBySession, byId, sessionId)
  // A route the session owns — selected, used, or durable in its descriptor —
  // is always the answer; nothing is inherited while one exists.
  if (own.source !== 'inherited') return own

  const visited = new Set([sessionId])
  let cursor = byId === null || byId === undefined ? undefined : byId[sessionId]
  for (let hops = 0; hops < MAX_PARENT_HOPS; hops += 1) {
    const parentId = cursor?.parentId
    if (typeof parentId !== 'string' || parentId === '' || visited.has(parentId)) break
    visited.add(parentId)
    const parent = resolveModel(projectionsBySession, byId, parentId)
    if (parent.source !== 'inherited' && parent.model !== '') {
      return { ...parent, source: 'inherited', inheritedFrom: parentId }
    }
    cursor = byId === null || byId === undefined ? undefined : byId[parentId]
  }

  // No ancestor records an explicit route either, so the honest answer is that
  // the route was inherited and is unknown from durable data.
  return { ...own, model: '', effort: own.effort }
}

/**
 * Group a session's subagents by the model each one actually runs on.
 *
 * The walk is the same one `dsh-subagent-tree` performs: the snapshot key is
 * each entry's parent, so `projectionsBySession` alone yields the tree. Every
 * descendant is resolved through {@link resolveRoute}, which is what makes a
 * child's own model (or its inherited one, followed up the lineage) the
 * grouping key rather than a guess.
 *
 * Consecutive equal models are grouped and ordered by descending count, then by
 * first appearance, so the summary reads "3× deepseek-chat, 2× deepseek-reasoner"
 * with the dominant model first and ties stable. The same grouping is repeated
 * per depth in `byDepth`, which is what answers "is the DEEPER generation the one
 * that changed model" — a question a flat total cannot.
 *
 * @param {Record<string, any>} projectionsBySession - `state.projectionsBySession`.
 * @param {Record<string, any>} byId - `state.byId`, whose rows carry `parentId`.
 * @param {string} rootId - Session whose subagents are grouped.
 * @returns {{groups: Array<{model: string, effort: string, count: number, running: number}>, total: number, distinct: number, inherited: number, running: number, byDepth: Array<{depth: number, total: number, groups: Array<{model: string, effort: string, count: number, running: number}>}>}}
 *   One entry per distinct model, the descendant total, how many distinct
 *   models appeared, how many descendants inherited their route, how many are
 *   running, and the same grouping cut by depth below the root.
 */
function summarizeSubagentModels(projectionsBySession, byId, rootId) {
  const rows = []
  const seen = new Set([rootId])
  const queue = [{ id: rootId, depth: 0 }]

  while (queue.length > 0) {
    const { id, depth } = queue.shift()
    const entries = catalogOf(projectionsBySession, id)
    if (entries === undefined) continue
    for (const entry of entries) {
      if (entry === null || typeof entry !== 'object' || seen.has(entry.id)) continue
      seen.add(entry.id)
      const route = resolveRoute(projectionsBySession, byId, entry.id)
      const running = byId?.[entry.id]?.running === true
      rows.push({ id: entry.id, depth: depth + 1, route, running })
      queue.push({ id: entry.id, depth: depth + 1 })
    }
  }

  const levels = groupRows(rows)
  const groups = levels.all

  return {
    groups,
    total: rows.length,
    distinct: groups.length,
    inherited: rows.reduce((sum, row) => sum + (row.route.source === 'inherited' ? 1 : 0), 0),
    running: rows.reduce((sum, row) => sum + (row.running ? 1 : 0), 0),
    byDepth: levels.byDepth,
  }
}

/**
 * Cut grouped rows into the whole set and one bucket per depth.
 *
 * The per-depth buckets are what answer "is the DEEPER delegation the one that
 * changed model", which the flat summary cannot: two runs can share a total and
 * differ entirely in which generation switched. Buckets are contiguous and
 * ordered by depth, and an empty depth is omitted rather than shown as zero.
 *
 * @param {Array<object>} rows - Walked descendants with `route`, `running`, `depth`.
 * @returns {{all: Array<object>, byDepth: Array<{depth: number, total: number, groups: Array<object>}>}}
 *   The flat grouping and the per-depth grouping.
 */
function groupRows(rows) {
  const buckets = new Map()
  for (const row of rows) {
    let bucket = buckets.get(row.depth)
    if (bucket === undefined) {
      bucket = []
      buckets.set(row.depth, bucket)
    }
    bucket.push(row)
  }

  const byDepth = []
  for (const depth of [...buckets.keys()].sort((left, right) => left - right)) {
    const bucket = buckets.get(depth)
    // `total` counts every descendant at this depth, including ones with no
    // readable route, so a depth where several models are unknown still says
    // how many rows it is talking about.
    byDepth.push({ depth, total: bucket.length, groups: orderGroups(bucket) })
  }

  return { all: orderGroups(rows), byDepth }
}

/**
 * Group rows by model+effort, ordered by descending count then first appearance.
 *
 * @param {Array<object>} rows - Rows carrying `route` and `running`.
 * @returns {Array<{model: string, effort: string, count: number, running: number}>} The groups.
 */
function orderGroups(rows) {
  const byKey = new Map()
  const order = []
  for (const row of rows) {
    // A session with no readable route is not a model group; dropping it keeps
    // the summary about models rather than about unresolved rows.
    if (row.route.model === '') continue
    const key = `${row.route.model}\u0000${row.route.effort}`
    let group = byKey.get(key)
    if (group === undefined) {
      group = { model: row.route.model, effort: row.route.effort, count: 0, running: 0 }
      byKey.set(key, group)
      order.push(key)
    }
    group.count += 1
    if (row.running) group.running += 1
  }

  const groups = order.map((key) => byKey.get(key))
  const rank = new Map(order.map((key, index) => [key, index]))
  groups.sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count
    return rank.get(`${left.model}\u0000${left.effort}`) - rank.get(`${right.model}\u0000${right.effort}`)
  })
  return groups
}

/**
 * One session's direct-children catalog, or undefined when it is not loaded.
 *
 * A loaded leaf is present with an empty array, which is a different fact from
 * a session that has never been touched; `dsh-subagent-tree` draws the same
 * line at `src/tree.js:40-43`.
 *
 * @param {Record<string, any>} projectionsBySession - `state.projectionsBySession`.
 * @param {string} sessionId - Parent whose catalog is requested.
 * @returns {Array<object> | undefined} The catalog entries, or undefined.
 */
function catalogOf(projectionsBySession, sessionId) {
  const entries = projectionsBySession?.[sessionId]?.values?.subagentCatalog
  return Array.isArray(entries) ? entries : undefined
}

/**
 * Render one summary line for a tooltip: "3× deepseek-chat, 2× deepseek-reasoner".
 *
 * The multiplication sign is spelled as `×` rather than `x` so the line reads
 * the same in every locale, and the effort rides in parentheses after a model
 * only when it is set.
 *
 * @param {{model: string, effort: string, count: number}} group - One group.
 * @returns {string} That group's fragment.
 */
function formatModelGroup(group) {
  const label = group.effort === '' ? group.model : `${group.model} (${group.effort})`
  return `${group.count}× ${label}`
}

/**
 * The readable model label for one projection snapshot.
 *
 * `next` wins because it already encodes the pending choice: it equals
 * `lastUsed` until a switch is queued, and is that switch after. The provider is
 * deliberately not shown — a Session has exactly one configured provider and
 * the chip is about the MODEL, which is what a user picking per-subagent models
 * chose.
 *
 * @param {any} snapshot - One `projectionsBySession` value, or undefined.
 * @returns {string} The display label, or an empty string when unknown.
 */
function modelLabelOf(snapshot) {
  return readProjection(snapshot).model
}

/**
 * Read one session's model plus whether it is loaded.
 *
 * The narrow form for a caller that already holds only the resident map. Kept
 * beside {@link resolveModel} because the Host tests exercise both shapes.
 *
 * @param {Record<string, any>} projectionsBySession - Store map of session id to snapshot.
 * @param {string} sessionId - Session whose model is requested.
 * @returns {{loaded: boolean, model: string}} Loaded state and the display label.
 */
function modelOf(projectionsBySession, sessionId) {
  if (!isLoaded(projectionsBySession, sessionId)) return { loaded: false, model: '' }
  return { loaded: true, model: readProjection(projectionsBySession[sessionId]).model }
}

/**
 * Whether a snapshot's model is a queued switch rather than the running one.
 *
 * `next` already prefers the pending selection, so a snapshot whose `next` and
 * `lastUsed` disagree is one whose user has picked a different model than the
 * last request used — the request that will consume it has not happened yet.
 *
 * A snapshot with a pending selection but no request yet (`lastUsed` null) is
 * NOT pending in this sense: there is no earlier model to switch away from, and
 * the chip would be announcing a change the user has only just made.
 *
 * @param {any} snapshot - One `projectionsBySession` value, or undefined.
 * @returns {boolean} True when a queued selection differs from the last-used route.
 */
function isPending(snapshot) {
  const values = snapshot?.values ?? snapshot
  if (values === null || values === undefined) return false
  const selection = values[PROJECTION_KEY]
  if (selection === null || selection === undefined) return false
  const next = selection.next
  const lastUsed = selection.lastUsed
  if (next === null || next === undefined) return false
  if (lastUsed === null || lastUsed === undefined) return false
  return shortenModel(next.model) !== shortenModel(lastUsed.model)
}

/**
 * The tooltip body for one session's model row.
 *
 * A missing value renders a truthful "no model yet" line rather than an empty
 * box, because the row is mounted by a loaded session whose first request has
 * not happened.
 *
 * @param {{model: string}} model - A route carrying a `model` field.
 * @param {string} unknownText - Dictionary text for a session with no model yet.
 * @returns {string} Tooltip body.
 */
function modelTooltip(model, unknownText) {
  if (!model.loaded) return unknownText
  if (model.model === '') return unknownText
  return model.model
}

export {
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
}
