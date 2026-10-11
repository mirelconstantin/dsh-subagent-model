/**
 * dsh-subagent-model — the browser half.
 *
 * Served verbatim by the Host at `/plugins/dsh-subagent-model/client.js` and
 * executed as a CLASSIC script. There is no bundler and no transpile step in
 * front of it, so this body must be valid plain script: no `import`, no
 * `export`, no JSX. The only way in is the registration below.
 *
 * WHAT IT SHOWS. The LLM model a Session runs on, in two seats:
 *
 *   1. A chip in the active Session's header, beside the subagent-catalog pill,
 *      reading "model: <id>". Registered on `conversation.session.header.actions`,
 *      a `kind: "list"` slot (`dsh-client-ui-conversation/lib/client.js:18268-18271`)
 *      whose four shipped occupants are the agent-preset label, the job list, the
 *      subagent catalog and the Agent Team action
 *      (`dsh-cordis-client-runner/lib/client.js:3544-3549`). A fresh `id` ADDS
 *      a cell, so every shipped pill keeps its place — this deliberately does
 *      NOT reuse the `subagent-catalog` id the sibling plugin `dsh-subagent-tree`
 *      shadows, because that cell is already taken and a second claim would
 *      collide at the same priority.
 *
 *   2. A row in every Session's hover card in the sidebar, between its relative
 *      time and its trailing status line. `sidebar.session.row.hover` is a
 *      `kind: "list"` slot declared by `dsh-client-ui-workspace/lib/client.js:4322-4325`
 *      and described at `dsh-cordis-client-runner/lib/client.js:5636-5639`; its
 *      shipped occupant is the schedule row
 *      (`dsh-client-ui-schedule/lib/client.js:6855-6861`). A fresh `id` adds a
 *      second row beside it, so scheduled tasks stay visible.
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
 * HONESTY ABOUT MISSING DATA. A Session that has not been loaded is absent from
 * `projectionsBySession`, and a loaded Session that has not made a request has
 * a `modelSelection` snapshot whose `next` is `null`. Those are different
 * facts, so the hover row renders a dictionary line for "no model yet" in the
 * second case and nothing at all in the first — `src/model.js` keeps them
 * apart, and the header chip disappears rather than showing a stale model.
 *
 * Model-facing behaviour: none. Nothing here registers a tool, reads or writes
 * session state, or touches a tool result. It renders what the client store
 * already holds.
 *
 * @module dsh-subagent-model/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-subagent-model',
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
    let IconSparkleOutlineRegular = null
    let createPortal = null
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
        IconSparkleOutlineRegular =
          typeof primitives.IconSparkleOutlineRegular === 'function' ? primitives.IconSparkleOutlineRegular : null
      }
    } catch (e) {
      // A build where the seed is absent must not take the header down with it.
    }

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-subagent-model'

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
     * The cell this half takes over, and the priority that takes it.
     *
     * `subagent-catalog` is the shipped `SubagentCatalogAction`'s cell
     * (`dsh-client-ui-subagent/lib/client.js:968-974`). Reusing the id puts
     * this entry IN that cell rather than beside it, which is the only way to
     * put a marker next to each subagent: the shipped `CatalogRows` renders no
     * per-row slot (`:164-338`), so there is no extension point to add one to.
     *
     * The very low priority is both allowed and required. Entries sort ascending
     * and a `list` slot keeps only the FIRST entry per `id` cell
     * (`dsh-cordis-client-runner/lib/client.js:3496-3551`;
     * `dsh-client-ui-slots/lib/index.js:221`, `:278-293`), so this outranks the
     * shipped entry. A duplicate `id` is rejected only AT THE SAME priority
     * (`:183-184`), so the distinct number also keeps this entry from colliding
     * with ITSELF when the `slots.inject` reconciler re-runs the callback — a
     * collision observed directly by the sibling `dsh-subagent-tree`, which
     * documents the same measurement at its own `SHADOW_PRIORITY` (-9999).
     *
     * The value sits far below anything the page-local decrementing counter can
     * produce (`allocatePriority: () => --this.nextPriority`,
     * `dsh-cordis-client-runner/lib/client.js:615`), so it does not depend on how
     * many other packages register first.
     */
    const SHADOWED_CELL_ID = 'subagent-catalog'
    const SHADOW_PRIORITY = -9999

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
     * Distance kept between the trigger and the menu, and between the menu and
     * the viewport edge.
     *
     * Mirrors the shipped constant
     * (`dsh-client-ui-subagent/lib/client.js:341`, `MENU_VIEWPORT_MARGIN = 16`),
     * which the shipped `catalogMenuPosition` clamps against.
     * @type {number}
     */
    const MENU_VIEWPORT_MARGIN = 16

    /**
     * The portal mount point, resolved lazily.
     *
     * The shipped dropdown portals to `document.body`; rendering the tree inside
     * the header instead would let the conversation shell's overflow clip it.
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
    const STYLE_TAG_ID = 'dsh-subagent-model/model.css'

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
      'chip.aria': 'Session model: {model}',
      'chip.title': 'This session runs on {model}',
      'chip.titleWithEffort': 'This session runs on {model} at {effort} effort',
      'chip.titleInherited': 'This session inherited {model} from its parent',
      'chip.unknown': 'no model yet',
      'chip.pending': 'switching',
      'chip.inherited': 'inherited',
      'chip.total': '{count} in total, nested included',
      'chip.differs': 'Own model {model} — differs from the parent ({parent})',
      'chip.treeInherited': 'Inherits {model} from its parent',
      'chip.own': 'Own model {model}',
      'chip.countTotal': '{count} subagents',
      'chip.countRunning': '{count} running',
      'chip.treeAria': 'Subagent sessions',
      'chip.loading': 'Loading subagents…',
      'chip.loadError': 'Unable to load subagents',
      'chip.retry': 'Retry',
      'chip.openAside': 'Open aside',
      'chip.openAsideAria': 'Open {label} aside',
      'chip.modeOneShot': 'one-shot',
      'chip.modeContinuable': 'continuable',
      'chip.modeUnknown': 'mode unknown',
      'chip.actRunning': 'running',
      'chip.actCompleted': 'completed',
      'chip.actInactive': 'idle',
      'chip.branchExpand': 'Expand {label}',
      'chip.branchCollapse': 'Collapse {label}',
      'tip.summary': '{count} subagents:',
      'tip.byDepth': 'By generation:',
      'tip.depth': 'gen {depth}',
      'tip.unknownOnly': 'model unknown',
      'tip.inherited': '{count} inherited their parent model',
      'tip.running': '{count} running now',
      'row.label': 'Model',
      'row.unknown': 'No model yet',
      'row.inherited': 'Inherited from parent',
      'row.inheritedFrom': 'inherited',
      'row.title': 'The model this session last used, or is about to use',
      'row.activity': 'Work',
      'row.turns': '{count} turns',
      'row.steps': '{count} steps',
      'row.time': 'Active time',
      'row.tokens': 'Generated',
      'row.task': 'Task',
      'row.switch': 'Route change',
      'row.switchFrom': '{from} → {to}, not yet applied',
      'row.mode': 'Kind',
      'row.modeOneShot': 'one-shot, read-only',
      'row.modeContinuable': 'continuable',
    }

    /** @type {Record<string, string>} */
    const ro = {
      'chip.prefix': 'model',
      'chip.aria': 'Modelul sesiunii: {model}',
      'chip.title': 'Această sesiune folosește {model}',
      'chip.titleWithEffort': 'Această sesiune folosește {model} cu efort {effort}',
      'chip.titleInherited': 'Această sesiune a moștenit {model} de la părinte',
      'chip.unknown': 'fără model încă',
      'chip.pending': 'se schimbă',
      'chip.inherited': 'moștenit',
      'chip.total': '{count} în total, inclusiv cei imbricați',
      'chip.differs': 'Model propriu {model} — diferit de al părintelui ({parent})',
      'chip.treeInherited': 'Moștenește {model} de la părinte',
      'chip.own': 'Model propriu {model}',
      'chip.countTotal': '{count} subagenți',
      'chip.countRunning': '{count} în execuție',
      'chip.treeAria': 'Sesiuni subagent',
      'chip.loading': 'Se încarcă subagenții…',
      'chip.loadError': 'Nu se pot încărca subagenții',
      'chip.retry': 'Reîncearcă',
      'chip.openAside': 'În lateral',
      'chip.openAsideAria': 'Deschide {label} în lateral',
      'chip.modeOneShot': 'one-shot',
      'chip.modeContinuable': 'continuabil',
      'chip.modeUnknown': 'tip necunoscut',
      'chip.actRunning': 'în execuție',
      'chip.actCompleted': 'finalizat',
      'chip.actInactive': 'inactiv',
      'chip.branchExpand': 'Extinde {label}',
      'chip.branchCollapse': 'Restrânge {label}',
      'tip.summary': '{count} subagenți:',
      'tip.byDepth': 'Pe generații:',
      'tip.depth': 'gen {depth}',
      'tip.unknownOnly': 'model necunoscut',
      'tip.inherited': '{count} au moștenit modelul părintelui',
      'tip.running': '{count} în execuție acum',
      'row.label': 'Model',
      'row.unknown': 'Niciun model încă',
      'row.inherited': 'Moștenit de la părinte',
      'row.inheritedFrom': 'moștenit',
      'row.title': 'Modelul pe care această sesiune l-a folosit ultima dată sau urmează să-l folosească',
      'row.activity': 'Activitate',
      'row.turns': '{count} ture',
      'row.steps': '{count} pași',
      'row.time': 'Timp activ',
      'row.tokens': 'Generat',
      'row.task': 'Cerință',
      'row.switch': 'Schimbare de rută',
      'row.switchFrom': '{from} → {to}, încă neaplicat',
      'row.mode': 'Tip',
      'row.modeOneShot': 'one-shot, doar citire',
      'row.modeContinuable': 'continuabil',
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
      // Tree metrics lifted from the shipped SubagentHeaderLineage stylesheet
      // (dsh-client-ui-subagent/lib/client.js:12) so the replaced dropdown keeps
      // the shipped geometry: same radii, same menu width, same shadow token.
      '.dsh-smt-root{align-items:center;gap:10px;min-width:0;display:inline-flex;position:relative}',
      '.dsh-smt-trigger{border-radius:var(--dsw-radius-sm);min-height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;align-items:center;gap:4px;padding:3px 2px;font-size:12px;line-height:18px;display:inline-flex;font-family:inherit}',
      '.dsh-smt-trigger:hover,.dsh-smt-trigger:focus-visible{color:var(--dsw-alias-label-primary)}',
      '.dsh-smt-count{font-variant-numeric:tabular-nums}',
      '.dsh-smt-chevron{transition:transform .12s}',
      '.dsh-smt-triggerOpen .dsh-smt-chevron{transform:rotate(180deg)}',
      '.dsh-smt-menu{z-index:100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:336px;max-width:min(400px,100vw - 32px);max-height:min(560px,100vh - 140px);box-shadow:var(--dsw-elevation-prominent);flex-direction:column;padding:3px;display:flex;position:fixed;overflow:hidden}',
      '.dsh-smt-menu:before{content:"";z-index:-1;border-radius:inherit;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);position:absolute;inset:0}',
      '.dsh-smt-menuBody{flex-direction:column;flex:auto;min-height:0;display:flex;overflow-y:auto;padding:2px}',
      '.dsh-smt-node{min-width:0}',
      '.dsh-smt-row{align-items:center;gap:6px;border-radius:var(--dsw-radius-sm);padding:4px 6px;cursor:pointer;min-width:0;color:var(--dsw-alias-label-primary);display:flex}',
      '.dsh-smt-row:hover,.dsh-smt-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}',
      '.dsh-smt-clickarea{flex:1;min-width:0}',
      '.dsh-smt-content{min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.dsh-smt-label{text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px;overflow:hidden}',
      '.dsh-smt-currentLabel{font-weight:500}',
      '.dsh-smt-summary{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:14px;overflow:hidden}',
      '.dsh-smt-activitySlot{width:14px;height:14px;flex:none;border-radius:50%;background:var(--dsw-alias-label-tertiary);opacity:.55}',
      '.dsh-smt-disclosure{border:0;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0;width:12px;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:14px;line-height:1;transition:transform .12s}',
      '.dsh-smt-disclosureOpen{transform:rotate(90deg)}',
      '.dsh-smt-disclosureSpace{width:12px;flex:none;display:inline-block}',
      '.dsh-smt-children{border-inline-start:1px solid var(--dsw-alias-border-l2);margin-inline-start:11px;padding-inline-start:4px}',
      '.dsh-smt-sidebarButton{border:0;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;flex:none;padding:2px 4px;font-size:11px;font-family:inherit}',
      '.dsh-smt-sidebarButton:hover{color:var(--dsw-alias-label-primary)}',
      '.dsh-smt-notice,.dsh-smt-error{color:var(--dsw-alias-label-tertiary);padding:6px;font-size:12px}',
      '.dsh-smt-error{align-items:center;gap:8px;display:flex;color:var(--dsw-alias-label-danger)}',
      '.dsh-smt-refresh{border:0;background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;text-decoration:underline;padding:0;font-family:inherit}',
      // The route marker: quiet when the child merely inherited its parent's
      // model, accented when it carries a DIFFERENT one of its own.
      '.dsh-smt-model{border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);text-overflow:ellipsis;white-space:nowrap;flex:none;max-width:132px;overflow:hidden;padding:1px 5px;font-size:11px;line-height:15px}',
      '.dsh-smt-modelDiffers{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);font-weight:500}',
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
        tag.dataset.plugin = 'dsh-subagent-model'
        tag.dataset.pluginCss = STYLE_TAG_ID
      } catch (e) {
        // `dataset` is best effort; the attribute above is the real key.
      }
      tag.textContent = MODEL_CSS
      document.head.appendChild(tag)
    }

    /* ------------------------------------------------------------------ *
     * Pure reading logic — inlined copies of `src/model.js`.
     *
     * Behaviourally identical to that module; see its header for the projection
     * they read. The shared module remains the tested source of truth for the
     * Host suite; these copies exist only because a classic script cannot
     * `import` and the Host serves exactly one file per package
     * (`dsh-client-modules/lib/index.js:169` — `CLIENT_CHUNK =
     * /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/`, so a sibling file is not
     * reachable at runtime).
     * ------------------------------------------------------------------ */

    /**
     * Shorten a model id to a compact label.
     *
     * Mirrors `shortenModel` in `src/model.js`: only the `-preview` /
     * `-latest` suffixes are dropped, because the row the user is already
     * reading implies them. A truncated id the user cannot map back to the
     * model they chose would be worse than a long one.
     *
     * @param {string} model - Raw model id from the projection.
     * @returns {string} The label to display, or an empty string.
     */
    function shortenModel(model) {
      if (typeof model !== 'string') return ''
      const trimmed = model.trim()
      if (trimmed === '') return ''
      return trimmed.replace(/-(preview|latest)$/i, '')
    }

    /** Projection keys, inlined so the two files cannot drift. @type {string} */
    const PROJECTION_KEY = 'modelSelection'
    const IDENTITY_KEY = 'subagent'
    /** Bounded parent walk for an inherited route. @type {number} */
    const MAX_PARENT_HOPS = 16

    /**
     * Read one `{ model, reasoningEffort }` pair, tolerating a missing value.
     *
     * Mirrors `readRoute` in `src/model.js`.
     *
     * @param {any} selection - A `modelSelection` route record.
     * @returns {{model: string, effort: string}} Both fields, empty when unset.
     */
    function readRoute(selection) {
      if (selection === null || selection === undefined || typeof selection !== 'object') {
        return { model: '', effort: '' }
      }
      const effort = typeof selection.reasoningEffort === 'string' ? selection.reasoningEffort.trim() : ''
      return { model: shortenModel(selection.model), effort }
    }

    /**
     * Read the durable route from a child's `subagent` identity projection.
     *
     * Mirrors `childRouteOf` in `src/model.js`. A continuable descriptor
     * snapshots `agentProvider` / `agentModel` / `agentReasoningEffort`
     * (`dsh-subagent/lib/types/descriptor.js:38-45`); a one-shot descriptor
     * omits the route entirely (`:37`, `:118-126`), so a one-shot child's
     * explicit model is not durable and is reported as inherited rather than
     * guessed at.
     *
     * @param {any} identity - One `subagent` projection value, or undefined.
     * @returns {{model: string, effort: string, pending: boolean, source: string}} The route.
     */
    function childRouteOf(identity) {
      if (identity === null || identity === undefined || typeof identity !== 'object') {
        return { model: '', effort: '', pending: false, source: 'none', switchedFrom: '' }
      }
      const effort = typeof identity.agentReasoningEffort === 'string' ? identity.agentReasoningEffort.trim() : ''
      const model = shortenModel(identity.agentModel)
      if (model !== '') return { model, effort, pending: false, source: 'descriptor', switchedFrom: '' }
      return { model: '', effort, pending: false, source: identity.mode === 'one-shot' ? 'inherited' : 'none', switchedFrom: '' }
    }

    /**
     * Read the route out of one snapshot, whichever shape it has.
     *
     * Mirrors `readProjection` in `src/model.js`. A resident snapshot carries
     * its values under `values`; a list-row attachment carries them directly on
     * `projectionValues`, so `source?.values ?? source` serves both stores
     * without the caller knowing which one it holds.
     *
     * @param {any} source - A `projectionsBySession` value or a `projectionValues` object.
     * @returns {{model: string, effort: string, pending: boolean, source: string}} The route.
     */
    function readProjection(source) {
      const values = source?.values ?? source
      if (values === null || values === undefined) return { model: '', effort: '', pending: false, source: 'none', switchedFrom: '' }
      const selection = values[PROJECTION_KEY]
      if (selection !== null && selection !== undefined) {
        const route = readRoute(selection.next)
        const lastUsed = readRoute(selection.lastUsed)
        const pending = route.model !== '' && lastUsed.model !== '' && route.model !== lastUsed.model
        // An explicit effort rides the pending route; otherwise keep the used
        // one so a queued model that has not declared an effort still shows the
        // effort currently in force.
        const effort = route.effort !== '' ? route.effort : lastUsed.effort
        return { model: route.model, effort, pending, source: 'selection', switchedFrom: pending ? lastUsed.model : '' }
      }
      // No selection projection at all: a child that never made a request falls
      // here, and its durable descriptor is the only remaining evidence.
      return childRouteOf(values[IDENTITY_KEY])
    }

    /**
     * Whether a session id is present in the loaded-projection map.
     *
     * Mirrors `isLoaded` in `src/model.js`: absent means "not looked at yet",
     * which is not the same fact as "no model".
     *
     * @param {Record<string, any>} projectionsBySession - Store map.
     * @param {string} sessionId - Session id to test.
     * @returns {boolean} Whether the session has its own snapshot.
     */
    function isLoaded(projectionsBySession, sessionId) {
      if (projectionsBySession === null || typeof projectionsBySession !== 'object') return false
      if (typeof sessionId !== 'string' || sessionId === '') return false
      return Object.prototype.hasOwnProperty.call(projectionsBySession, sessionId)
    }

    /**
     * Whether a snapshot's model is a queued switch rather than the running one.
     *
     * Mirrors `isPending` in `src/model.js`: `next` already prefers the pending
     * selection, so `next.model !== lastUsed.model` means the user has picked a
     * different model than the last request used. A snapshot with no request at
     * all (`lastUsed` null) is NOT pending — there is no earlier model to switch
     * away from.
     *
     * @param {any} snapshot - One `projectionsBySession` value, or undefined.
     * @returns {boolean} Whether the queued selection differs from the last-used route.
     */
    function isPending(snapshot) {
      const values = snapshot?.values ?? snapshot
      if (values === null || values === undefined) return false
      const selection = values[PROJECTION_KEY]
      if (selection === null || selection === undefined) return false
      if (selection.next === null || selection.next === undefined) return false
      if (selection.lastUsed === null || selection.lastUsed === undefined) return false
      return shortenModel(selection.next.model) !== shortenModel(selection.lastUsed.model)
    }

    /**
     * Resolve one session's route from EITHER store.
     *
     * Mirrors `resolveModel` in `src/model.js`, and is the whole reason a
     * subagent now shows a model. `projectionsBySession` only holds sessions
     * whose projection store is RESIDENT in the client
     * (`dsh-api-session-controller/lib/client.js:2525` `projectionStore()`), so
     * a subagent the user never opened is absent from it — which is exactly what
     * made the chip appear on ordinary conversations and nowhere else.
     *
     * The list rows carry the same values under `byId[id].projectionValues`
     * (`:2942`, `:3521`, `:3549`), and their rows are synthesized from the
     * parent's `subagentCatalog` projection (`:3518-3542`) — so that is the
     * source covering a listed-but-never-opened child.
     *
     * @param {Record<string, any>} projectionsBySession - `state.projectionsBySession`.
     * @param {Record<string, any>} byId - `state.byId`.
     * @param {string} sessionId - Session whose route is requested.
     * @returns {{loaded: boolean, model: string, effort: string, pending: boolean, source: string}} The route.
     */
    function resolveModel(projectionsBySession, byId, sessionId) {
      if (isLoaded(projectionsBySession, sessionId)) {
        const route = readProjection(projectionsBySession[sessionId])
        return { ...route, loaded: true }
      }
      const attached = byId?.[sessionId]?.projectionValues
      if (attached === null || attached === undefined) {
        return { loaded: false, model: '', effort: '', pending: false, source: 'none', switchedFrom: '' }
      }
      // The row is known to the list even though its projection store is not
      // resident, so the session IS a fact — its projections are simply
      // attached to the row rather than to a store of its own.
      const route = readProjection(attached)
      return { ...route, loaded: true }
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
     * @param {object} props - Session standard props plus the bound `t`.
     * @returns {object} React element, or null when there is nothing to show.
     */
    function ModelChip(props) {
      const { sessionId, useSessions, t } = props

      const readSessions = asHook(useSessions)

      const projections = readSessions((state) => state.projectionsBySession)
      const byId = readSessions((state) => state.byId)

      const route = resolveRoute(projections, byId, sessionId)
      if (!route.loaded || route.model === '') return null

      // The tooltip carries what the chip itself cannot: which models this
      // session actually delegated to, so a run with five subagents reads
      // "3× deepseek-chat, 2× deepseek-reasoner" instead of forcing the user to
      // open each one. Only computed for a session that HAS subagents, and only
      // when the bubble is open, so an ordinary request pays nothing.
      const tooltipLabel = () => {
        const lines = []
        const headline = route.source === 'inherited'
          ? t('chip.titleInherited', { model: route.model })
          : route.effort !== ''
            ? t('chip.titleWithEffort', { model: route.model, effort: route.effort })
            : t('chip.title', { model: route.model })
        lines.push(headline)
        const summary = summarizeSubagentModels(projections, byId, sessionId)
        if (summary.total > 0 && summary.groups.length > 0) {
          lines.push(t('tip.summary', { count: formatCount(summary.total) }))
          for (const group of summary.groups) lines.push(`  ${formatModelGroup(group)}`)
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
              const models = level.groups.map(formatModelGroup).join(', ')
              lines.push(`  ${t('tip.depth', { depth: formatCount(level.depth) })}${models === '' ? ` ${t('tip.unknownOnly')}` : `: ${models}`}`)
            }
          }
          if (summary.inherited > 0) {
            lines.push(t('tip.inherited', { count: formatCount(summary.inherited) }))
          }
          if (summary.running > 0) {
            lines.push(t('tip.running', { count: formatCount(summary.running) }))
          }
        }
        return lines.join('\n')
      }

      const modelText = h('span', { className: 'dsh-smr-chipModel' }, route.model)
      const chip = h(
        'span',
        { className: 'dsh-smr-chip' },
        IconSparkleOutlineRegular !== null ? h(IconSparkleOutlineRegular, { size: 14 }) : null,
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
     * @param {object} props - Owner `sessionId`, standard props, and the bound `t`.
     * @returns {object} React element, or null when there is nothing to show.
     */
    function ModelHoverRow(props) {
      const { sessionId, useSessions, t } = props

      const readSessions = asHook(useSessions)
      const projections = readSessions((state) => state.projectionsBySession)
      const byId = readSessions((state) => state.byId)

      const route = resolveRoute(projections, byId, sessionId)
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
      const values = projectionsByValues(projections, byId, sessionId)
      const identity = values[IDENTITY_KEY]
      const isSubagent = byId?.[sessionId]?.origin === 'subagent'
      const mode = identity?.mode

      const stats = values.sessionStats
      if (stats !== null && stats !== undefined && typeof stats === 'object') {
        const facts = []
        if (typeof stats.turns === 'number' && stats.turns > 0) facts.push(t('row.turns', { count: formatCount(stats.turns) }))
        if (typeof stats.steps === 'number' && stats.steps > 0) facts.push(t('row.steps', { count: formatCount(stats.steps) }))
        if (facts.length > 0) rows.push(factRow(t('row.activity'), facts.join(' · ')))
      }

      const timing = values.subagentTiming
      if (timing !== null && timing !== undefined && typeof timing === 'object' && typeof timing.settledMs === 'number' && timing.settledMs > 0) {
        rows.push(factRow(t('row.time'), formatDuration(timing.settledMs)))
      }

      if (typeof stats?.decodeTokens === 'number' && stats.decodeTokens > 0) {
        rows.push(factRow(t('row.tokens'), formatCount(stats.decodeTokens)))
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
     * @returns {Record<string, any>} The values, or an empty object.
     */
    function projectionsByValues(projectionsBySession, byId, sessionId) {
      if (isLoaded(projectionsBySession, sessionId)) {
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
     * Resolve one session's route by following parent links when it inherited it.
     *
     * Mirrors `resolveRoute` in `src/model.js`. A child whose descriptor records
     * no route of its own runs its parent's
     * (`dsh-tool-subagent/README.md:67` — with `modelSelectionSettings` off, the
     * default, every child inherits). That route is not in the child's own log,
     * so it is recovered by walking `parentId` up the lineage, which is what
     * makes an opened subagent's header say which model it actually ran on
     * rather than nothing at all.
     *
     * The walk is bounded and cycle-safe, and reports `inherited` with the
     * ancestor id rather than presenting the parent's route as the child's own
     * choice.
     *
     * @param {Record<string, any>} projectionsBySession - `state.projectionsBySession`.
     * @param {Record<string, any>} byId - `state.byId`, whose rows carry `parentId`.
     * @param {string} sessionId - Session whose effective route is requested.
     * @returns {{loaded: boolean, model: string, effort: string, pending: boolean, source: string, inheritedFrom?: string}} The route.
     */
    function resolveRoute(projectionsBySession, byId, sessionId) {
      const own = resolveModel(projectionsBySession, byId, sessionId)
      // A route the session owns — selected, used, or durable in its descriptor
      // — is always the answer; nothing is inherited while one exists.
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
      // No ancestor records an explicit route either, so the honest answer is
      // that the route was inherited and is unknown from durable data.
      return { ...own, model: '', effort: own.effort }
    }

    /**
     * Format a count for display inside a locale-owned label.
     *
     * @param {number} count - The count to render.
     * @returns {string} A decimal rendering, or an empty string when not finite.
     */
    function formatCount(count) {
      if (typeof count !== 'number' || !Number.isFinite(count)) return ''
      return String(Math.trunc(count))
    }

    /**
     * One session's direct-children catalog, or undefined when not loaded.
     *
     * Mirrors `catalogOf` in `src/model.js`. A loaded leaf is present with an
     * EMPTY array, which is a different fact from a session that has never been
     * touched — `dsh-subagent-tree` draws the same line at `src/tree.js:40-43`.
     *
     * @param {Record<string, any>} projectionsBySession - Store map.
     * @param {string} sessionId - Parent whose catalog is requested.
     * @returns {Array<object> | undefined} The entries, or undefined.
     */
    function catalogOf(projectionsBySession, sessionId) {
      const entries = projectionsBySession?.[sessionId]?.values?.subagentCatalog
      return Array.isArray(entries) ? entries : undefined
    }

    /**
     * Render one summary fragment: "3× deepseek-chat (high)".
     *
     * Mirrors `formatModelGroup` in `src/model.js`. The multiplication sign is
     * spelled `×` so the fragment reads the same in every locale.
     *
     * @param {{model: string, effort: string, count: number}} group - One group.
     * @returns {string} The fragment.
     */
    function formatModelGroup(group) {
      const label = group.effort === '' ? group.model : `${group.model} (${group.effort})`
      return `${group.count}× ${label}`
    }

    /**
     * Group one session's subagents by the model each actually runs on.
     *
     * Mirrors `summarizeSubagentModels` in `src/model.js`: a breadth-first walk
     * of `subagentCatalog` (the snapshot key is each entry's parent, exactly as
     * the shipped component walks it at
     * `dsh-client-ui-subagent/lib/client.js:624`), resolving every descendant
     * through `resolveRoute` so a child's own — or inherited — model is the
     * grouping key. Groups are ordered by descending count, then first
     * appearance, so the dominant model leads and ties stay stable.
     *
     * @param {Record<string, any>} projectionsBySession - `state.projectionsBySession`.
     * @param {Record<string, any>} byId - `state.byId`.
     * @param {string} rootId - Session whose subagents are grouped.
     * @returns {{groups: Array<object>, total: number, distinct: number, inherited: number, running: number}} The summary.
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

      return {
        groups: levels.all,
        total: rows.length,
        distinct: levels.all.length,
        inherited: rows.reduce((sum, row) => sum + (row.route.source === 'inherited' ? 1 : 0), 0),
        running: rows.reduce((sum, row) => sum + (row.running ? 1 : 0), 0),
        byDepth: levels.byDepth,
      }
    }

    /**
     * Cut grouped rows into the whole set and one bucket per depth.
     *
     * Mirrors `groupRows` in `src/model.js`. The per-depth buckets answer "is the
     * DEEPER delegation the one that changed model", which a flat total cannot:
     * two runs can share a total and differ entirely in which generation
     * switched. An empty depth is omitted rather than shown as zero, and each
     * bucket's `total` counts every descendant at that depth — including ones
     * with no readable route — so a depth where several models are unknown still
     * says how many rows it is talking about.
     *
     * @param {Array<object>} rows - Walked descendants with `route`, `running`, `depth`.
     * @returns {{all: Array<object>, byDepth: Array<object>}} The flat and per-depth groupings.
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
        byDepth.push({ depth, total: bucket.length, groups: orderGroups(bucket) })
      }

      return { all: orderGroups(rows), byDepth }
    }

    /**
     * Group rows by model+effort, ordered by descending count then first appearance.
     *
     * Mirrors `orderGroups` in `src/model.js`. A row with no readable model is
     * not a group, which keeps the summary about models rather than unresolved
     * rows.
     *
     * @param {Array<object>} rows - Rows carrying `route` and `running`.
     * @returns {Array<object>} The groups.
     */
    function orderGroups(rows) {
      const byKey = new Map()
      const order = []
      for (const row of rows) {
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
     * One model's marker inside a tree row.
     *
     * The point is to see AT A GLANCE which subagent is different, so the
     * inherited case gets no marker at all: with model selection off (the
     * `subagent` default, `dsh-tool-subagent/README.md:47`) every child inherits
     * its parent's route, so marking each one would mark all of them and say
     * nothing. A marker therefore appears only for a subagent whose route is
     * its OWN — and the tooltip states plainly whether that differs from the
     * parent's, which is the case a user is actually looking for.
     *
     * @param {{route: object, parentModel: string}} entry - The row's resolved route and its parent's model.
     * @param {string} id - Child session id, for the row key.
     * @param {string} t - Bound translator.
     * @returns {object | null} The marker, or null when there is nothing to mark.
     */
    function routeMarker(entry, id, t) {
      const { route, parentModel } = entry
      if (route.model === '') return null

      const own = route.source !== 'inherited'
      const differs = own && parentModel !== '' && route.model !== parentModel
      if (!own && !differs) return null

      const title = differs
        ? t('chip.differs', { model: route.model, parent: parentModel })
        : route.source === 'inherited'
          ? t('chip.treeInherited', { model: route.model })
          : t('chip.own', { model: route.model })

      const badge = h(
        'span',
        { className: differs ? 'dsh-smt-model dsh-smt-modelDiffers' : 'dsh-smt-model dsh-smt-modelInherited' },
        route.model,
      )

      return Tooltip !== null
        ? h(Tooltip, { label: title, side: 'bottom', portal: true, maxWidth: 240 }, h('span', { key: id }, badge))
        : h('span', { key: id, className: 'dsh-smt-model', title }, badge)
    }

    /**
     * One level of the tree, recursing only through explicitly expanded rows.
     *
     * Mirrors the shipped `CatalogRows` (`dsh-client-ui-subagent/lib/client.js:164`)
     * — including its disclosure triangle, activity dot, token and duration
     * metrics, sidebar button, error row and refresh — with one addition per
     * row: the route marker from {@link routeMarker}.
     *
     * @param {object} props - The recursion's own props.
     * @returns {object} A React fragment holding this level's rows.
     */
    function SubagentTreeRows(props) {
      const {
        parentSessionId, currentSessionId, catalogs, summaries, expanded, level,
        projections, byId, openChild, openChildAside, refreshProjection, toggleBranch, t,
      } = props

      const catalog = catalogs[parentSessionId]
      if (catalog === undefined) return null

      const emptyLoading = catalog.state === 'loading' && catalog.entries.length === 0
      const reserveDisclosure = catalog.entries.some((entry) => !isKnownLeaf(catalogs[entry.id]))

      return h(
        React.Fragment,
        null,
        emptyLoading ? h('div', { className: 'dsh-smt-notice' }, t('chip.loading')) : null,
        catalog.state === 'error'
          ? h(
              'div',
              { className: 'dsh-smt-error' },
              h('span', null, catalog.error?.message ?? t('chip.loadError')),
              h(
                'button',
                { type: 'button', className: 'dsh-smt-refresh', onClick: () => refreshProjection(parentSessionId) },
                t('chip.retry'),
              ),
            )
          : null,
        catalog.entries.map((entry) => {
          const childCatalog = catalogs[entry.id]
          const isCurrent = entry.id === currentSessionId
          const isExpanded = expanded.has(entry.id)
          const knownLeaf = isKnownLeaf(childCatalog)
          const summary = summaries[entry.id]
          const label = entry.label ?? entry.id
          const mode = entry.mode === 'unknown' ? t('chip.modeUnknown') : entry.mode === 'one-shot' ? t('chip.modeOneShot') : t('chip.modeContinuable')
          const completed = entry.activity === 'inactive' && summary?.projectionValues?.subagentTiming?.lastTurnCompleted === true
          const activity = entry.activity === 'running' ? t('chip.actRunning') : completed ? t('chip.actCompleted') : t('chip.actInactive')
          const secondary = [summary?.title, mode, activity].filter((value) => value !== undefined).join(' · ')

          const route = resolveRoute(projections, byId, entry.id)
          const parentRoute = resolveRoute(projections, byId, parentSessionId)
          const marker = routeMarker({ route, parentModel: parentRoute.model }, entry.id, t)

          const open = () => {
            openChild({ parentSessionId, childSessionId: entry.id, mode: entry.mode })
            props.closeCatalog()
          }
          const openAside = (event) => {
            event.preventDefault()
            event.stopPropagation()
            openChildAside({ parentSessionId, childSessionId: entry.id, mode: entry.mode })
          }
          const handleKey = (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              open()
            } else if ((event.key === 'ArrowRight' && !knownLeaf && !isExpanded) || (event.key === 'ArrowLeft' && isExpanded)) {
              event.preventDefault()
              event.stopPropagation()
              toggleBranch(entry.id)
            }
          }
          const toggle = (event) => {
            event.preventDefault()
            event.stopPropagation()
            toggleBranch(entry.id)
          }

          return h(
            'div',
            { key: entry.id, className: 'dsh-smt-node' },
            h(
              'div',
              {
                role: 'treeitem',
                tabIndex: 0,
                'aria-level': level,
                'aria-current': isCurrent || undefined,
                'aria-label': [label, secondary].filter((value) => value !== '').join(' '),
                ...(knownLeaf ? {} : { 'aria-expanded': isExpanded }),
                className: 'dsh-smt-row',
                onClick: open,
                onKeyDown: handleKey,
              },
              knownLeaf
                ? reserveDisclosure ? h('span', { className: 'dsh-smt-disclosureSpace' }) : null
                : h(
                    'button',
                    {
                      type: 'button',
                      tabIndex: -1,
                      className: isExpanded ? 'dsh-smt-disclosure dsh-smt-disclosureOpen' : 'dsh-smt-disclosure',
                      'aria-label': t(isExpanded ? 'chip.branchCollapse' : 'chip.branchExpand', { label }),
                      onClick: toggle,
                    },
                    '›',
                  ),
              h('span', { className: 'dsh-smt-activitySlot' }),
              h(
                'div',
                { className: 'dsh-smt-clickarea' },
                h(
                  'span',
                  { className: 'dsh-smt-content' },
                  h(
                    'span',
                    { className: isCurrent ? 'dsh-smt-label dsh-smt-currentLabel' : 'dsh-smt-label' },
                    label,
                  ),
                  h('span', { className: 'dsh-smt-summary' }, secondary),
                ),
              ),
              marker,
              !isCurrent && Tooltip !== null
                ? h(
                    Tooltip,
                    { label: t('chip.openAside'), side: 'bottom', align: 'end' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-smt-sidebarButton',
                        'aria-label': t('chip.openAsideAria', { label }),
                        onClick: openAside,
                        onKeyDown: (event) => {
                          if (event.key === 'Enter' || event.key === ' ') openAside(event)
                        },
                      },
                      t('chip.openAside'),
                    ),
                  )
                : null,
            ),
            isExpanded && !knownLeaf
              ? h('div', { className: 'dsh-smt-children' }, h(SubagentTreeRows, {
                  ...props,
                  parentSessionId: entry.id,
                  level: level + 1,
                }))
              : null,
          )
        }),
      )
    }

    /**
     * Whether a child is a known leaf.
     *
     * Mirrors the shipped `isKnownLeaf` (`dsh-client-ui-subagent/lib/client.js:160`):
     * a child becomes a leaf only once its OWN catalog has loaded and is empty,
     * which is what makes the disclosure triangle honest rather than optimistic.
     *
     * @param {any} catalog - The child's catalog entry.
     * @returns {boolean} Whether the child definitively has no children.
     */
    function isKnownLeaf(catalog) {
      return catalog?.state === 'ready' && catalog.entries.length === 0
    }

    /**
     * The trigger-plus-tree dropdown that replaces the shipped catalog pill.
     *
     * This half claims the `subagent-catalog` CELL of
     * `conversation.session.header.actions`, so the shipped `SubagentCatalogAction`
     * stays registered but is no longer rendered
     * (`dsh-cordis-client-runner/lib/client.js:3547` lists it as an occupant).
     * The replacement exists for one reason the shipped component cannot serve:
     * its rows carry no model, and there is no extension point per row — the
     * shipped `CatalogRows` is internal to
     * `@deepseek-ai/dsh-client-ui-subagent` and renders no slot
     * (`:164-338`), so a marker beside a subagent requires owning the cell.
     *
     * @param {object} props - Session standard props plus the catalog actions and translator.
     * @returns {object} React element, or null on a session with no subagents.
     */
    function SubagentModelTree(props) {
      const { sessionId, useSessions, useSessionStatus, openChild, openChildAside, refreshProjection, t } = props

      const readSessions = asHook(useSessions)
      const readStatus = asHook(useSessionStatus)

      const projections = readSessions((state) => state.projectionsBySession)
      const byId = readSessions((state) => state.byId)
      // The shipped rows read a summary row for the child's title and completed
      // flag (`dsh-client-ui-subagent/lib/client.js:197,200`); the list rows ARE
      // that source, so `byId` serves both the route lookup and the row metadata.
      const summaries = byId
      const statusMap = readStatus((value) => value)
      const isChild = readSessions((state) => state.byId[sessionId]?.origin === 'subagent')

      const catalogs = (0, React.useMemo)(() => {
        const result = {}
        for (const [id, snapshot] of Object.entries(projections ?? {})) {
          const entries = snapshot?.values?.subagentCatalog
          result[id] = {
            state: snapshot?.state === 'idle' ? (Array.isArray(entries) ? 'ready' : 'loading') : snapshot?.state,
            error: snapshot?.error,
            entries: (Array.isArray(entries) ? entries : []).map((entry) => ({
              ...entry,
              activity: (statusMap?.get?.(entry.id)?.running ?? byId?.[entry.id]?.running) === true ? 'running' : 'inactive',
            })),
          }
        }
        return result
      }, [projections, byId, statusMap])

      const catalog = catalogs[sessionId]
      const [open, setOpen] = React.useState(false)
      const [expanded, setExpanded] = React.useState(() => new Set())
      const rootRef = React.useRef(null)
      const triggerRef = React.useRef(null)
      const menuRef = React.useRef(null)
      const [menuPosition, setMenuPosition] = React.useState()

      const toggleBranch = React.useCallback((childSessionId) => {
        setExpanded((current) => {
          const next = new Set(current)
          if (next.has(childSessionId)) next.delete(childSessionId)
          else {
            next.add(childSessionId)
            refreshProjection(childSessionId)
          }
          return next
        })
      }, [refreshProjection])

      // Menus close on an outside pointer, exactly as the shipped dropdown does
      // (`dsh-client-ui-subagent/lib/client.js:457-466`).
      React.useEffect(() => {
        if (!open) return undefined
        const closeOutside = (event) => {
          if (event.target instanceof Node && rootRef.current?.contains(event.target) === false && menuRef.current?.contains(event.target) === false) {
            setOpen(false)
            setExpanded(new Set())
          }
        }
        document.addEventListener('pointerdown', closeOutside)
        return () => document.removeEventListener('pointerdown', closeOutside)
      }, [open])

      // Portalled placement below the trigger, clamped to the viewport edge.
      React.useEffect(() => {
        if (!open) return undefined
        const placeMenu = () => {
          const trigger = triggerRef.current
          if (trigger === null) return
          const rect = trigger.getBoundingClientRect()
          const width = Math.min(336, window.innerWidth - MENU_VIEWPORT_MARGIN * 2)
          setMenuPosition({
            top: rect.bottom + MENU_VIEWPORT_MARGIN,
            left: Math.min(Math.max(MENU_VIEWPORT_MARGIN, rect.left), window.innerWidth - width - MENU_VIEWPORT_MARGIN),
          })
        }
        placeMenu()
        window.addEventListener('resize', placeMenu)
        window.addEventListener('scroll', placeMenu, true)
        return () => {
          window.removeEventListener('resize', placeMenu)
          document.removeEventListener('scroll', placeMenu, true)
        }
      }, [open])

      // The model summary rides in the trigger's tooltip, so the headline stays
      // the count the shipped pill always showed.
      const summary = summarizeSubagentModels(projections, byId, sessionId)
      const directCount = catalog?.entries.length ?? 0
      const runningCount = catalog?.entries.filter((entry) => entry.activity === 'running').length ?? 0

      const triggerTooltip = () => {
        const lines = [t(summary.running > 0 ? 'tip.running' : 'tip.summary', { count: formatCount(summary.running > 0 ? runningCount : directCount) })]
        for (const group of summary.groups) lines.push(`  ${formatModelGroup(group)}`)
        if (summary.total !== directCount) {
          lines.push(t('chip.total', { count: formatCount(summary.total) }))
        }
        return lines.join('\n')
      }

      if (isChild) return null
      if (catalog === undefined || directCount === 0) return null

      const trigger = h(
        'button',
        {
          ref: triggerRef,
          type: 'button',
          className: open ? 'dsh-smt-trigger dsh-smt-triggerOpen' : 'dsh-smt-trigger',
          'aria-haspopup': 'tree',
          'aria-expanded': open,
          'aria-label': t(runningCount > 0 ? 'chip.countRunning' : 'chip.countTotal', { count: formatCount(runningCount > 0 ? runningCount : directCount) }),
          onClick: () => setOpen((value) => !value),
        },
        h('span', { className: 'dsh-smt-count' }, formatCount(directCount)),
        h('span', { className: 'dsh-smt-chevron' }, '▾'),
      )

      const treeProps = {
        parentSessionId: sessionId,
        currentSessionId: sessionId,
        catalogs,
        summaries,
        expanded,
        level: 1,
        projections,
        byId,
        openChild: (address) => openChild(address),
        openChildAside: (address) => openChildAside(address),
        refreshProjection,
        toggleBranch,
        closeCatalog: () => setOpen(false),
        t,
      }

      return h(
        'span',
        { className: 'dsh-smt-root', ref: rootRef },
        Tooltip !== null
          ? h(Tooltip, { label: triggerTooltip, side: 'bottom', portal: true, maxWidth: 320 }, trigger)
          : h('span', { title: triggerTooltip() }, trigger),
        open && createPortal !== null
          ? h(
              portalTarget(),
              { className: 'dsh-smt-menu', style: menuPosition, ref: menuRef },
              h('div', { role: 'tree', className: 'dsh-smt-menuBody', 'aria-label': t('chip.treeAria') }, h(SubagentTreeRows, treeProps)),
            )
          : null,
      )
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
     * `slots` and `locale` are NOT declared on `inject`, so this half loads at
     * boot instead of waiting on a service gate. They are still not guaranteed
     * to EXIST when `apply` runs: the runtime `await()`s only the services a
     * row declares (`fiber.inject`), so with an empty gate `apply` may run
     * before `ui-renderer` has provided `slots`
     * (`dsh-client-ui-renderer/lib/client.js:1843`) or before `locale`
     * (`dsh-client-locale/lib/client.js:1526`).
     *
     * The gate used to hide that, but it also made the row wait on services
     * whose provider lives in the very packages this plugin sits beside — a
     * wait that can fail the whole boot. So: ask politely, then retry when one
     * appears, and give up quietly if it never does.
     *
     * The retry rides `setTimeout`, which needs no declared service (the ctx
     * timer verbs are gated on `inject: ['timer']`,
     * `dsh-cordis-client-runner/lib/client.js:217-223,347`), so the empty gate
     * stays empty and the boot is not held. Nothing else may be touched on a
     * dynamic `ctx`: any other property read is either a service read that
     * rejects with `service "x" is not declared by your plugin` (`:331`) or
     * reaches cordis's own gate and throws `cannot get property "x" without
     * inject` (`@deepseek-ai/cordis/lib/index.js:676`). `ctx.get` is the one
     * sanctioned optional lookup (`:344`).
     *
     * @param {object} ctx - Client context; may already expose `get`.
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

      // A `queueMicrotask` poll is deliberately NOT used: it re-queues itself
      // ahead of the macrotasks every package activation depends on, starves
      // the boot, and reproduces
      // `web boot: 1 entry did not activate @deepseek-ai/dsh-client-ui-subagent: failed`.
      // A macrotask yields to the event loop, letting the renderer install
      // `slots` first.
      //
      // The budget is a backstop for a boot where the provider never arrives;
      // normal provider installation lands within a few turns.
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

    /** Client plugin body. */
    function apply(ctx) {
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
          if (typeof ctx.effect === 'function') ctx.effect(registerDictionaries, 'dsh-subagent-model: dictionaries')
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
            if (typeof ctx.effect === 'function') ctx.effect(addLanguage, 'dsh-subagent-model: language')
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
        // Both ids are FRESH, so neither seat displaces a shipped occupant: the
        // header chip is added beside the subagent-catalog pill and the job
        // list, and the hover row beside the schedule row. That is the whole
        // reason this plugin can use a declared order instead of a shadowing
        // priority.
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
              ModelChip,
            )
            try {
              if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'dsh-subagent-model: header slot')
            } catch (e) {
              // The facade already binds the disposer to the calling fiber.
            }
            return dispose
          })
        } catch (e) {
          // A slot that refuses the registration must leave the shipped pills
          // intact rather than half-replacing them.
        }

        // The route-marked tree takes OVER the shipped `subagent-catalog` cell
        // rather than adding beside it, which is the one place a plugin cannot
        // avoid: the shipped `CatalogRows` renders no per-row slot
        // (`dsh-client-ui-subagent/lib/client.js:164-338`), so a marker beside a
        // subagent requires owning the cell.
        //
        // The written `priority` is what makes that takeover work. Entries sort
        // ascending and a `list` slot keeps only the FIRST entry per `id` cell
        // (`dsh-client-ui-slots/lib/index.js:221`, `:278-293`), and a duplicate
        // `id` is rejected only AT THE SAME priority (`:183-184`) — so a very low
        // number both displaces the shipped occupant and keeps this entry from
        // colliding with its OWN previous registration when the `slots.inject`
        // reconciler re-runs. This is the measurement the sibling
        // `dsh-subagent-tree` documents at `SHADOW_PRIORITY` (-9999).
        try {
          slots.inject(ACTIONS_SLOT, () => {
            const dispose = slots.register(
              {
                name: ACTIONS_SLOT,
                id: SHADOWED_CELL_ID,
                priority: SHADOW_PRIORITY,
                locale: NS,
              },
              SubagentModelTree,
            )
            try {
              if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'dsh-subagent-model: tree slot')
            } catch (e) {
              // The facade already binds the disposer to the calling fiber.
            }
            return dispose
          })
        } catch (e) {
          // A slot that refuses the registration must leave the shipped catalog
          // pill intact rather than half-replacing it.
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
              ModelHoverRow,
            )
            try {
              if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'dsh-subagent-model: hover slot')
            } catch (e) {
              // The facade already binds the disposer to the calling fiber.
            }
            return dispose
          })
        } catch (e) {
          // A slot that refuses the registration must leave the shipped
          // schedule row intact rather than half-replacing it.
        }
      })
    }

    return {
      // NO declared services, deliberately — the same load-bearing shape the
      // sibling `dsh-subagent-tree` half documents. Naming `slots` here makes
      // `fiber.await()` park this row until the renderer provides it, while the
      // renderer in turn waits on the UI packages this row is mounted beside;
      // the two can wait on each other and the whole boot fails. With an empty
      // gate `apply` runs before `slots` exists, which is what `whenService`
      // above bridges.
      //
      // The store hooks (`useSessions`, `useSessionStatus`) and the `sessionId`
      // prop are NOT services at all — the renderer passes them to every slot
      // entry as standard props — so naming `sessions` here would only wait on
      // a provider this row never uses.
      inject: [],
      apply,
    }
  },
})
