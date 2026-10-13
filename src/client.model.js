/**
 * dsh-subagent-model — the pure model-reading logic, as a package-local chunk.
 *
 * Served verbatim by the Host beside `src/client.js` at
 * `/plugins/dsh-subagent-model/client.model.js` and executed as a CLASSIC script:
 * no bundler and no transpile step in front of it, so this body uses no `import`,
 * no `export` and no JSX. It is fetched through `require.async('./client.model.js')`
 * from the main half's factory (`dsh-client-modules/lib/client.js:707-713`), and
 * must self-register or that fetch throws (`:739`).
 *
 * WHY THIS FILE EXISTS. It is the SINGLE copy of the logic. It used to be three
 * copies — `src/model.js` for the Host tests plus an inlined twin in each of the
 * two browser files — which is what made a fix in one of them drift. `src/model.js`
 * now RE-EXPORTS from here (`scripts/unit.mjs` still imports it directly as ESM),
 * and `src/client.js` reads these same functions off the resolved chunk, so the
 * browser half and the tested suite cannot disagree about a route.
 *
 * The shape is the shipped one
 * (`@deepseek-ai/dsh-client-ui-sidebar-terminal/lib/client.terminal.js:1-6`): a
 * `var module = { exports: {} }` shim inside the factory, real assignments onto
 * `module.exports`, and a `return module.exports` at the end.
 *
 * The module header that documents the projection these functions read is
 * `src/model.js`, which this chunk's contents used to duplicate.
 *
 * @module dsh-subagent-model/client.model
 */

window.__ModuleLoader__.load({
  // The bare PACKAGE name, exactly as the shipped sibling chunks declare it
  // (`@deepseek-ai/dsh-client-ui-sidebar-terminal/lib/client.terminal.js:2`).
  // The runtime derives the module-table key itself as `chunkId(ownerId, chunk)`
  // = `${id}/${chunk}` (`dsh-client-modules/lib/client.js:476-478`, and the same
  // at `:572`), so putting the path in `id` registered this chunk under
  // `dsh-subagent-model/client.model.js/client.model.js` — a key no
  // `require.async('./client.model.js')` ever looks up. That request then
  // rejected, `apply` swallowed it, `modelChunk` stayed null, and `withModel`
  // rendered null for EVERY seat: no header chip, no bottom-bar chip, no hover
  // row, and nothing on screen to say why.
  id: 'dsh-subagent-model',
  chunk: 'client.model.js',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

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
     * @returns {string} A decimal rendering, or an empty string when the value is
     *   not a count a label can decline: negative, fractional, non-finite, or not a
     *   number at all. An empty string leaves the locale text to speak for itself
     *   rather than printing "-3 subagents".
     */
    function formatCount(count) {
      if (typeof count !== 'number' || !Number.isFinite(count)) return ''
      // A negative count is a subtraction that reached here instead of a count, and
      // a fraction is not a count either; both are rendered as nothing rather than
      // as a number inside a plural label.
      if (count < 0 || !Number.isInteger(count)) return ''
      return String(count)
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
     * Read the durable route from a child's `subagent` identity projection.
     *
     * The descriptor snapshots `agentProvider` / `agentModel` /
     * `agentReasoningEffort` for a continuable child
     * (`dsh-subagent/lib/types/descriptor.js:38-45`), and deliberately omits them
     * for a one-shot child (`:37`, `:118-126`) because cold resume does not need
     * them. So a child whose descriptor records no route of its own has no durable
     * explicit route whatever its mode, and reports `source: 'inherited'` — the
     * parent's route is the one it runs, and only the lineage can name it. Mode is
     * deliberately not part of the answer: an explicitly selected one-shot model is
     * lost with the rest of the one-shot route, and a continuable descriptor
     * written before the route fields exist is the same fact as far as the data
     * goes.
     *
     * @param {any} identity - One `subagent` projection value, or undefined.
     * @returns {{model: string, effort: string, pending: boolean, source: string}}
     *   The route with `source` named `'descriptor'` or `'inherited'`, or an empty
     *   route with `source: 'none'` when there is no descriptor to read.
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
      // No route of its own, in either mode: this child ran on its parent's route,
      // which is recorded nowhere durable, so `resolveRoute` walks `parentId` to
      // find the ancestor that does record one. A continuable descriptor predating
      // the route fields lands here too, and is treated the same way rather than
      // being told apart, because both facts — no own route, parent supplies one —
      // hold for it.
      return { model: '', effort, pending: false, source: 'inherited', switchedFrom: '' }
    }

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
     *   answer. `model` and `effort` are both empty when no ancestor records an
     *   explicit route either.
     */
    function resolveRoute(projectionsBySession, byId, sessionId) {
      const own = resolveModel(projectionsBySession, byId, sessionId)
      // A route the session owns — selected, used, or durable in its descriptor —
      // is always the answer; nothing is inherited while one exists.
      //
      // `none` is the OTHER no-own-route case, and it must walk too: a child listed
      // in its parent's catalog but never opened has no resident projection store,
      // and its list row carries no `projectionValues` either (the controller only
      // attaches them once a projection store exists), so `resolveModel` reports
      // `none` with an empty model. It ran its parent's route all the same, so
      // without the walk every such child read as "no model" — which is what left
      // the header chip and the subagent summary showing nothing for them.
      if (own.source !== 'inherited' && own.source !== 'none') return own
      if (own.model !== '') return own

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
      // the route was inherited and is unknown from durable data. The effort goes
      // with the model: a bare "(high)" naming an effort with no model beside it is
      // a claim the data does not support, since the ancestor that would have named
      // the model was never found.
      return { ...own, model: '', effort: '' }
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
        const entries = catalogFor(projectionsBySession, byId, id)
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
     * One session's direct-children catalog, read from wherever the store holds it.
     *
     * `projectionsBySession` is populated LAZILY — a store is created only when a
     * session is actually opened — so a session that was delegated to but never
     * opened has no entry there and its catalog lives only on the list row's
     * `projectionValues`. Reading the projection map alone therefore stopped every
     * walk at the first child the user had not clicked, which is what made this
     * plugin show no subagents at all on a cold run. The shipped client reads the
     * same fallback (`dsh-client-ui-subagent/lib/client.js:71, :200, :816`).
     *
     * `undefined` still means "this session's children are unknown", which is a
     * different fact from a loaded childless leaf (an empty array) and is what
     * `isKnownLeaf` keys on.
     *
     * @param {Record<string, any>} projectionsBySession - `state.projectionsBySession`.
     * @param {Record<string, any> | undefined} byId - `state.byId`, whose rows carry `projectionValues`.
     * @param {string} sessionId - Parent whose catalog is requested.
     * @returns {Array<object> | undefined} The catalog entries, or undefined.
     */
    function catalogFor(projectionsBySession, byId, sessionId) {
      const resident = catalogOf(projectionsBySession, sessionId)
      if (resident !== undefined) return resident
      const attached = byId?.[sessionId]?.projectionValues?.subagentCatalog
      return Array.isArray(attached) ? attached : undefined
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
     * the chip would be announcing a change the user has only just made. An empty
     * model on either side is not pending either — a session with no readable route
     * is not shown as moving off one.
     *
     * @param {any} snapshot - One `projectionsBySession` value, or undefined.
     * @returns {boolean} True when a queued selection differs from the last-used route.
     */
    function isPending(snapshot) {
      // The same route `readProjection` would read, so this predicate and the
      // `pending` field of the route a caller renders can never disagree about one
      // snapshot.
      return readProjection(snapshot).pending
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

    module.exports = {
      IDENTITY_KEY,
      MAX_PARENT_HOPS,
      PROJECTION_KEY,
      catalogFor,
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
    return module.exports
  },
})
