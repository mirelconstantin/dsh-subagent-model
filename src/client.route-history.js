/**
 * dsh-subagents-model — per-turn route history, the browser half.
 *
 * Self-registering companion chunk to `client.js`, in the same
 * `window.__ModuleLoader__.load({ id, chunk, factory })` shape the shipped
 * multi-file client package uses
 * (`dsh-client-ui-sidebar-terminal/lib/client.terminal.js:1-4`). It is a SEPARATE
 * file because `client.js` is being restructured concurrently by another agent;
 * keeping the feature here makes the change additive and conflict-free. The Host
 * serves any `client.<name>.js` chunk of a package
 * (`CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/`,
 * `dsh-client-modules/lib/index.js:169`), so no packaging change is required for
 * the file itself to be reachable.
 *
 * WHAT IT SHOWS, AND WHY IT IS NOT THE OLD "not yet applied" LINE. The plugin's
 * previous hover row said `modelSelection.next !== lastUsed` is a queued switch
 * "not yet applied" — true, but it is the only route fact the `modelSelection`
 * projection holds, so it could never say WHICH model a given turn RAN on. That
 * is a different question, and the journal already answers it: `request/header`
 * is a session event
 * (`dsh-api-session-controller/lib/client.js:166`), it streams to the browser
 * UNFILTERED, and `RemoteJournalStream.open()` publishes a full opening SNAPSHOT
 * before the live tail
 * (`dsh-api-session-controller/lib/client.js:398,426-476`). So the route of
 * every past turn of a session is already in the browser — this feature reads it
 * instead of reporting the projection's blind spot.
 *
 * HOW. A conversation Definition folds `request/header` into one Context per TURN
 * (`ctx.get('uiConversation').events.register`), publishing turn data via
 * `buildLocationData(..., scope: 'turn')` with NO `target` and NO `buildViewNode`
 * — exactly the shape the shipped schedule transcript card uses
 * (`dsh-client-ui-schedule/lib/client.js:1668-1726`). Because the opening
 * journal snapshot is folded through every registered `match`/`start`, a session
 * opened BEFORE this chunk loaded still gets its history — the backlog is free.
 *
 * The VIEW is the `conversation.chat.turnTail` list seat
 * (`kind: "list"`, `dsh-cordis-client-runner/lib/client.js:2564-2566`), whose
 * owner hands the entry exactly `{turn, seq, openFile}` and nothing about the
 * route (`dsh-client-ui-chat/lib/client.js:6580-6584`), so the entry reads its
 * own route from `turnDataSource(turn, kind)`
 * (`dsh-client-ui-chat/lib/client.js:7971-7973`) — the documented way for an
 * artifact extension to read one turn's hidden node data
 * (`dsh-client-ui-chat/README.md:70`).
 *
 * WHY NOT A NEW `conversation.chat.node` KIND. It would be safe — that seat is
 * `keyed`, so an unregistered kind falls back to the shipped JsonBlock rather
 * than throwing (`dsh-client-ui-renderer/lib/client.js:1153-1157`) — but it
 * would render inside the turn's collapsible PROCESS FOLD, because a novel kind
 * is absent from the fixed `TURN_PROCESS_INDEPENDENT_KINDS` set
 * (`dsh-client-ui-chat/lib/client.js:1518-1527,10797`). The tail is the seat that
 * stays drawn. Probe evidence: `_work/subagent-model-audit/probe-new-kind.mjs`.
 *
 * WHAT IT NEVER CLAIMS. Nothing here validates a model against a catalog: core
 * routing accepts unlisted model ids (`dsh-llm/lib/index.js:1698-1708`), so a
 * model missing from a catalog is never rendered as invalid. And an ABSENT
 * `reasoningEffort` is not "off" — `adapterDefaults?: { reasoningEffort?: true;
 * maxTokens?: true }` (`dsh-api-session-controller/lib/typert.host.js:1864-1865`)
 * means the ADAPTER supplies the default, so absence is "defaulted", reported as
 * such and never as "no effort".
 *
 * @module dsh-subagents-model/client.route-history
 */

window.__ModuleLoader__.load({
  id: 'dsh-subagents-model',
  chunk: 'client.route-history.js',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin, shared with `client.js`. */
    const NS = 'dsh-subagents-model'

    /**
     * The turn-level Definition kind.
     *
     * Unique across every registered Definition — re-registering the same `kind`
     * throws (`dsh-client-ui-conversation/lib/client.js:2654-2656`) — and this
     * string is the key `turnDataSource(turn, kind)` is addressed by.
     * @type {string}
     */
    const ROUTE_KIND = 'dsh-subagents-model-turn-route'

    /** The seat that renders the history line under each turn. @type {string} */
    const TURN_TAIL_SLOT = 'conversation.chat.turnTail'
    const TURN_TAIL_ID = 'subagent-model-route-history'
    /** After the shipped entries, so a plan/deliverable card leads the row. @type {number} */
    const TURN_TAIL_ORDER = 100

    /* ------------------------------------------------------------------ *
     * Pure helpers — the unit-testable core.
     *
     * Deliberately free of React, `ctx`, and the DOM so `scripts/unit.mjs` can
     * exercise the turn-anchoring rule without a browser. `client.js` keeps its
     * own inline copies of the projection readers for the same reason it inlines
     * `src/model.js`; these are independent, and only these are new logic.
     * ------------------------------------------------------------------ */

    /**
     * Shorten a model id the way the rest of this plugin's UI does.
     *
     * Matches `shortenModel` in `src/model.js`: only `-preview` / `-latest` are
     * dropped, because the surrounding row already implies them.
     *
     * @param {string} model - Raw model id from the header config.
     * @returns {string} The label to display, or an empty string.
     */
    function shortenModel(model) {
      if (typeof model !== 'string') return ''
      const trimmed = model.trim()
      if (trimmed === '') return ''
      return trimmed.replace(/-(preview|latest)$/i, '')
    }

    /**
     * Whether one `request/header` ANCHORS a turn, i.e. is the route the turn
     * STARTED on.
     *
     * `reason` has exactly four values
     * (`dsh-api-session-controller/lib/typert.host.js:2028-2029`):
     *
     *   - `initial` — the first request of a session. Anchors turn 1.
     *   - `resume`  — re-attaching to an existing session. Anchors: it begins the
     *     resumed turn's run.
     *   - `series`  — a new series begins, each series being a fresh epoch
     *     (`dsh-client-ui-chat/lib/client.js:9385-9388` — "Resume and explicit
     *     series starts retain a prompt card even when the system text is
     *     unchanged"). Anchors: a series start IS a turn start.
     *   - `change`  — a mid-series re-route: the user swapped model WITHOUT
     *     starting a turn. A bare `change` is NOT a turn anchor. It becomes one
     *     ONLY when `startsSeries === true`, which is the platform's own signal
     *     that the change also opens a new series and therefore a new turn.
     *
     * The shipped reader draws the same line for its prompt card: it keeps a card
     * for a `change` exactly when `startsSeries === true`
     * (`dsh-client-ui-chat/lib/client.js:9408`), and anchors on
     * `data.reason === "initial"` (`:9407`). This function applies that rule to
     * the ROUTE rather than to the prompt.
     *
     * INFERENCE, not a first-class field: the platform publishes no
     * "this started a turn" boolean, so "anchor" is derived from `reason` plus
     * `startsSeries`. A `change` that is NOT `startsSeries` updates the running
     * turn's route (see {@link routeForTurn}) rather than opening one.
     *
     * @param {{reason: string, startsSeries?: boolean}} header - One request/header payload.
     * @returns {boolean} Whether this header starts a turn's route.
     */
    function isTurnAnchor(header) {
      if (header === null || header === undefined || typeof header !== 'object') return false
      const reason = header.reason
      if (reason === 'initial' || reason === 'resume' || reason === 'series') return true
      return reason === 'change' && header.startsSeries === true
    }

    /**
     * Read one turn's route out of a folded route list.
     *
     * The folded list is in journal order, so the LAST entry is the route in
     * force when the turn closed: an anchoring header (see {@link isTurnAnchor})
     * followed by any bare `change` re-routes that landed mid-turn. A turn that
     * has opened but not yet sent anything has no entry and yields null.
     *
     * Effort is read with `adapterDefaults` taken into account: when the config
     * omits `reasoningEffort` AND `adapterDefaults.reasoningEffort === true`, the
     * adapter chose the default, which is a FACT ("defaulted") and not the same
     * fact as "no effort". When neither is present, the effort is genuinely unset
     * — but even then this feature reports `defaulted: false, effort: ''` and
     * renders nothing, rather than claiming reasoning is off.
     *
     * @param {Array<object>} routes - Folded `{reason, model, provider, effort, defaulted}` entries, journal order.
     * @returns {{model: string, provider: string, effort: string, defaulted: boolean} | null}
     *   The route in force, or null when the turn never sent a request.
     */
    function routeForTurn(routes) {
      if (!Array.isArray(routes) || routes.length === 0) return null
      const last = routes[routes.length - 1]
      if (last === null || typeof last !== 'object') return null
      const model = shortenModel(last.model)
      return {
        model,
        provider: typeof last.provider === 'string' ? last.provider : '',
        effort: typeof last.effort === 'string' ? last.effort : '',
        defaulted: last.defaulted === true,
      }
    }

    /**
     * Fold a turn's `request/header` events into its route list.
     *
     * Each entry is kept, not collapsed, because a bare mid-turn `change` must
     * be able to override the anchor for the tail while the anchor is still the
     * route the turn STARTED on. Collapsing here would lose which of the two the
     * turn began with; the caller's split is anchored-into-turn vs in-turn reroute.
     *
     * @param {Array<object>} headers - `request/header` payloads for one turn, journal order.
     * @returns {Array<object>} Folded route entries, journal order.
     */
    function foldTurnRoutes(headers) {
      const folded = []
      for (const header of Array.isArray(headers) ? headers : []) {
        if (header === null || typeof header !== 'object') continue
        const config = header.header?.config
        if (config === null || config === undefined || typeof config !== 'object') continue
        const effort = typeof config.reasoningEffort === 'string' ? config.reasoningEffort.trim() : ''
        // `adapterDefaults.reasoningEffort === true` means the ADAPTER supplied
        // the value, so the config's absence is "defaulted", not "off".
        const defaulted = effort === '' && header.header?.adapterDefaults?.reasoningEffort === true
        folded.push({
          reason: typeof header.reason === 'string' ? header.reason : '',
          anchor: isTurnAnchor(header),
          model: shortenModel(config.model),
          provider: typeof config.provider === 'string' ? config.provider : '',
          effort,
          defaulted,
        })
      }
      return folded
    }

    /**
     * Whether a folded route list shows anything worth rendering.
     *
     * A turn with no headers renders nothing at all rather than an empty line:
     * "no request was sent" is not a route fact, and an empty row in the tail
     * would read as one.
     *
     * @param {Array<object>} routes - Folded route entries.
     * @returns {boolean} Whether a line should be drawn.
     */
    function hasRoute(routes) {
      const route = routeForTurn(routes)
      return route !== null && route.model !== ''
    }

    /* ------------------------------------------------------------------ *
     * Conversation Definition — the store half.
     * ------------------------------------------------------------------ */

    /**
     * The `request/header` → turn-route Definition.
     *
     * SHAPED EXACTLY LIKE the shipped plan card Definition
     * (`dsh-client-ui-plan/lib/client.js:314-341`), which is the one shipped
     * Definition built for this purpose: it materialises a node per call and
     * returns it with `visibility: "hidden"`, so the node exists to be READ but
     * contributes no chat row. That is what `turnDataSource` needs —
     * `ChatNodeStore.turnDataSource` indexes materialised nodes by
     * `(turn, kind)` (`dsh-client-ui-chat/lib/client.js:7971-7990`) — and hidden
     * is how a node stays out of the flow, because
     * `orderedVisibleChatNodes` filters on `visibility === "visible"`
     * (`dsh-client-ui-chat/lib/client.js:7718-7720,8273-8281`). So the new kind
     * never reaches the `conversation.chat.node` dispatch at all: the flow's
     * keyed lookup is never consulted for it, and the probe's JsonBlock-fallback
     * concern does not arise.
     *
     * `target` and `buildViewNode` are declared TOGETHER, as the service requires
     * (`dsh-client-ui-conversation/lib/client.js:2688-2690`). `buildViewNode` must
     * return a node with a STABLE key or it throws (`:2440`), which is why the key
     * is derived from the context rather than from a counter.
     *
     * The match id is the TURN NUMBER, so every `request/header` of one turn
     * accumulates into one Context, and a turn that sent no request never
     * produces a node — the honest "this turn ran on nothing".
     *
     * @returns {object} The Definition to register.
     */
    function turnRouteDefinition() {
      return {
        kind: ROUTE_KIND,
        target: 'chat',
        match: (event) => {
          if (event.type === 'turn/start') {
            return { id: String(event.data.turn), role: 'start' }
          }
          if (event.type === 'request/header') {
            return { id: String(event.data.turn), role: 'update' }
          }
          return null
        },
        start: (_context, match) => {
          if (match.event.type !== 'turn/start') throw new Error(`${ROUTE_KIND} start requires turn/start`)
          return { turn: match.event.data.turn, headers: [] }
        },
        update: (context, match) => {
          if (match.event.type !== 'request/header') return context.state
          return { ...context.state, headers: [...context.state.headers, match.event.data] }
        },
        buildViewNode: (context) => {
          const start = context.start ?? context.matches[0]
          if (start === undefined || context.state === undefined) return null
          const routes = foldTurnRoutes(context.state.headers)
          if (!hasRoute(routes)) return null
          // The identity guard is the memo the shipped cards use
          // (`dsh-client-ui-schedule/lib/client.js:1718`): a replay that folds to
          // the same routes must return the PREVIOUS node, or `ChatNodeStore.upsert`
          // treats it as a change and notifies every subscriber of this turn's
          // source for nothing (`dsh-client-ui-chat/lib/client.js:8024-8035`).
          const previous = context.current?.get('chat')
          if (previous?.kind === ROUTE_KIND && sameRoutes(previous.data?.routes, routes)) {
            return previous
          }
          return {
            key: context.key,
            kind: ROUTE_KIND,
            id: context.id,
            target: 'chat',
            anchorSeq: start.event.seq,
            location: start.location,
            // HIDDEN, not visible: the node exists so the tail seat can read this
            // turn's route out of `turnDataSource`, and for no other reason. A
            // visible node of a novel kind would fall into the turn's collapsible
            // process fold (see the module header).
            visibility: 'hidden',
            data: { turn: context.state.turn, routes },
          }
        },
      }
    }

    /**
     * Structural equality over folded route lists.
     *
     * `scripts/unit.mjs` can import this directly; it is also the guard that
     * keeps a `buildLocationData` replay from churning the tail's subscribers.
     *
     * @param {Array<object>} left - Folded route entries.
     * @param {Array<object>} right - Folded route entries.
     * @returns {boolean} Whether both describe the same route history.
     */
    function sameRoutes(left, right) {
      if (!Array.isArray(left) || !Array.isArray(right)) return false
      if (left.length !== right.length) return false
      for (let index = 0; index < left.length; index += 1) {
        const a = left[index]
        const b = right[index]
        if (a === b) continue
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
        if (a.reason !== b.reason || a.anchor !== b.anchor || a.model !== b.model) return false
        if (a.provider !== b.provider || a.effort !== b.effort || a.defaulted !== b.defaulted) return false
      }
      return true
    }

    /* ------------------------------------------------------------------ *
     * The tail entry — the view half.
     * ------------------------------------------------------------------ */

    /** Injected style tag id, kept distinct from `client.js`'s own. @type {string} */
    const STYLE_TAG_ID = 'dsh-subagents-model/route-history.css'

    /**
     * Stylesheet for the history line, reusing the hover-card row metrics from
     * `client.js`'s MODEL_CSS so the two read as one register. Colours come only
     * from `--dsw-*` tokens and sizes track `--dsh-content-font-delta`.
     * @type {string}
     */
    const ROUTE_CSS = [
      '.dsh-smrh{align-items:baseline;gap:8px;padding:2px 0;display:flex;min-width:0}',
      '.dsh-smrh-label{color:var(--dsw-alias-label-caption);flex:none;font-size:calc(12px + var(--dsh-content-font-delta,0px));line-height:calc(18px + var(--dsh-content-font-delta,0px))}',
      '.dsh-smrh-value{color:var(--dsw-alias-label-secondary);min-width:0;font-size:calc(12px + var(--dsh-content-font-delta,0px));line-height:calc(18px + var(--dsh-content-font-delta,0px));word-break:break-word}',
      // A re-routed turn is accented, because "this turn switched model" is the
      // fact the line exists to surface.
      '.dsh-smrh-switched{color:var(--dsw-alias-label-primary);font-weight:500}',
    ].join('\n')

    /**
     * Inject the history stylesheet into `document.head`, idempotently.
     *
     * Guards on the same `data-plugin-css` attribute `client.js` uses, with a
     * DISTINCT id so the two tags coexist and re-applying either is a no-op.
     *
     * @returns {void}
     */
    function injectStyles() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]') !== null) return
      const tag = document.createElement('style')
      tag.setAttribute('data-plugin-css', STYLE_TAG_ID)
      try {
        tag.dataset.plugin = 'dsh-subagents-model'
        tag.dataset.pluginCss = STYLE_TAG_ID
      } catch (e) {
        // `dataset` is best effort; the attribute above is the real key.
      }
      tag.textContent = ROUTE_CSS
      document.head.appendChild(tag)
    }

    /**
     * The history line for ONE turn, rendered in the turn tail.
     *
     * The owner supplies `{turn, seq, openFile}` and no route data at all
     * (`dsh-client-ui-chat/lib/client.js:6580-6584`), which is exactly why the
     * route has to come from this plugin's own Definition. It arrives as
     * `useTurnRoutes`, the hook the renderer builds from the entry's
     * `keyedHooks.turnRoutes`
     * (`dsh-client-ui-renderer/lib/client.js:434-437`, naming at
     * `dsh-client-ui-slots/lib/index.js:7-9`): called with the turn's key, it
     * returns the folded routes for that turn.
     *
     * Returns null for a turn that sent no request, so the tail contributes
     * nothing rather than an empty line.
     *
     * @param {object} props - Owner `turn` plus the injected `useTurnRoutes`.
     * @param {string} t - Bound translator.
     * @returns {object | null} A React element, or null.
     */
    function TurnRouteLine(props, t) {
      const { turn, useTurnRoutes } = props
      const turnNumber = typeof turn === 'number' ? turn : turn?.turn
      // The missing-hook fallback is the same one `client.js` uses for its
      // standard props: render nothing rather than invoke `undefined` as a hook
      // and throw inside the tail.
      const routes = typeof useTurnRoutes === 'function' && typeof turnNumber === 'number'
        ? useTurnRoutes(String(turnNumber))
        : undefined
      const list = Array.isArray(routes) ? routes : []
      if (!hasRoute(list)) return null

      const route = routeForTurn(list)
      // A turn that RE-ROUTED mid-flight is the interesting case, and only the
      // anchor tells the two apart: exactly one `anchor: true` entry means the
      // turn ran on that route throughout, so a different tail entry is a
      // mid-turn `change` — the model it ran on at the end.
      const started = list.filter((entry) => entry?.anchor === true)
      const switched = started.length > 0 && started[0]?.model !== route.model

      const value = route.effort === ''
        ? route.model
        : `${route.model} (${route.effort})`

      return h(
        'div',
        {
          className: 'dsh-smrh',
          title: t(switched ? 'route.switchedTitle' : 'route.title', { model: route.model, from: started[0]?.model ?? route.model }),
        },
        h('span', { className: 'dsh-smrh-label' }, t('route.label')),
        h(
          'span',
          { className: switched ? 'dsh-smrh-value dsh-smrh-switched' : 'dsh-smrh-value' },
          value,
          // "defaulted" is a distinct fact from "no effort": the adapter supplied
          // the value (`adapterDefaults.reasoningEffort === true`), so the run did
          // have an effort — just not one this config named.
          route.effort === '' && route.defaulted === true
            ? h('span', { className: 'dsh-smrh-label' }, ` ${t('route.effortDefaulted')}`)
            : null,
          switched
            ? h('span', { className: 'dsh-smrh-label' }, ` ${t('route.switchedFrom', { from: started[0]?.model ?? route.model })}`)
            : null,
        ),
      )
    }

    /* ------------------------------------------------------------------ *
     * Registration.
     * ------------------------------------------------------------------ */

    /**
     * Turn one plain value into a callable disposer.
     *
     * Copied from `client.js` because a chunk cannot import its sibling: the two
     * files are separate classic scripts.
     *
     * @param {any} value - Whatever a service returned.
     * @returns {function(): void} A callable disposer.
     */
    function asDisposer(value) {
      if (typeof value === 'function') return value
      return () => undefined
    }

    /**
     * Park a step until its service exists, then run it once.
     *
     * The same `ctx.get` + macrotask-poll bridge `client.js` uses, for the same
     * reason (`inject: []`): `uiConversation` is reachable only through this
     * plugin's own ctx, and a declared `inject` would park the chunk on a service
     * whose provider sits beside it.
     *
     * @param {object} ctx - Client context.
     * @param {string} name - Service to wait for.
     * @param {function(any): void} use - Called once with the service.
     * @returns {void}
     */
    function whenService(ctx, name, use) {
      const read = () => {
        try {
          return typeof ctx.get === 'function' ? ctx.get(name) : undefined
        } catch (e) {
          return undefined
        }
      }

      const service = read()
      if (service !== null && service !== undefined) {
        use(service)
        return
      }

      let attempts = 0
      const poll = () => {
        const later = read()
        if (later !== null && later !== undefined) {
          use(later)
          return
        }
        attempts += 1
        if (attempts >= 600) return
        setTimeout(poll, 0)
      }
      setTimeout(poll, 0)
    }

    /** Client plugin body: register the turn-route Definition. */
    function apply(ctx) {
      whenService(ctx, 'uiConversation', (uiConversation) => {
        if (uiConversation === null || typeof uiConversation !== 'object') return
        if (typeof uiConversation.events?.register !== 'function') return

        // Registering the SAME kind twice throws
        // (`dsh-client-ui-conversation/lib/client.js:2654-2656`), which a second
        // apply under HMR would do. Keep the existing registration instead.
        try {
          if (typeof ctx.effect === 'function') {
            ctx.effect(() => asDisposer(uiConversation.events.register(turnRouteDefinition())), 'dsh-subagents-model: turn-route definition')
            return
          }
        } catch (e) {
          // Effect registration is best effort; fall through to the direct call.
        }
        try {
          uiConversation.events.register(turnRouteDefinition())
        } catch (e) {
          // Duplicate apply (HMR): the Definition is already registered.
        }
      })

      whenService(ctx, 'slots', (slots) => {
        if (slots === null || typeof slots !== 'object') return
        if (typeof slots.inject !== 'function') return

        let t = (key) => String(key)
        try {
          const localeNow = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
          const bound = localeNow !== null && typeof localeNow === 'object' && typeof localeNow.bind === 'function' ? localeNow.bind(NS) : undefined
          if (typeof bound === 'function') t = bound
        } catch (e) {
          // Keep the key fallback: a missing dictionary renders keys, never a throw.
        }

        injectStyles()

        // A `list` seat with a FRESH id, so this line is ADDED beside the shipped
        // plan / deliverables / schedule cards rather than replacing one.
        // `order` ascending puts it after them (`dsh-client-ui-plan/lib/client.js:655`,
        // `dsh-client-ui-deliverables/lib/client.js:2265`, and the schedule card at
        // `dsh-client-ui-schedule/lib/client.js:6812`).
        try {
          slots.inject(TURN_TAIL_SLOT, () => {
            const dispose = slots.register(
              {
                name: TURN_TAIL_SLOT,
                id: TURN_TAIL_ID,
                order: TURN_TAIL_ORDER,
                locale: NS,
                // The tail entry receives the turn's own node data through the
                // Chat target's `turnDataSource`, resolved per session. `sessions`
                // and `uiConversation` are both reached through this ctx, exactly
                // as the shipped plan cards do
                // (`dsh-client-ui-plan/lib/client.js:659-668`).
                //
                // A `keyedHooks` source is called as `source(key)` and must
                // return an OBSERVABLE — `{getSnapshot, subscribe}` — because the
                // renderer wraps it in a keyed subscription
                // (`dsh-client-ui-renderer/lib/client.js:259-265,434-437`), not a
                // value. `turnDataSource` already returns exactly that
                // (`dsh-client-ui-chat/lib/client.js:7971-7973`), so it is handed
                // straight over and the line re-renders when the turn's route
                // changes.
                //
                // The source's snapshot is the turn's materialised nodes of this
                // kind, in anchor order, WITH hidden nodes included
                // (`dsh-client-ui-chat/README.md:70`); the folded routes ride on
                // `node.data`. A session opened before this chunk loaded still
                // has them, because the opening journal snapshot is folded
                // through every registered `match`/`start`.
                inject: (sessionId) => {
                  const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
                  const ui = typeof ctx.get === 'function' ? ctx.get('uiConversation') : undefined
                  if (typeof sessions?.binding !== 'function' || typeof ui?.binding !== 'function') return {}
                  const binding = sessions.binding(sessionId)
                  if (binding === undefined) return {}
                  const chat = ui.binding(binding).target('chat')
                  return {
                    keyedHooks: {
                      turnRoutes: (turn) => chat.getSnapshot().nodes.turnDataSource(Number(turn), ROUTE_KIND),
                    },
                  }
                },
              },
              (tailProps) => TurnRouteLine(tailProps, t),
            )
            try {
              if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'dsh-subagents-model: turn route tail')
            } catch (e) {
              // The facade already binds the disposer to the calling fiber.
            }
            return dispose
          })
        } catch (e) {
          // A seat that refuses the registration leaves the shipped turn-tail
          // cards intact rather than half-replacing them.
        }
      })
    }

    return {
      // Empty gate, matching `client.js`: every service here is reached through
      // `ctx.get` in `whenService`, so declaring one would park this chunk on a
      // provider it does not own.
      inject: [],
      apply,

      /**
       * The PURE half, exported for `scripts/unit.mjs`.
       *
       * The loader ignores extra keys on the load entry, and this is the seam
       * that lets the turn-anchoring rule be tested without a browser: the same
       * "evaluate under a stub `window`, then call the factory" harness the
       * suite already uses for `client.js`'s inlined dictionaries
       * (`scripts/unit.mjs:85-114`) reads these off the returned plugin instead
       * of importing a file that has no exports.
       *
       * `client.js` exposes no such field — it has no new pure logic to test —
       * so this addition does not disturb that harness.
       */
      __pure: {
        isTurnAnchor,
        foldTurnRoutes,
        routeForTurn,
        hasRoute,
        sameRoutes,
        shortenModel,
        turnRouteDefinition,
        ROUTE_KIND,
      },
    }
  },
})
