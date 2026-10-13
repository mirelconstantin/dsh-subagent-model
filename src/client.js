/**
 * dsh-subagents-model — the browser half.
 *
 * Served verbatim by the Host at `/plugins/dsh-subagents-model/client.js` and
 * executed as a CLASSIC script. There is no bundler and no transpile step in
 * front of it, so this body must be valid plain script: no `import`, no
 * `export`, no JSX. The only way in is the registration below.
 *
 * WHAT IT SHOWS. The LLM model a Session runs on, in three seats. Every one of
 * them ADDS a cell; none of them replaces a shipped one:
 *
 *   1. A chip in the active Session's header, reading "model: <id>". Registered
 *      on `conversation.session.header.actions`, a `kind: "list"` slot
 *      (`dsh-client-ui-conversation/lib/client.js:18268-18271`) whose shipped
 *      occupants are the agent-preset label, the job list, the subagent catalog
 *      and the Agent Team action (`dsh-cordis-client-runner/lib/client.js:3544-3549`).
 *
 *   2. A chip in the composer dock — the bottom bar. `conversation.composer.dock`
 *      is declared at `dsh-client-ui-conversation/lib/client.js:18329-18332` and
 *      rendered in the row BELOW the composer beside the built-in ContextMeter
 *      (`:17613-17619`). It states how many subagents the run delegated to and
 *      opens a panel of the models they ran on, which is the fact the header chip
 *      cannot show once the header scrolls away. Same slot and same shape as the
 *      sibling `dsh-opencode-router` proxy chip
 *      (`plugins/dsh-opencode-router/src/client/index.ts:85-90`).
 *
 *   3. A row in every Session's hover card in the sidebar, between its relative
 *      time and its trailing status line. `sidebar.session.row.hover` is a
 *      `kind: "list"` slot declared by `dsh-client-ui-workspace/lib/client.js:4322-4325`
 *      and described at `dsh-cordis-client-runner/lib/client.js:5636-5639`; its
 *      shipped occupant is the schedule row
 *      (`dsh-client-ui-schedule/lib/client.js:6855-6861`).
 *
 * WHAT THIS PLUGIN DELIBERATELY DOES NOT DO. It no longer claims the shipped
 * `subagent-catalog` cell, so the harness's own subagent dropdown is left exactly
 * as shipped. An earlier version took that cell over at a written priority in
 * order to put a model marker beside each subagent row, and it made the subagent
 * list disappear entirely: the shipped `CatalogRows` renders no per-row slot
 * (`dsh-client-ui-subagent/lib/client.js:164-338`), so replacing the cell meant
 * reimplementing the whole navigation contract — and any mistake there took the
 * stock dropdown with it. The per-subagent breakdown now lives in the bottom-bar
 * chip instead, which needs none of that. Do not reintroduce the shadowing.
 *
 * WHERE THE VALUE COMES FROM. The `modelSelection` Session projection, which
 * `dsh-api-session-controller` already registers and wires
 * (`lib/types/model-selection-projection.js`, mounted at `lib/index.js:2114`).
 * Its view is `{ lastUsed, next }`: `lastUsed` is the route of the session's
 * last real request, `next` is the pending selection while one is queued and
 * `lastUsed` otherwise. Reading `next` therefore always answers "which model is
 * this session on" — including the moment a user has just picked a different
 * one. This is the identical read the shipped Agent Team row performs at
 * `dsh-experimental-client-ui-agent-team/lib/client.js:89`, so the number shown
 * here is the same number the harness itself already trusts.
 *
 * WHY A SUBAGENT SHOWS A MODEL AT ALL. Model selection is off by default on the
 * `subagent` tool, and when it is off every child inherits the parent's route
 * (`dsh-tool-subagent/README.md:47,67`). So a subagent whose row reads the same
 * model as its parent is the honest expected case, not a bug — and a subagent
 * with a DIFFERENT model is precisely the fact this chip exists to surface.
 *
 * HONESTY ABOUT MISSING DATA. `projectionsBySession` is populated lazily — a
 * store is created only when a session is actually opened — so a session that was
 * delegated to but never opened is absent from it and carries its values only on
 * the list row's `projectionValues`. Every read here therefore goes through
 * `catalogFor` / the `byId` fallback, which is what the shipped client reads
 * (`dsh-client-ui-subagent/lib/client.js:71, :200, :816`); reading the projection
 * map alone is what made subagents vanish from this plugin. A loaded Session that
 * has not made a request has a `modelSelection` whose `next` is `null`, which is a
 * different fact and gets its own "no model yet" line rather than a stale model.
 *
 * WHERE THE LOGIC LIVES. The pure reading functions are NOT inlined here. They
 * live in the sibling chunk `src/client.model.js`, fetched once by
 * `require.async('./client.model.js')` and handed down through props, so this
 * file and `src/model.js` (which re-exports the chunk for `node --test`) can no
 * longer drift apart. See the block above `withModel` for the mechanism.
 *
 * Model-facing behaviour: none. Nothing here registers a tool, reads or writes
 * session state, or touches a tool result. It renders what the client store
 * already holds.
 *
 * @module dsh-subagents-model/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-subagents-model',
  factory: (require) => {
    // Both specifiers are platform SEED words handed to every client bundle by
    // the web frontend's boot entry (`staticModules`, consumed at
    // dsh-client-modules/lib/client.js:548), so they resolve from the static
    // table rather than from node_modules. The seed list is exactly: react,
    // react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis,
    // @deepseek-ai/dsh-client-store, @deepseek-ai/dsh-client-ui-slots,
    // @deepseek-ai/dsh-client-ui-primitives, @deepseek-ai/dsh-client-ui-dockkit.
    const React = require('react')

    const h = React.createElement

    /**
     * Reusable primitives.
     *
     * `@deepseek-ai/dsh-client-ui-primitives` is a confirmed seed word, but a
     * plugin must still degrade rather than blank the chat header, so every use
     * below is guarded by a `typeof` check and falls back to plain markup.
     * A missing optional export therefore costs styling, never the header.
     */
    let Tag = null
    let Tooltip = null
    let IconSparkleRegular = null
    let createPortal = null
    // The dock chip's panel helpers. Same guard rule as the rest: an absent
    // primitive costs the panel's placement and dismissal, never the bar.
    let useAnchoredPosition = null
    let useDismissOnOutsidePointer = null
    /** Stand-in so the hook count stays fixed when a primitive is missing. */
    const noopAnchoredPosition = () => null
    const noopDismiss = () => undefined
    // `react-dom` is a confirmed seed word (`dsh-client-modules/lib/client.js:548`,
    // read by the web frontend's boot entry). The tree menu portals through it,
    // because a menu rendered inside the header is clipped by the conversation
    // shell's overflow instead of floating over the page the way the shipped
    // dropdown does (`dsh-client-ui-subagent/lib/client.js:563`).
    try {
      const reactDom = require('react-dom')
      if (reactDom !== null && typeof reactDom === 'object' && typeof reactDom.createPortal === 'function') {
        createPortal = reactDom.createPortal
      }
    } catch (e) {
      // A build without react-dom leaves the tree un-portalled; the trigger still
      // works and the menu draws inline.
    }
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      if (primitives !== null && typeof primitives === 'object') {
        Tag = typeof primitives.Tag === 'function' ? primitives.Tag : null
        Tooltip = typeof primitives.Tooltip === 'function' ? primitives.Tooltip : null
        IconSparkleRegular = typeof primitives.IconSparkleRegular === 'function' ? primitives.IconSparkleRegular : null
        useAnchoredPosition = typeof primitives.useAnchoredPosition === 'function' ? primitives.useAnchoredPosition : null
        useDismissOnOutsidePointer = typeof primitives.useDismissOnOutsidePointer === 'function' ? primitives.useDismissOnOutsidePointer : null
      }
    } catch (e) {
      // A build where the seed is absent must not take the header down with it.
    }

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-subagents-model'

    /**
     * The one in-flight or settled catalog load this page shares.
     *
     * Module-scoped on purpose: the catalog is Host-generation scoped
     * (`dsh-client-ui-model-selection/lib/client.js:106` — "the current
     * generation's catalog, sharing its one in-flight load"), so every chip in
     * the page reads the same value and a second render must not spend a second
     * round trip. `null` means "not asked yet"; a resolved `null` means "asked,
     * and there is nothing to show", which is what keeps a missing catalog from
     * becoming a request on every render.
     *
     * @type {Promise<Array<object> | null> | null}
     */
    let catalogPromise = null

    /**
     * The header seat.
     *
     * A `kind: "list"` slot, so a fresh `id` is added beside the shipped
     * occupants instead of replacing one
     * (`dsh-cordis-client-runner/lib/client.js:3496-3551`). The id is this
     * plugin's own: `subagent-catalog` is the cell `dsh-subagent-tree` already
     * claims at a written priority, and claiming it here would collide.
     */
    const ACTIONS_SLOT = 'conversation.session.header.actions'
    const ACTIONS_SLOT_ID = 'subagent-model'


    /**
     * The sidebar hover-card seat.
     *
     * Also a `kind: "list"` slot (`:5636-5679`), whose owner hands the occupant
     * the row's own `sessionId` — not the active session's — which is what lets
     * one component serve every row in the list.
     */
    const HOVER_SLOT = 'sidebar.session.row.hover'
    const HOVER_SLOT_ID = 'subagent-model'

    /**
     * The portal mount point, resolved lazily.
     *
     * The shipped dropdown portals to `document.body`; rendering a panel inside
     * the header or the composer instead would let the conversation shell's
     * overflow clip it.
     *
     * @returns {Element | null} The portal host, or null without a document.
     */
    function portalTarget() {
      return typeof document === 'undefined' ? null : document.body
    }

    /**
     * The priorities both entries register at.
     *
     * `conversation.session.header.actions` is a `list` slot, where the
     * registry rejects a duplicate `id` only at the SAME priority
     * (`dsh-client-ui-slots/lib/index.js:183-184`). Both ids in this file are
     * fresh, so no shipped occupant is displaced and no collision is possible;
     * the written numbers only fix the row order among this plugin's own
     * entries and are far below anything the page-local decrementing counter
     * produces (`allocatePriority: () => --this.nextPriority`, `:615`), so they
     * do not depend on how many other packages register first.
     *
     * The hover row keeps a positive order so it lands AFTER the schedule row
     * (`order: 10`, `dsh-client-ui-schedule/lib/client.js:6858`): scheduled
     * tasks are the row a user opening that card went looking for, and this one
     * is the added context.
     */
    const ACTIONS_ORDER = -40
    const HOVER_ORDER = 20

    /** Injected style tag id, kept stable so re-apply is idempotent. */
    const STYLE_TAG_ID = 'dsh-subagents-model/model.css'

    /* ------------------------------------------------------------------ *
     * Dictionaries, flattened.
     *
     * `LocaleRuntime.translate` resolves a key by BRACKET lookup against one
     * flat dictionary object — `locales?.get(localeKey(locale))?.[key]`
     * (`dsh-client-locale/lib/client.js:1429-1435`) — it never walks a nested
     * object. The on-disk `locale/*.json` files are nested for readability;
     * these are the flattened forms of exactly those files, and every key below
     * exists in en.json and ro.json.
     *
     * A missing key renders as the RAW KEY STRING (`:1425`), so a typo is
     * visible on screen rather than loud. Keep the two sets in step.
     * ------------------------------------------------------------------ */

    /** @type {Record<string, string>} */
    const en = {
      'chip.prefix': 'model',
      'chip.title': 'This session runs on {model}',
      'chip.titleWithEffort': 'This session runs on {model} at {effort} effort',
      'chip.titleInherited': 'This session inherited {model} from its parent',
      'chip.unknown': 'no model yet',
      'chip.pending': 'switching',
      'chip.inherited': 'inherited',
      'tip.summary': '{count} subagents:',
      'tip.byDepth': 'By generation:',
      'tip.depth': 'gen {depth}',
      'tip.unknownOnly': 'model unknown',
      'tip.inherited': '{count} inherited their parent model',
      'tip.running': '{count} running now',
      'tip.efforts': 'Efforts: {efforts}',
      'tip.effortDefault': '{effort} (default)',
      'row.label': 'Model',
      'row.inherited': 'Inherited from parent',
      'row.inheritedFrom': 'inherited',
      'row.title': 'The model this session last used, or is about to use',
      'row.activity': 'Work',
      'row.turns': '{count} turns',
      'row.steps': '{count} steps',
      'row.time': 'Active time',
      'row.tokens': 'Generated',
      'row.cache': 'Cache',
      'row.cacheRead': '{count} read',
      'row.cacheWrite': '{count} written',
      'row.context': 'Context window',
      'row.task': 'Task',
      'row.switch': 'Route change',
      'row.switchFrom': '{from} → {to}, not yet applied',
      'row.mode': 'Kind',
      'row.modeOneShot': 'one-shot, read-only',
      'row.modeContinuable': 'continuable',
      // The composer-dock chip, owned by the bottom-bar seat.
      'dock.subagents': '{count} subagents in this run',
      'dock.subagentsShort': 'agents',
      'dock.panelTitle': 'Models used in this run',
      'dock.figures': '{used} of {total} on an explicit route',
      'dock.barLabel': 'Share of subagents per model',
      'dock.effortDefault': 'default effort',
      'dock.runningBadge': '{count} running',
    }

    /** @type {Record<string, string>} */
    const ro = {
      'chip.prefix': 'model',
      'chip.title': 'Această sesiune folosește {model}',
      'chip.titleWithEffort': 'Această sesiune folosește {model} cu efort {effort}',
      'chip.titleInherited': 'Această sesiune a moștenit {model} de la părinte',
      'chip.unknown': 'fără model încă',
      'chip.pending': 'se schimbă',
      'chip.inherited': 'moștenit',
      'tip.summary': '{count} subagenți:',
      'tip.byDepth': 'Pe generații:',
      'tip.depth': 'gen {depth}',
      'tip.unknownOnly': 'model necunoscut',
      'tip.inherited': '{count} au moștenit modelul părintelui',
      'tip.running': '{count} în execuție acum',
      'tip.efforts': 'Eforturi: {efforts}',
      'tip.effortDefault': '{effort} (implicit)',
      'row.label': 'Model',
      'row.inherited': 'Moștenit de la părinte',
      'row.inheritedFrom': 'moștenit',
      'row.title': 'Modelul pe care această sesiune l-a folosit ultima dată sau urmează să-l folosească',
      'row.activity': 'Activitate',
      'row.turns': '{count} ture',
      'row.steps': '{count} pași',
      'row.time': 'Timp activ',
      'row.tokens': 'Generat',
      'row.cache': 'Cache provider',
      'row.cacheRead': '{count} citite',
      'row.cacheWrite': '{count} scrise',
      'row.context': 'Fereastră de context',
      'row.task': 'Cerință',
      'row.switch': 'Schimbare de rută',
      'row.switchFrom': '{from} → {to}, încă neaplicat',
      'row.mode': 'Tip',
      'row.modeOneShot': 'one-shot, doar citire',
      'row.modeContinuable': 'continuabil',
      // Per-turn route history, owned by the companion chunk
      // src/client.route-history.js, which renders these through the
      // conversation.chat.turnTail seat. They sit here so the two flattened
      // dictionaries below stay the single pair this plugin owns.
      // The composer-dock chip, owned by the bottom-bar seat.
      'dock.subagents': '{count} subagenți în această rulare',
      'dock.subagentsShort': 'agenți',
      'dock.panelTitle': 'Modele folosite în această rulare',
      'dock.figures': '{used} din {total} pe rută explicită',
      'dock.barLabel': 'Procentul de subagenți pe model',
      'dock.effortDefault': 'efort implicit',
      'dock.runningBadge': '{count} în execuție',
    }

    /**
     * Row stylesheet.
     *
     * Metrics are lifted from the shipped subagent header pill
     * (`dsh-client-ui-subagent/lib/client.js:12`) so the chip occupies a
     * similar box — same 28px minimum height, same 12px/18px type, same
     * `--dsw-radius-sm` — and only the model token is new. Colours come
     * exclusively from `--dsw-*` theme tokens. Font sizes are expressed as
     * `calc(12px + var(--dsh-content-font-delta, 0px))` so they track the
     * user's content font-size setting the way the rest of the header does.
     * The hover row reuses the shipped hover-card row metrics
     * (`dsh-client-ui-schedule/lib/client.js` row classes) so it sits flush
     * with the schedule row beside it.
     */
    const MODEL_CSS = [
      '.dsh-smr-chip{border-radius:var(--dsw-radius-sm);min-height:calc(28px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);align-items:center;gap:5px;padding:calc(3px + var(--dsh-content-font-delta,0px)) 7px;font-size:calc(12px + var(--dsh-content-font-delta,0px));line-height:calc(18px + var(--dsh-content-font-delta,0px));display:inline-flex;max-width:260px}',
      '.dsh-smr-chip:hover{color:var(--dsw-alias-label-primary)}',
      '.dsh-smr-chipPrefix{flex:none;opacity:.75}',
      '.dsh-smr-chipModel{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden;font-variant-numeric:tabular-nums}',
      '.dsh-smr-chipEffort{color:var(--dsw-alias-label-caption);white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.dsh-smr-chipPending{color:var(--dsw-alias-label-tertiary);opacity:.8}',
      '.dsh-smr-chip svg{flex:none}',
      '.dsh-smr-rows{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.dsh-smr-row{align-items:baseline;gap:8px;padding:2px 0;display:flex}',
      '.dsh-smr-rowLabel{color:var(--dsw-alias-label-caption);flex:none;font-size:calc(12px + var(--dsh-content-font-delta,0px));line-height:calc(18px + var(--dsh-content-font-delta,0px))}',
      '.dsh-smr-rowValue{color:var(--dsw-alias-label-secondary);min-width:0;font-size:calc(12px + var(--dsh-content-font-delta,0px));line-height:calc(18px + var(--dsh-content-font-delta,0px));word-break:break-word}',
      '.dsh-smr-rowValueUnknown{color:var(--dsw-alias-label-caption)}',
      '.dsh-smr-rowInherited{color:var(--dsw-alias-label-caption);flex:none;opacity:.8}',
      // shares the row with (research/context-meter-anatomy.md §"The trigger"):
      // the shell's secondary content-font tokens, tabular numerals so the count
      // does not jitter as it changes, and one hover/open rule so the control
      // looks active while its panel is open.
      // The trigger is the ContextMeter's trigger, rule for rule
      // (dsh-client-ui-conversation/lib/client.js:16923). One colour for the WHOLE
      // label — `label-tertiary` — with no per-span override, so "3" and "agents"
      // read as one piece of text at the same weight as the meter beside it. The
      // earlier `--dsw-alias-label-secondary` on the value plus an `opacity` on the
      // label made this chip look like a different kind of control sitting in a row
      // of its own kind. Hover and open share ONE rule and add the same
      // `interactive-bg-hover` pill the meter uses.
      '.dsh-smd-root{flex:none;display:inline-flex}',
      '.dsh-smd-trigger{border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);background:0 0;border:0;cursor:pointer;font-family:inherit;font-size:var(--dsh-content-font-size-secondary,13px);font-variant-numeric:tabular-nums;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;align-items:center;gap:6px;padding:1px 8px;flex:none;display:inline-flex}',
      '.dsh-smd-trigger:hover,.dsh-smd-trigger:focus-visible,.dsh-smd-trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);outline:none}',
      '.dsh-smd-trigger svg{flex:none}',
      // No colour of its own: the label rides the trigger's colour so the count and
      // the word cannot drift apart.
      '.dsh-smd-value{font-variant-numeric:tabular-nums}',
      '.dsh-smd-count{color:inherit}',
      // The panel follows the shipped menu surface and elevation tokens exactly
      // (research/context-meter-anatomy.md §"The panel"), because it is portalled
      // into the same stacking context the ContextMeter's panel uses.
      '.dsh-smd-panel{z-index:100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);width:280px;max-width:min(360px,100vw - 24px);box-shadow:var(--dsw-elevation-prominent);padding:3px;position:fixed;overflow:hidden}',
      '.dsh-smd-panel:before{content:"";z-index:-1;border-radius:inherit;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);position:absolute;inset:0}',
      '.dsh-smd-panelHead{align-items:baseline;color:var(--dsw-alias-label-tertiary);gap:8px;padding:6px 10px 3px;display:flex;font-size:calc(11px + var(--dsh-content-font-delta,0px));line-height:calc(15px + var(--dsh-content-font-delta,0px))}',
      '.dsh-smd-figures{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-weight:500;margin-left:auto}',
      // The ContextMeter's bar: a 4px rounded track, 1px gaps, children that are
      // pure width percentages. A zero-width segment is never rendered, because
      // `min-width: 2px` would otherwise draw a hairline that reads as a filled
      // slice at 0%.
      '.dsh-smd-bar{corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;gap:1px;height:4px;margin:2px 10px 10px;display:flex;overflow:hidden}',
      '.dsh-smd-segment{background:var(--dsw-alias-label-tertiary);border-radius:1px;flex:none;min-width:2px;height:100%}',
      // The busiest model takes the primary tint so the eye lands on what spent
      // the most. This is a proportion read, not a ranking, so the rest stay
      // neutral rather than becoming a colour scale.
      '.dsh-smd-segment[data-dominant=true]{background:var(--dsw-alias-label-secondary)}',
      '.dsh-smd-rows{flex-direction:column;display:flex;gap:1px;padding:0 4px;min-width:0}',
      '.dsh-smd-row{align-items:center;gap:8px;border-radius:var(--dsw-radius-sm);padding:4px 6px;display:flex}',
      '.dsh-smd-dot{flex:none;border-radius:50%;width:6px;height:6px;background:var(--dsw-alias-border-l1)}',
      '.dsh-smd-dot[data-running=true]{background:var(--dsw-alias-state-success-primary)}',
      '.dsh-smd-rowLabel{flex:auto;min-width:0}',
      '.dsh-smd-rowModel{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;min-width:0;display:block;overflow:hidden;font-size:calc(12px + var(--dsh-content-font-delta,0px));line-height:calc(17px + var(--dsh-content-font-delta,0px))}',
      '.dsh-smd-rowSub{color:var(--dsw-alias-label-caption);text-overflow:ellipsis;white-space:nowrap;min-width:0;display:block;overflow:hidden;font-size:calc(11px + var(--dsh-content-font-delta,0px));line-height:calc(15px + var(--dsh-content-font-delta,0px))}',
      '.dsh-smd-badge{color:var(--dsw-alias-state-success-primary);flex:none;font-size:calc(10px + var(--dsh-content-font-delta,0px));line-height:calc(14px + var(--dsh-content-font-delta,0px))}',
      '.dsh-smd-rowCount{color:var(--dsw-alias-label-tertiary);flex:none;font-variant-numeric:tabular-nums;font-size:calc(12px + var(--dsh-content-font-delta,0px));line-height:calc(17px + var(--dsh-content-font-delta,0px))}',
      '.dsh-smd-note{color:var(--dsw-alias-label-caption);padding:3px 10px;font-size:calc(11px + var(--dsh-content-font-delta,0px));line-height:calc(15px + var(--dsh-content-font-delta,0px))}',
    ].join('\n')

    /**
     * Inject the row stylesheet into `document.head`, idempotently.
     *
     * The guard keys on `data-plugin-css`, the same attribute the shipped
     * packages key on, so a second apply (HMR) finds the existing tag instead
     * of stacking another.
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
      tag.textContent = MODEL_CSS
      document.head.appendChild(tag)
    }

    /* ------------------------------------------------------------------ *
     * The pure reading logic lives in `src/client.model.js`.
     *
     * This file used to inline a third copy of it, on the belief that the Host
     * serves exactly one file per package. It does not: `require.async` is built
     * into the very `require` this factory receives
     * (`dsh-client-modules/lib/client.js:707-713`), a `./file.js` specifier goes
     * to `importChunk`, and the Host serves the sibling chunk
     * (`dsh-client-modules/lib/index.js:915-932`, `CLIENT_CHUNK` at `:169`).
     * Three shipped packages already ship one
     * (`@deepseek-ai/dsh-client-ui-sidebar-terminal/lib/client.terminal.js:1`).
     *
     * The chunk is loaded EAGERLY, once, by {@link withModel}: `resolveRoute`,
     * `summarizeSubagentModels`, `catalogOf` and `formatCount` are all called
     * during render, so a `React.lazy` wrapper (the shipped terminal pattern)
     * would suspend the chat header on a network round trip to draw a chip that
     * is otherwise pure arithmetic over props the render already holds.
     * ------------------------------------------------------------------ */

    /**
     * The resolved chunk, or null until {@link apply} has loaded it.
     *
     * @type {Record<string, any> | null}
     */
    let modelChunk = null

    /**
     * Subscribers told when the chunk arrives.
     *
     * A module variable alone cannot drive a re-render: the seats below read
     * `modelChunk` during render, and React only re-renders when a component's
     * own state changes. Assigning the variable therefore left every cell stuck
     * on the null render until something unrelated forced a redraw — which is
     * how the subagent dropdown could vanish from a header this plugin owns.
     * @type {Set<function(): void>}
     */
    const chunkListeners = new Set()

    /** Publish the chunk and wake every seat waiting on it. */
    function setModelChunk(loaded) {
      modelChunk = loaded
      for (const listener of chunkListeners) listener()
    }

    /**
     * Hand the chunk's exports down to a component, or render nothing.
     *
     * Every consumer here is a React component that reads these functions DURING
     * render, so a component cannot be given them until the chunk has resolved.
     * A still-unloaded chunk therefore renders null rather than throwing, which
     * is what keeps a failed fetch from taking the conversation header down.
     *
     * The wrapper subscribes to the chunk so that its arrival redraws the cell.
     * Without that subscription the seat would render its null form once and
     * then never again: the cell this plugin owns would stay blank for the rest
     * of the page's life, taking the shipped dropdown with it.
     *
     * @param {function(function(any): any): any} Component - The wrapped component.
     * @returns {function(object): any} A component that reads the chunk's exports.
     */
    function withModel(Component) {
      return function ModelProps(props) {
        const [, redraw] = React.useReducer((n) => n + 1, 0)
        React.useEffect(() => {
          if (modelChunk !== null) return undefined
          const listener = () => { redraw() }
          chunkListeners.add(listener)
          return () => { chunkListeners.delete(listener) }
        }, [])
        if (modelChunk === null) return null
        return h(Component, { ...props, m: modelChunk })
      }
    }

    /* ------------------------------------------------------------------ *
     * Components.
     * ------------------------------------------------------------------ */

    /**
     * The header chip for the ACTIVE session.
     *
     * It renders on EVERY session, including a subagent's own: when a user
     * opens a subagent, its header is the only place the harness would ever say
     * which model that isolated context actually ran on, and nothing else on
     * the page states it. The chip therefore answers "what am I looking at"
     * for whichever conversation is open, rather than only for roots.
     *
     * The reasoning effort rides beside the model when one is set
     * (`dsh-api-session-controller/lib/types/model-selection-projection.js:3-7`
     * — `reasoningEffort` is optional on the same route record), so a run on
     * `deepseek-chat` at `high` reads as such rather than hiding it. With no
     * effort set nothing is added, which keeps the chip compact for the common
     * case.
     *
     * @param {object} props - Session standard props, the bound `t`, and the chunk's exports as `m`.
     * @returns {object} React element, or null when there is nothing to show.
     */
    function ModelChip(props) {
      const { sessionId, useSessions, loadCatalog, t, m } = props

      const readSessions = asHook(useSessions)

      const projections = readSessions((state) => state.projectionsBySession)
      const byId = readSessions((state) => state.byId)

      const route = m.resolveRoute(projections, byId, sessionId)

      // THE CATALOG, fetched once for the page and read lazily. It lands in
      // state rather than a ref because the tooltip is a THUNK: a ref would be
      // invisible to React, so the chip would keep showing the un-enriched
      // bubble for as long as it stayed mounted.
      //
      // `undefined` is the sentinel for "not asked yet" and the guard below is
      // the only thing that reads it. It must NOT be `null`: a catalog that
      // failed settles to `null`, and an equality guard against the initial
      // value alone would then re-request on every commit.
      const [groups, setGroups] = React.useState(undefined)
      React.useEffect(() => {
        if (groups !== undefined || loadCatalog === null || loadCatalog === undefined) return undefined
        let live = true
        loadCatalogOnce(loadCatalog).then((loaded) => {
          if (live) setGroups(loaded)
        })
        return () => { live = false }
      }, [groups, loadCatalog])

      // The tooltip carries what the chip itself cannot: which models this
      // session actually delegated to, so a run with five subagents reads
      // "3× deepseek-chat, 2× deepseek-reasoner" instead of forcing the user to
      // open each one. Only computed for a session that HAS subagents, and only
      // when the bubble is open, so an ordinary request pays nothing.
      //
      // Memoized, and placed BEFORE the early return below rather than inside
      // the thunk: `useMemo` after a conditional return changes the hook count
      // when the session's own state flips (`route.loaded` becomes true once the
      // session loads), and a memo inside the thunk cannot run at all without
      // breaking the rules of hooks.
      const summary = (0, React.useMemo)(() => m.summarizeSubagentModels(projections, byId, sessionId), [projections, byId, sessionId])

      if (!route.loaded || route.model === '') return null

      const tooltipLabel = () => {
        const lines = []
        const headline = route.source === 'inherited'
          ? t('chip.titleInherited', { model: route.model })
          : route.effort !== ''
            ? t('chip.titleWithEffort', { model: route.model, effort: route.effort })
            : t('chip.title', { model: route.model })
        lines.push(headline)
        // What THIS model can be run at, from the live catalog. The chip states
        // the effort in force; this says which efforts exist, so a user can see
        // whether the one in use is the widest or the narrowest without opening
        // the model picker. It is a lazy state read inside an already-lazy
        // thunk: the Remote call starts on the first hover, and only when a
        // catalog has actually been fetched — `null` is the cached answer for a
        // chip whose model the catalog does not list, which is normal and silent.
        const catalogReasoning = catalogReasoningOf(groups, route.model)
        if (catalogReasoning !== null) {
          const defaultEffort = catalogReasoning.defaultEffort
          const listed = catalogReasoning.efforts
            .map((effort) => (effort.name === defaultEffort ? t('tip.effortDefault', { effort: effort.name }) : effort.name))
            .join(', ')
          lines.push(t('tip.efforts', { efforts: listed === '' ? t('tip.unknownOnly') : listed }))
        }
        if (summary.total > 0 && summary.groups.length > 0) {
          lines.push(t('tip.summary', { count: m.formatCount(summary.total) }))
          for (const group of summary.groups) lines.push(`  ${m.formatModelGroup(group)}`)
          // The per-depth cut is the integration with the sibling
          // `dsh-subagent-tree`, which already counts the same descendants: both
          // facts are about one walk, so they read in one place. It is printed
          // only when a generation actually splits the flat summary, because a
          // per-depth repeat of the same single model is pure noise.
          const deeper = summary.byDepth.filter((level) => level.depth > 1)
          const splits = deeper.some((level) => level.groups.length > 1 || level.groups[0]?.model !== summary.groups[0]?.model)
          if (splits) {
            lines.push(t('tip.byDepth'))
            for (const level of deeper) {
              const models = level.groups.map(m.formatModelGroup).join(', ')
              lines.push(`  ${t('tip.depth', { depth: m.formatCount(level.depth) })}${models === '' ? ` ${t('tip.unknownOnly')}` : `: ${models}`}`)
            }
          }
          if (summary.inherited > 0) {
            lines.push(t('tip.inherited', { count: m.formatCount(summary.inherited) }))
          }
          if (summary.running > 0) {
            lines.push(t('tip.running', { count: m.formatCount(summary.running) }))
          }
        }
        return lines.join('\n')
      }

      const modelText = h('span', { className: 'dsh-smr-chipModel' }, route.model)
      const chip = h(
        'span',
        { className: 'dsh-smr-chip' },
        IconSparkleRegular !== null ? h(IconSparkleRegular, { size: 14 }) : null,
        h('span', { className: 'dsh-smr-chipPrefix' }, `${t('chip.prefix')}:`),
        modelText,
        route.effort !== ''
          ? h('span', { className: 'dsh-smr-chipEffort' }, `(${route.effort})`)
          : null,
        // A subagent with no explicit route of its own is running the parent's,
        // which is the default for the `subagent` tool. Saying so is the
        // difference between "this is the model" and "this was never chosen
        // here", and it costs one quiet token.
        route.source === 'inherited'
          ? h('span', { className: 'dsh-smr-chipPending' }, `(${t('chip.inherited')})`)
          : route.pending === true
            ? h('span', { className: 'dsh-smr-chipPending' }, `(${t('chip.pending')})`)
            : null,
      )

      const title = route.source === 'inherited'
        ? t('chip.titleInherited', { model: route.model === '' ? t('chip.unknown') : route.model })
        : route.effort !== ''
          ? t('chip.titleWithEffort', { model: route.model, effort: route.effort })
          : t('chip.title', { model: route.model })
      const ariaLabel = title

      // The chip is a non-interactive summary: it states a fact rather than
      // opening something, so it carries no `tabIndex` and is announced through
      // the header's own label instead of as a focus stop. The tooltip label is
      // a lazy thunk, so the summary walk runs only when the bubble is actually
      // positioned and visible rather than on every header render.
      return Tooltip !== null
        ? h(Tooltip, { label: tooltipLabel, side: 'bottom', portal: true, maxWidth: 320 }, h('span', { role: 'status', 'aria-label': ariaLabel }, chip))
        : h('span', { role: 'status', 'aria-label': ariaLabel, title: tooltipLabel() }, chip)
    }

    /**
     * The hover-card row for ONE session row in the sidebar.
     *
     * The owner hands this component that row's own `sessionId`
     * (`dsh-client-ui-workspace/lib/client.js:1472` and `:1623`), so one
     * component serves every row in the list and the value shown is the hovered
     * session's, not the active one's.
     *
     * This is the seat that shows a SUBAGENT's model, including a one-shot
     * child. Two fallbacks are in play, in order:
     *
     *   1. `byId[id].projectionValues` — what covers a child listed in a
     *      parent's catalog but never opened.
     *   2. the durable `subagent` descriptor's `agentModel` — what covers a
     *      continuable child's explicit route.
     *
     * A one-shot descriptor omits the route
     * (`dsh-subagent/lib/types/descriptor.js:37,118-126`), so a one-shot child
     * whose route is not durable reads `inherited` from its parent. That is
     * reported rather than guessed at: model selection is off by default on the
     * `subagent` tool, so inherited is the expected case, not a gap.
     *
     * Renders nothing for a session neither store knows — its model is unknown,
     * not absent, and an empty row would read as a fact.
     *
     * @param {object} props - Owner `sessionId`, standard props, the bound `t`, and the chunk's exports as `m`.
     * @returns {object} React element, or null when there is nothing to show.
     */
    function ModelHoverRow(props) {
      const { sessionId, useSessions, t, m } = props

      const readSessions = asHook(useSessions)
      const projections = readSessions((state) => state.projectionsBySession)
      const byId = readSessions((state) => state.byId)

      const route = m.resolveRoute(projections, byId, sessionId)
      if (!route.loaded) return null

      // A durable-but-never-run child whose route was inherited now resolves
      // through its parent chain, so a model is shown with an inherited marker
      // rather than a bare "inherited" line. The plain inherited line survives
      // only when no ancestor records an explicit route either.
      const known = route.model !== ''
      const modelText = known
        ? (route.effort !== '' ? `${route.model} (${route.effort})` : route.model)
        : t('row.inherited')

      const rows = [
        h(
          'div',
          { className: 'dsh-smr-row', key: 'model', title: t('row.title') },
          h('span', { className: 'dsh-smr-rowLabel' }, t('row.label')),
          h('span', { className: known ? 'dsh-smr-rowValue' : 'dsh-smr-rowValue dsh-smr-rowValueUnknown' }, modelText),
          route.source === 'inherited' && known
            ? h('span', { className: 'dsh-smr-rowInherited' }, t('row.inheritedFrom'))
            : null,
        ),
      ]

      // WHAT THIS SESSION ACTUALLY DID, read from the projections the client
      // already holds for this row. `sessionStats` carries turn and step counts
      // plus LLM time and decoded tokens
      // (`dsh-session-stats/lib/types/projection.js:66`), and `subagentTiming`
      // carries a child's own accumulated active time
      // (`dsh-subagent/lib/types/projection.js:38`). Both are optional keys:
      // neither is registered in every assembly, so each row appears only when
      // its value is actually present rather than showing a zero that reads as
      // "this session did nothing".
      const values = projectionsByValues(projections, byId, sessionId, m)
      const identity = values[m.IDENTITY_KEY]
      const isSubagent = byId?.[sessionId]?.origin === 'subagent'
      const mode = identity?.mode

      const stats = values.sessionStats
      if (stats !== null && stats !== undefined && typeof stats === 'object') {
        const facts = []
        if (typeof stats.turns === 'number' && stats.turns > 0) facts.push(t('row.turns', { count: m.formatCount(stats.turns) }))
        if (typeof stats.steps === 'number' && stats.steps > 0) facts.push(t('row.steps', { count: m.formatCount(stats.steps) }))
        if (facts.length > 0) rows.push(factRow(t('row.activity'), facts.join(' · ')))
      }

      const timing = values.subagentTiming
      if (timing !== null && timing !== undefined && typeof timing === 'object' && typeof timing.settledMs === 'number' && timing.settledMs > 0) {
        rows.push(factRow(t('row.time'), formatDuration(timing.settledMs)))
      }

      if (typeof stats?.decodeTokens === 'number' && stats.decodeTokens > 0) {
        rows.push(factRow(t('row.tokens'), m.formatCount(stats.decodeTokens)))
      }

      // PROMPT-SIDE CACHE TRAFFIC, from the `tokenUsage` projection, whose view
      // is the four durable buckets
      // (`dsh-token-meter/lib/types/usage-projection.js:118` —
      // `view: state => state.totals`, schema `:30-35`). It is a different
      // counter from the `sessionStats.decodeTokens` above: those are DECODED
      // tokens, these are the prompt tokens the provider served from and wrote
      // to its cache, which is the number that explains a bill. Rendered only
      // for a bucket that actually moved — a provider that reported no cache
      // traffic has `0`, and a zero there would read as "nothing cached" rather
      // than as "never asked".
      const usage = values.tokenUsage
      if (usage !== null && usage !== undefined && typeof usage === 'object') {
        const cached = []
        if (typeof usage.cacheReadTokens === 'number' && usage.cacheReadTokens > 0) {
          cached.push(t('row.cacheRead', { count: m.formatCount(usage.cacheReadTokens) }))
        }
        if (typeof usage.cacheWriteTokens === 'number' && usage.cacheWriteTokens > 0) {
          cached.push(t('row.cacheWrite', { count: m.formatCount(usage.cacheWriteTokens) }))
        }
        if (cached.length > 0) rows.push(factRow(t('row.cache'), cached.join(' · ')))
      }

      // HOW BIG THE WINDOW THIS SESSION HAS, from the `contextPressure`
      // projection. Its view is `{contextWindow?, pressureTokens?,
      // projectedTokens?}` (`dsh-token-meter/lib/types/usage-projection.js:48-56`,
      // published at `:180-186`), and only `request/context` ever supplies the
      // denominator — so a session whose provider never reported one shows no
      // row rather than a fabricated capacity.
      const contextWindow = values.contextPressure?.contextWindow
      if (typeof contextWindow === 'number' && contextWindow > 0) {
        rows.push(factRow(t('row.context'), m.formatCount(contextWindow)))
      }

      // A route switch the session has NOT yet made. `modelSelection.next`
      // carries the queued selection and `lastUsed` the route in force
      // (`dsh-api-session-controller/lib/types/model-selection-projection.js:49`),
      // so their disagreement is the moment a user changed model and no request
      // has consumed it. That is the only turn-accurate "when did the route
      // change" signal the client holds; the per-TURN history itself is not
      // reachable here, because no projection ships `request/header` and the
      // `turnTail` seat receives only `turn` and `seq`.
      if (route.pending === true && route.switchedFrom !== '') {
        rows.push(factRow(t('row.switch'), t('row.switchFrom', { from: route.switchedFrom, to: route.model })))
      }

      // A subagent's own descriptor names what it was: its mode and the label
      // the delegating agent gave it (`dsh-subagent/lib/types/descriptor.js`),
      // which is the closest durable answer to "what was this asked to do".
      if (isSubagent && typeof identity?.label === 'string' && identity.label !== '') {
        rows.push(factRow(t('row.task'), identity.label))
      }

      // A subagent's mode decides whether it can be continued, which is the
      // single most useful thing to know before trying to message it.
      if (mode === 'one-shot' || mode === 'continuable') {
        rows.push(factRow(t('row.mode'), t(mode === 'one-shot' ? 'row.modeOneShot' : 'row.modeContinuable')))
      }

      return h('div', { className: 'dsh-smr-rows' }, rows)
    }

    /**
     * One label/value line of the hover card.
     *
     * @param {string} label - Already-translated row label.
     * @param {string} value - Already-translated row value.
     * @returns {object} A React element.
     */
    function factRow(label, value) {
      return h(
        'div',
        { className: 'dsh-smr-row' },
        h('span', { className: 'dsh-smr-rowLabel' }, label),
        h('span', { className: 'dsh-smr-rowValue' }, value),
      )
    }

    /**
     * Read one session's projection values from whichever store holds it.
     *
     * Mirrors the `source?.values ?? source` fallback of `readProjection`: a
     * resident snapshot nests them under `values`, a list-row attachment carries
     * them directly.
     *
     * @param {Record<string, any>} projectionsBySession - `state.projectionsBySession`.
     * @param {Record<string, any>} byId - `state.byId`.
     * @param {string} sessionId - Session whose values are requested.
     * @param {Record<string, any>} m - The chunk's exports.
     * @returns {Record<string, any>} The values, or an empty object.
     */
    function projectionsByValues(projectionsBySession, byId, sessionId, m) {
      if (m.isLoaded(projectionsBySession, sessionId)) {
        return projectionsBySession[sessionId]?.values ?? {}
      }
      const attached = byId?.[sessionId]?.projectionValues
      return attached ?? {}
    }

    /**
     * Render a millisecond duration compactly.
     *
     * Mirrors the shipped subagent duration formatting
     * (`dsh-client-ui-subagent/lib/client.js:844-849`) in shape — seconds,
     * minutes, hours, days — so a row reads the same as the numbers elsewhere in
     * the card.
     *
     * @param {number} ms - Elapsed milliseconds.
     * @returns {string} The rendered duration, or an empty string.
     */
    function formatDuration(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return ''
      const totalSeconds = Math.floor(ms / 1000)
      const seconds = totalSeconds % 60
      const minutes = Math.floor(totalSeconds / 60) % 60
      const hours = Math.floor(totalSeconds / 3600) % 24
      const days = Math.floor(totalSeconds / 86400)
      if (days > 0) return `${days}d ${hours}h ${minutes}m`
      if (hours > 0) return `${hours}h ${minutes}m`
      if (minutes > 0) return `${minutes}m ${seconds}s`
      return `${seconds}s`
    }


    /**
     * The composer-dock seat — the bottom bar.
     *
     * `conversation.composer.dock` is a `kind: "list"`, `scope: "session"` slot
     * declared at `dsh-client-ui-conversation/lib/client.js:18329-18332` and
     * rendered in the row BELOW the composer card beside the built-in
     * ContextMeter (`:17613-17619`). Its shipped occupants are `id: "todo"`
     * (`order: 0`) and `id: "queue"` (`order: 20`), so a fresh id with a later
     * order is added beside them and nothing is displaced. That row is the only
     * persistent bottom surface an external plugin can reach
     * (`research/router-barslot-surface.md` §1), and it is where the sibling
     * `dsh-opencode-router` puts its proxy chip
     * (`plugins/dsh-opencode-router/src/client/index.ts:85-90`), so this half
     * sits next to a control that is already shaped like the shipped ContextMeter.
     *
     * WHY A SECOND PLACE FOR THE SAME FACT. The header chip answers "which model
     * am I looking at" for the conversation open above; this one answers "which
     * models is this whole run spending, and is anything different" for the run
     * as a whole, and it is the seat that survives a scrolled-away header. It
     * stays silent — renders nothing at all — when the session has no resolved
     * route or no subagents, so a plain single-model conversation grows no extra
     * furniture in the bar.
     */
    const DOCK_SLOT = 'conversation.composer.dock'
    const DOCK_SLOT_ID = 'subagent-model-dock'
    /** After `queue` (20) so the built-in controls keep their positions. */
    const DOCK_ORDER = 40

    /**
     * The bottom-bar model readout.
     *
     * A real `<button>` with `aria-haspopup="dialog"`, a portalled panel anchored
     * ABOVE the bar, outside-pointer and Escape dismissal — the ContextMeter's
     * shape, copied deliberately, because the two share one row and an invented
     * control next to it reads as a stranger. Every use of an optional primitive
     * is guarded, so a host missing one costs the panel and never the bar.
     *
     * @param {object} props - Session standard props, the bound `t`, and the chunk's exports as `m`.
     * @returns {object} React element, or null when there is nothing to show.
     */
    function ModelDockChip(props) {
      const { sessionId, useSessions, t, m } = props

      const readSessions = asHook(useSessions)
      const projections = readSessions((state) => state.projectionsBySession)
      const byId = readSessions((state) => state.byId)

      const route = m.resolveRoute(projections, byId, sessionId)
      const summary = (0, React.useMemo)(() => m.summarizeSubagentModels(projections, byId, sessionId), [projections, byId, sessionId])

      const [open, setOpen] = React.useState(false)
      const rootRef = React.useRef(null)
      const panelRef = React.useRef(null)

      // Same dismissal contract as the ContextMeter, and for the same reason:
      // the panel is a menu, so Escape and an outside click have to close it.
      React.useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [open])

      // The panel is anchored above the bar rather than measured here: the dock
      // sits at the bottom edge of the viewport, so the only direction with room
      // is up. `useAnchoredPosition` returns null until it has measured, which is
      // why the panel renders hidden rather than at 0,0.
      //
      // Both hooks are called UNCONDITIONALLY, each falling back to a no-op when the
      // primitive is absent, so the hook count stays fixed across renders and a
      // host missing one costs the placement and dismissal — never the bar.
      const position = (useAnchoredPosition ?? noopAnchoredPosition)({
        open, anchorRef: rootRef, panelRef, side: 'top', gap: 8, margin: 12,
      });
      ;(useDismissOnOutsidePointer ?? noopDismiss)(rootRef, open, setOpen, panelRef)

      // Nothing resolved, or a conversation that never delegated: the bar is for
      // a fact this plugin has, and silence is the honest rendering of its absence.
      if (!route.loaded || route.model === '') return null
      if (summary.total === 0) return null

      const title = () => {
        const headline = route.source === 'inherited'
          ? t('chip.titleInherited', { model: route.model })
          : route.effort !== ''
            ? t('chip.titleWithEffort', { model: route.model, effort: route.effort })
            : t('chip.title', { model: route.model })
        return `${headline}\n${t('dock.subagents', { count: m.formatCount(summary.total) })}`
      }

      // The bar's face is the count of DELEGATIONS, not the parent's model: the
      // models are what the panel is for, and the count is what the user reads
      // at a glance while the header scrolls away.
      const value = m.formatCount(summary.total)

      // The trigger, wrapped in the same Tooltip the ContextMeter uses
      // (dsh-client-ui-conversation/lib/client.js:17044-17048): side `top` because
      // the dock is at the bottom edge, and `disabled` while open so the bubble
      // does not fight the panel. The label is the LAZY `title` thunk, so the
      // summary walk it performs only runs when the bubble is actually positioned.
      const button = h(
        'button',
        {
          type: 'button',
          // Open state rides `aria-expanded`, as the ContextMeter does — one
          // styling hook that assistive technology already reads, instead of a
          // second class that has to be kept in step with the boolean.
          className: 'dsh-smd-trigger',
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-label': title(),
          onClick: () => setOpen((wasOpen) => !wasOpen),
        },
        IconSparkleRegular !== null ? h(IconSparkleRegular, { size: 14 }) : null,
        h('span', { className: 'dsh-smd-value' }, value),
        h('span', { className: 'dsh-smd-count' }, t('dock.subagentsShort')),
      )

      const trigger = Tooltip !== null
        ? h(Tooltip, { label: title, side: 'top', delayMs: 200, disabled: open, maxWidth: 320 }, button)
        : button

      // `createPortal(children, container)` — the CHILDREN first, then the
      // container. This used to call `h(container, ref, props, …)`, which throws
      // the moment the panel opens; the renderer contains the error per slot
      // entry (dsh-client-ui-renderer/lib/client.js:605-625), so the failure was
      // invisible and the chip simply vanished on click. Same shape as the
      // shipped ContextMeter panel and the sibling proxy chip
      // (plugins/dsh-opencode-router/src/client/ProxyStatusChip.tsx:254).
      const panel = open && createPortal !== null
        ? createPortal(
            h(
              'div',
              {
                ref: panelRef,
                className: 'dsh-smd-panel',
                role: 'dialog',
                'aria-label': t('dock.panelTitle'),
                style: position ?? { visibility: 'hidden', left: 0, top: 0 },
              },
              // The panel body. One row per MODEL, not per model+effort: `orderGroups` splits
              // on both, which is right for the tooltip's precision but would show
              // `deepseek-reasoner` on two adjacent rows for a run that used it at
              // `high` and at the default. `rollUpByModel` collapses that and names
              // the efforts on the row instead.
              //
              // The bar and the row layout are the ContextMeter's, because that
              // panel is the one sitting in the same dock row
              // (dsh-client-ui-conversation/lib/client.js:16923): a 4px rounded
              // track, one width-percent segment per group, and a zero-width
              // segment filtered out so `min-width` cannot draw a sliver.
              h('div', { className: 'dsh-smd-panelHead' },
                h('span', null, t('dock.panelTitle')),
                h('span', { className: 'dsh-smd-figures' },
                  t('dock.figures', { used: m.formatCount(summary.total - summary.inherited - summary.unrouted), total: m.formatCount(summary.total) }),
                ),
              ),
              summary.models.length > 1
                ? h(
                    'div',
                    { className: 'dsh-smd-bar', role: 'img', 'aria-label': t('dock.barLabel') },
                    summary.models.map((entry) => h('div', {
                      key: entry.model,
                      className: 'dsh-smd-segment',
                      'data-dominant': summary.models[0].model === entry.model ? 'true' : undefined,
                      style: { width: `${(entry.count / summary.total) * 100}%` },
                    })),
                  )
                : null,
              h('div', { className: 'dsh-smd-rows' },
                summary.models.map((entry) => h(
                  'div',
                  { key: entry.model, className: 'dsh-smd-row' },
                  // A running dot rides the row, so "which model is working now"
                  // needs no cross-reference with the footnote.
                  h('span', { className: 'dsh-smd-dot', 'data-running': entry.running > 0 ? 'true' : 'false', 'aria-hidden': true }),
                  h('span', { className: 'dsh-smd-rowLabel' },
                    h('span', { className: 'dsh-smd-rowModel' }, entry.model),
                    entry.efforts.some((e) => e.effort !== '')
                      ? h('span', { className: 'dsh-smd-rowSub' },
                        entry.efforts
                          .map((e) => (e.effort === '' ? t('dock.effortDefault') : e.effort))
                          .join(' · '))
                      : null,
                  ),
                  entry.running > 0
                    ? h('span', { className: 'dsh-smd-badge' }, t('dock.runningBadge', { count: m.formatCount(entry.running) }))
                    : null,
                  h('span', { className: 'dsh-smd-rowCount' }, m.formatCount(entry.count)),
                )),
              ),
              summary.inherited > 0
                ? h('div', { className: 'dsh-smd-note' }, t('tip.inherited', { count: m.formatCount(summary.inherited) }))
                : null,
              summary.unrouted > 0
                ? h('div', { className: 'dsh-smd-note' }, t('tip.unknownOnly', { count: m.formatCount(summary.unrouted) }))
                : null,
            ),
            portalTarget(),
          )
        : null

      return h('span', { ref: rootRef, className: 'dsh-smd-root' }, trigger, panel)
    }

    /**
     * Wrap a standard-props selector hook so a missing prop cannot throw.
     *
     * Both seats' standard kits are guaranteed by their scopes
     * (`dsh-client-ui-session/lib/client.js:121-129` for the session scope;
     * `dsh-cordis-client-runner/lib/client.js:5663-5671` for the sidebar row),
     * but this half calls the hooks through a guard anyway: if a build ever
     * hands over an incomplete kit, `undefined` would otherwise be invoked as a
     * function and throw inside the header or the hover card. A missing hook
     * yields the selector's own no-data fallback (undefined) for EVERY call, so
     * hook order stays stable across renders and the row simply renders nothing.
     *
     * @param {any} hook - A selector hook passed as a standard prop.
     * @returns {function(function(any): any): any} Guarded selector.
     */
    function asHook(hook) {
      if (typeof hook !== 'function') return () => undefined
      return (selector) => hook(selector)
    }

    /** Coerce anything a service might hand back into a callable disposer. */
    function asDisposer(value) {
      if (typeof value === 'function') return value
      return () => undefined
    }

    /**
     * Park a step until its service exists, then run it once.
     *
     * Both services this half needs are now declared on `inject`, so by the time
     * `apply` runs they are provided and activated and the first `read()` below
     * returns them immediately — this is a straight call, not a wait.
     *
     * The retry remains as the fallback for a host that provides them later or not
     * at all: it reads non-strictly (see {@link whenService}), and gives up quietly
     * so a missing provider costs the seats that needed it and nothing else.
     *
     * @param {object} ctx - Client context.
     * @param {string} name - Service to obtain.
     * @param {function(any): void} use - Called once with the service.
     * @returns {void}
     */
    function whenService(ctx, name, use) {
      // `ctx.get(name)` DEFAULTS TO STRICT (`@deepseek-ai/cordis/lib/index.js:763`),
      // and the strict read returns `undefined` unless the providing fiber is fully
      // activated (`state === 2`, `:770`). A `setTimeout` poll therefore spends its
      // whole budget returning `undefined` for a service that exists and is about to
      // activate — and this plugin then registers NO seat at all: no header chip, no
      // bottom-bar chip, no hover row, with nothing on screen to say why. That was
      // the reported symptom.
      //
      // `strict = false` drops the activation gate and returns the value as soon as
      // the service is provided, which is exactly what a poller wants. The truthy
      // check below then re-verifies the value is really there.
      const read = () => {
        try {
          return typeof ctx.get === 'function' ? ctx.get(name, false) : undefined
        } catch (e) {
          return undefined
        }
      }

      const service = read()
      if (service !== null && service !== undefined) {
        use(service)
        return
      }

      // A `queueMicrotask` poll is deliberately NOT used: it re-queues itself
      // ahead of the macrotasks every package activation depends on, starves
      // the boot, and reproduces
      // `web boot: 1 entry did not activate @deepseek-ai/dsh-client-ui-subagent: failed`.
      // A macrotask yields to the event loop, letting the renderer install
      // `slots` first.
      //
      // The budget is a backstop for a boot where the provider never arrives;
      // normal provider installation lands within a few turns. It counts
      // MILLISECONDS, not turns: a zero-delay chain of `setTimeout(…, 0)` can
      // run hundreds of iterations inside a single macrotask window, long before
      // the renderer has activated, so a turn budget expires while the service is
      // merely still booting. Two seconds of real time is comfortably longer than
      // a shell boot and short enough not to leak.
      const startedAt = Date.now()
      const poll = () => {
        const later = read()
        if (later !== null && later !== undefined) {
          use(later)
          return
        }
        if (Date.now() - startedAt >= 2000) return
        setTimeout(poll, 16)
      }
      setTimeout(poll, 0)
    }

    /**
     * Fetch the Host generation's model catalog ONCE, for every chip in the page.
     *
     * `session.modelCatalog()` takes no arguments and returns a RESULT ENVELOPE,
     * not a throw (`dsh-client-ui-model-selection/lib/client.js:118-121`). The
     * cache is module-scoped rather than per-component because the catalog is
     * scoped to the Host generation, not to a session: every chip in the page
     * reads the same one, so a second chip must not spend a second round trip.
     *
     * FAILURE IS SILENT BY DESIGN. `.ok === false` and a thrown call both land on
     * the same cached `null`, so a Host without a catalog — or one mid-reload —
     * costs this chip nothing but the enrichment and never an exception. A
     * resolved `null` also caches: the catalog is Host-generation scoped, so it
     * will not change under this page.
     *
     * @param {any} loadCatalog - `() => Promise<{ok: boolean, value?: any}>`.
     * @returns {Promise<Array<object> | null>} The `groups` array, or null when
     *   the catalog is unavailable.
     */
    function loadCatalogOnce(loadCatalog) {
      if (typeof loadCatalog !== 'function') return Promise.resolve(null)
      if (catalogPromise !== null) return catalogPromise
      catalogPromise = Promise.resolve()
        .then(loadCatalog)
        .then((response) => (response !== null && response !== undefined && response.ok === true ? response.value : null))
        .then((value) => (value !== null && Array.isArray(value.groups) ? value.groups : null))
        .catch(() => null)
      return catalogPromise
    }

    /**
     * One catalog model's reasoning-effort list and default, or null.
     *
     * Reads `groups[].models[]` for an exact `id` match — the catalog's own
     * shape (`dsh-api-session-controller/lib/typert.host.js:586-602`) — and
     * keeps `reasoning.efforts[].name` with `reasoning.defaultEffort` (`:593-599`).
     * The NAME is preferred over the id because it is what the rest of the UI
     * shows; an effort declaring only an id falls back to it, and a model with
     * no `reasoning` block at all yields nothing.
     *
     * ABSENCE IS NORMAL. The catalog is advisory and may not list a model at
     * all — "Core routing accepts unlisted model ids"
     * (`dsh-llm/lib/index.js:1698-1708`) — so a miss renders nothing at all.
     * Nothing here ever suggests a model is invalid, unavailable or broken.
     *
     * @param {Array<object> | null} groups - A loaded catalog's `groups`, or null.
     * @param {string} model - The model id the session is on.
     * @returns {{efforts: Array<{id: string, name: string}>, defaultEffort: string} | null}
     *   The model's effort list, or null when the catalog does not describe it.
     */
    function catalogReasoningOf(groups, model) {
      if (!Array.isArray(groups) || typeof model !== 'string' || model === '') return null
      for (const group of groups) {
        if (group === null || typeof group !== 'object' || !Array.isArray(group.models)) continue
        for (const entry of group.models) {
          if (entry === null || typeof entry !== 'object' || entry.id !== model) continue
          const reasoning = entry.reasoning
          if (reasoning === null || reasoning === undefined || typeof reasoning !== 'object') return null
          const efforts = []
          for (const effort of Array.isArray(reasoning.efforts) ? reasoning.efforts : []) {
            const id = typeof effort?.id === 'string' ? effort.id : ''
            const name = typeof effort?.name === 'string' && effort.name !== '' ? effort.name : id
            if (name !== '') efforts.push({ id, name })
          }
          if (efforts.length === 0) return null
          // `defaultEffort` is an effort ID, so the DEFAULT ENTRY is found by id
          // and carried by NAME — the label the rest of the UI shows. Comparing
          // the raw `defaultEffort` string against a name would silently miss
          // whenever the two differ in case, which is the normal spelling.
          const wanted = typeof reasoning.defaultEffort === 'string' ? reasoning.defaultEffort : ''
          const fallback = efforts.find((effort) => effort.id === wanted)
          return { efforts, defaultEffort: fallback === undefined ? '' : fallback.name }
        }
      }
      return null
    }

    /** Client plugin body. */
    function apply(ctx) {
      // The model chunk, loaded EAGERLY and exactly once. Every consumer is a
      // React component that calls these functions during render, so the exports
      // have to be in hand before a render happens — a `React.lazy` wrapper would
      // suspend the chat header on a network round trip to draw a chip that is
      // otherwise arithmetic over props the render already holds.
      //
      // `require.async` is built into the `require` this factory was handed
      // (`dsh-client-modules/lib/client.js:707-713`); the `./` specifier is what
      // routes it to `importChunk`, which fetches `/plugins/dsh-subagents-model/
      // client.model.js` and requires that file to self-register
      // (`:717-740`) — which is why the chunk declares `chunk: 'client.model.js'`.
      //
      // A fetch that never lands must not take the header down with it, so the
      // rejection is swallowed and the chunk stays null; every seat then renders
      // nothing, and the page's other occupants keep their places.
      Promise.resolve()
        .then(() => require.async('./client.model.js'))
        .then((loaded) => { setModelChunk(loaded) })
        .catch(() => {
          setModelChunk(null)
        })

      // The chip tooltip enriches itself from the live catalog, and this is the
      // ONLY way to reach it: `remote` is a ctx service, not a seed word. Read
      // once here through `ctx.get` — a declared `inject: ['remote']` would park
      // the header chip behind the whole Remote chain, which is what the empty
      // gate at the end of this factory exists to avoid.
      let remoteService = null
      try {
        const readRemote = typeof ctx.get === 'function' ? ctx.get('remote') : undefined
        remoteService = readRemote !== null && readRemote !== undefined && typeof readRemote.session?.modelCatalog === 'function'
          ? readRemote.session
          : null
      } catch (e) {
        // A build without the Remote namespace leaves the chip exactly as it was.
      }
      const loadCatalog = remoteService === null
        ? null
        : () => remoteService.modelCatalog()

      whenService(ctx, 'locale', (locale) => {
        if (locale === null || typeof locale !== 'object') return

        // `LocaleRuntime.register` THROWS on a duplicate namespace+locale pair
        // (`dsh-client-locale/lib/client.js:1395`). A second apply under HMR
        // must therefore keep the dictionaries already there rather than tear
        // them down, so the whole registration is attempted once and a throw
        // leaves the existing entries in place.
        const registerDictionaries = () => {
          const disposers = []
          try {
            disposers.push(asDisposer(locale.register(NS, 'en', en)))
            disposers.push(asDisposer(locale.register(NS, 'ro', ro)))
          } catch (e) {
            // Duplicate apply (HMR): keep the existing dictionaries.
          }
          return () => {
            for (const dispose of disposers) {
              try {
                dispose()
              } catch (e) {
                // A disposer that throws must not block the others.
              }
            }
          }
        }
        try {
          if (typeof ctx.effect === 'function') ctx.effect(registerDictionaries, 'dsh-subagents-model: dictionaries')
          else registerDictionaries()
        } catch (e) {
          try {
            registerDictionaries()
          } catch (ignored) {
            // Effect registration is best effort.
          }
        }

        // Romanian is NOT a catalog language: `LOCALE_IDS = ["zh", "en"]`
        // (`dsh-client-locale/lib/client.js:922`), and the fallback chain walks
        // the CATALOG, not the registered dictionaries (`fallbackChain`,
        // `:1369-1386`). Registering a `ro` dictionary alone therefore never
        // resolves it. `addLanguage` is idempotent-guarded because it throws
        // when the id is already taken (`:1300`).
        try {
          if (typeof locale.addLanguage === 'function') {
            const addLanguage = () => {
              try {
                return locale.addLanguage({ id: 'ro', label: 'Română', fallback: 'en' })
              } catch (e) {
                return undefined
              }
            }
            if (typeof ctx.effect === 'function') ctx.effect(addLanguage, 'dsh-subagents-model: language')
            else addLanguage()
          }
        } catch (e) {
          // An older runtime without `addLanguage` keeps English; the chip
          // still renders, which is the point of the guard.
        }
      })

      whenService(ctx, 'slots', (slots) => {
        if (slots === null || typeof slots !== 'object') return
        if (typeof slots.inject !== 'function') return

        // The bound translator is captured from whatever locale face exists at
        // registration time; the slot entries read `t` off their props, so the
        // components themselves never need the service.
        let t = (key) => String(key)
        try {
          const localeNow = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
          const bound = localeNow !== null && typeof localeNow === 'object' && typeof localeNow.bind === 'function' ? localeNow.bind(NS) : undefined
          if (typeof bound === 'function') t = bound
        } catch (e) {
          // Keep the key fallback: a missing dictionary renders keys, never a
          // thrown header.
        }

        injectStyles()

        // `register` throws when the slot is not yet declared, which is why
        // `inject` wraps it: the callback runs once the owner has declared the
        // slot, whenever that happens.
        //
        // All three ids are FRESH, so no seat displaces a shipped occupant: the
        // header chip is added beside the subagent-catalog pill and the job
        // list, the dock chip beside the built-in todo and queue cells, and the
        // hover row beside the schedule row. Nothing here claims a shipped cell,
        // so a failure in any one of them costs that seat and no other.
        //
        // Each `register` runs SYNCHRONOUSLY inside its callback and returns
        // its disposer, so the reconciler can unwind the entry when the
        // declaration is rebuilt (`dsh-client-ui-renderer/lib/client.js:1359-1373`).
        try {
          slots.inject(ACTIONS_SLOT, () => {
            const dispose = slots.register(
              {
                name: ACTIONS_SLOT,
                id: ACTIONS_SLOT_ID,
                order: ACTIONS_ORDER,
                locale: NS,
              },
              // The catalog loader is NOT a standard prop the renderer supplies;
              // it is bound here because the Remote namespace is reachable only
              // through this plugin's own ctx.
              (chipProps) => h(withModel(ModelChip), { ...chipProps, loadCatalog }),
            )
            try {
              if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'dsh-subagents-model: header slot')
            } catch (e) {
              // The facade already binds the disposer to the calling fiber.
            }
            return dispose
          })
        } catch (e) {
          // A slot that refuses the registration must leave the shipped pills
          // intact rather than half-replacing them.
        }


        try {
          slots.inject(HOVER_SLOT, () => {
            const dispose = slots.register(
              {
                name: HOVER_SLOT,
                id: HOVER_SLOT_ID,
                order: HOVER_ORDER,
                locale: NS,
              },
              withModel(ModelHoverRow),
            )
            try {
              if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'dsh-subagents-model: hover slot')
            } catch (e) {
              // The facade already binds the disposer to the calling fiber.
            }
            return dispose
          })
        } catch (e) {
          // A slot that refuses the registration must leave the shipped
          // schedule row intact rather than half-replacing it.
        }

        // The bottom-bar chip, registered on the MAIN fiber and not under any
        // `whileServed` guard: the dock is where a stuck run is noticed, so a
        // readout that only existed while a settings page was open would be
        // absent exactly when it is needed. Same shape as the sibling
        // `dsh-opencode-router` proxy chip
        // (`plugins/dsh-opencode-router/src/client/index.ts:84-92`).
        try {
          slots.inject(DOCK_SLOT, () => {
            const dispose = slots.register(
              {
                name: DOCK_SLOT,
                id: DOCK_SLOT_ID,
                order: DOCK_ORDER,
                locale: NS,
              },
              withModel(ModelDockChip),
            )
            try {
              if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'dsh-subagents-model: dock slot')
            } catch (e) {
              // The facade already binds the disposer to the calling fiber.
            }
            return dispose
          })
        } catch (e) {
          // A host without the dock keeps its three other seats.
        }
      })
    }

    return {
      // The two services the registrations need, declared exactly as the sibling
      // `dsh-opencode-router` half declares them
      // (`plugins/dsh-opencode-router/src/client/index.ts:64`). Naming them makes
      // cordis hold this row until the renderer and the locale runtime have
      // activated, which turns a race into a guarantee — the empty-gate-plus-poll
      // shape this file used before could exhaust its budget and register nothing.
      //
      // The store hooks (`useSessions`, `useSessionStatus`) and the `sessionId`
      // prop are NOT services — the renderer passes them to every slot entry as
      // standard props — so `sessions` is deliberately absent.
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
