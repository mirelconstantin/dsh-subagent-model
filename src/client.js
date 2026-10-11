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
 * second case and nothing at all in the first — `src/client.model.js` keeps them
 * apart, and the header chip disappears rather than showing a stale model.
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
    let IconSparkleRegular = null
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
        IconSparkleRegular = typeof primitives.IconSparkleRegular === 'function' ? primitives.IconSparkleRegular : null
      }
    } catch (e) {
      // A build where the seed is absent must not take the header down with it.
    }

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-subagent-model'

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
     * shipped entry.
     *
     * The number must be DISTINCT from every other entry claiming this cell.
     * A duplicate `id` is rejected only AT THE SAME priority
     * (`dsh-client-ui-slots/lib/index.js:183-184`), which is why the written
     * value is -9998 and not the -9999 the sibling `dsh-subagent-tree` uses
     * (`src/tree.js`): co-installed, the two would claim `subagent-catalog` at
     * the same priority and the second `register` would throw, blanking the
     * header. It also keeps this entry from colliding with ITSELF when the
     * `slots.inject` reconciler re-runs the callback.
     *
     * The value sits far below anything the page-local decrementing counter can
     * produce (`allocatePriority: () => --this.nextPriority`,
     * `dsh-cordis-client-runner/lib/client.js:615`), so it does not depend on how
     * many other packages register first.
     */
    const SHADOWED_CELL_ID = 'subagent-catalog'
    const SHADOW_PRIORITY = -9998

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
      'tip.efforts': 'Efforts: {efforts}',
      'tip.effortDefault': '{effort} (default)',
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
      // Per-turn route history, owned by the companion chunk
      // src/client.route-history.js, which renders these through the
      // conversation.chat.turnTail seat. They sit here so the two flattened
      // dictionaries below stay the single pair this plugin owns.
      'route.label': 'Ran on',
      'route.title': 'This turn ran on {model}',
      'route.switchedTitle': 'This turn ran on {model}, re-routed from {from}',
      'route.effortDefaulted': '(adapter default)',
      'route.switchedFrom': '(was {from})',
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
      'tip.efforts': 'Eforturi: {efforts}',
      'tip.effortDefault': '{effort} (implicit)',
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
      'route.label': 'A rulat pe',
      'route.title': 'Această tură a rulat pe {model}',
      'route.switchedTitle': 'Această tură a rulat pe {model}, schimbată de la {from}',
      'route.effortDefaulted': '(implicit din adaptor)',
      'route.switchedFrom': '(era {from})',
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
     * The summary a render that will draw no trigger gets.
     *
     * Shared and frozen so the guard in {@link SubagentModelTree} can skip the
     * walk without allocating: the tooltip thunk reads `groups`, `running`,
     * `total` and `byDepth` off it, and a fresh object per render would defeat
     * the memo that is meant to be doing the skipping.
     * @type {{groups: Array<object>, total: number, distinct: number, inherited: number, running: number, byDepth: Array<object>}}
     */
    const EMPTY_SUMMARY = Object.freeze({
      groups: Object.freeze([]),
      total: 0,
      distinct: 0,
      inherited: 0,
      running: 0,
      byDepth: Object.freeze([]),
    })

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
     * metrics, sidebar button, error row and refresh — with two additions per
     * row: the route marker from {@link routeMarker}, and the row's part in
     * roving focus.
     *
     * Roving focus is why this component carries no focus state of its own. The
     * widget is ONE tab stop: `rowIds` is the drawn rows in visual order and
     * `activeRowId` names the row holding it, both computed once by
     * {@link SubagentModelTree} and threaded down through `props`. A row that is
     * not the active one renders `tabIndex: -1`, so Shift+Tab out of the menu
     * leaves rather than walking every row. Arrow keys and Home/End pick a new
     * `activeRowId` by index in `rowIds`; the movement itself is the effect in
     * {@link SubagentModelTree}, which owns the menu's DOM node and can move
     * real focus there. `Enter` and `Space` open the row, `ArrowRight`/`ArrowLeft`
     * expand and collapse, unchanged.
     *
     * @param {object} props - The recursion's own props.
     * @returns {object} A React fragment holding this level's rows.
     */
    function SubagentTreeRows(props) {
      const {
        parentSessionId, currentSessionId, catalogs, summaries, expanded, level,
        projections, byId, rowIds, activeRowId, setActiveRow,
        openChild, openChildAside, refreshProjection, toggleBranch, t, m,
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

          const route = m.resolveRoute(projections, byId, entry.id)
          const parentRoute = m.resolveRoute(projections, byId, parentSessionId)
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
            } else {
              const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
              let target = null
              if (step !== 0) target = rowIds[rowIds.indexOf(entry.id) + step]
              else if (event.key === 'Home') target = rowIds[0]
              else if (event.key === 'End') target = rowIds[rowIds.length - 1]
              if (target !== null && target !== undefined) {
                event.preventDefault()
                event.stopPropagation()
                setActiveRow(target)
              }
            }
          }
          // A click is a selection, so it moves the roving tab stop with it —
          // otherwise the next Tab would return focus to a row the user just
          // left.
          const activate = () => setActiveRow(entry.id)
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
                // Stable per row so the arrow keys can FIND the element they
                // must move focus to, from the menu's own DOM rather than from a
                // ref map this file would otherwise have to thread through the
                // recursion.
                id: rowDomId(entry.id),
                'data-treeitem': entry.id,
                tabIndex: entry.id === activeRowId ? 0 : -1,
                'aria-level': level,
                'aria-selected': entry.id === activeRowId,
                'aria-current': isCurrent || undefined,
                'aria-label': [label, secondary].filter((value) => value !== '').join(' '),
                ...(knownLeaf ? {} : { 'aria-expanded': isExpanded }),
                className: 'dsh-smt-row',
                onClick: (event) => {
                  activate()
                  open(event)
                },
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
     * The rows the menu actually draws, in the order it draws them.
     *
     * `SubagentTreeRows` recurses depth-first and draws each level's entries in
     * catalog order, so this sequence is both the visual order and the order
     * `querySelectorAll` reports. It exists because a row needs its own position
     * in that sequence at RENDER time — the roving `tabIndex` is one tabbable
     * row, and it is whichever row holds that position — and the recursion
     * cannot hand it out without either a render-time counter or this walk.
     *
     * @param {Record<string, any>} catalogs - Loaded catalog per session id.
     * @param {Set<string>} expanded - Expanded branch ids.
     * @param {string} parentSessionId - The session whose children the menu roots at.
     * @returns {Array<string>} Drawn row session ids, in visual order.
     */
    function visibleRowIds(catalogs, expanded, parentSessionId) {
      const ids = []
      const walk = (parentId) => {
        const catalog = catalogs[parentId]
        if (catalog === undefined) return
        for (const entry of catalog.entries) {
          ids.push(entry.id)
          if (expanded.has(entry.id) && !isKnownLeaf(catalogs[entry.id])) walk(entry.id)
        }
      }
      walk(parentSessionId)
      return ids
    }

    /**
     * The DOM id one tree row is addressable by.
     *
     * Session ids are opaque strings, so they cannot go into a selector unquoted;
     * the menu instead looks its rows up by `data-treeitem`, and this id exists
     * so assistive technology has a real element id to anchor to.
     *
     * @param {string} id - Child session id.
     * @returns {string} The row's DOM id.
     */
    function rowDomId(id) {
      return `dsh-smt-row-${String(id)}`
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
      const { sessionId, useSessions, useSessionStatus, openChild, openChildAside, refreshProjection, t, m } = props

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

      // ROVING FOCUS. `role: "tree"` is only honest when the rows can actually
      // be walked: the WAI-ARIA tree pattern makes the WIDGET a single tab stop
      // and moves DOM focus with the arrow keys. `activeId` names the row that
      // holds it, which is the only one given `tabIndex: 0`.
      const [activeId, setActiveId] = React.useState(null)

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

      // Menu-open and catalog-change both strand `activeId` on a row that is no
      // longer drawn, which would leave the widget with no tabbable row at all.
      // Re-anchor on the first drawn row whenever the active one is gone.
      const rowIds = visibleRowIds(catalogs, expanded, sessionId)
      const activeRowId = activeId !== null && rowIds.includes(activeId) ? activeId : (rowIds[0] ?? null)

      // Focus has to wait for the row the state change re-renders, so it rides
      // the commit rather than the key event. The id is the dependency on
      // purpose: re-running this on every render would steal focus back from
      // whatever inside the row the user clicked.
      React.useEffect(() => {
        if (open === false || activeRowId === null) return
        menuRef.current?.querySelector('[data-treeitem="' + activeRowId + '"]')?.focus()
      }, [open, activeRowId])

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
          window.removeEventListener('scroll', placeMenu, true)
        }
      }, [open])

      const directCount = catalog?.entries.length ?? 0
      const runningCount = catalog?.entries.filter((entry) => entry.activity === 'running').length ?? 0

      // Whether this header will render a trigger at all — the guard the walk
      // has to respect. A subagent's own header is the case that makes it worth
      // respecting: it can have a populated catalog of its own, so an unguarded
      // walk would resolve a route for every one of its descendants and then
      // render nothing at all.
      const wanted = !isChild && catalog !== undefined && directCount > 0

      // The model summary rides in the trigger's tooltip, so the headline stays
      // the count the shipped pill always showed. Keyed on the three real
      // inputs plus the guard, exactly as the `catalogs` memo above: the summary
      // is a pure function of the projection map, the row map and the root id.
      //
      // The guard is INSIDE the factory, not an early return above it. A hook
      // placed after a conditional return is a hook-order violation, and the
      // condition here is session state that changes: `isChild` flips when a
      // subagent is opened and `directCount` flips when the catalog loads, so a
      // deferred `useMemo` would change the hook count between renders of one
      // mounted component.
      const summary = (0, React.useMemo)(() => (
        wanted ? m.summarizeSubagentModels(projections, byId, sessionId) : EMPTY_SUMMARY
      ), [projections, byId, sessionId, wanted])

      // Both of these renders NOTHING. They stay where they are — after every
      // hook, before the trigger — so a header with no subagents builds no
      // button, no portal and no tooltip.
      if (isChild) return null
      if (catalog === undefined || directCount === 0) return null

      const triggerTooltip = () => {
        const lines = [t(summary.running > 0 ? 'tip.running' : 'tip.summary', { count: m.formatCount(summary.running > 0 ? runningCount : directCount) })]
        for (const group of summary.groups) lines.push(`  ${m.formatModelGroup(group)}`)
        if (summary.total !== directCount) {
          lines.push(t('chip.total', { count: m.formatCount(summary.total) }))
        }
        return lines.join('\n')
      }

      const trigger = h(
        'button',
        {
          ref: triggerRef,
          type: 'button',
          className: open ? 'dsh-smt-trigger dsh-smt-triggerOpen' : 'dsh-smt-trigger',
          'aria-haspopup': 'tree',
          'aria-expanded': open,
          'aria-label': t(runningCount > 0 ? 'chip.countRunning' : 'chip.countTotal', { count: m.formatCount(runningCount > 0 ? runningCount : directCount) }),
          onClick: () => setOpen((value) => !value),
        },
        h('span', { className: 'dsh-smt-count' }, m.formatCount(directCount)),
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
        rowIds,
        activeRowId,
        setActiveRow: setActiveId,
        openChild: (address) => openChild(address),
        openChildAside: (address) => openChildAside(address),
        refreshProjection,
        toggleBranch,
        closeCatalog: () => setOpen(false),
        t,
        m,
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
      // routes it to `importChunk`, which fetches `/plugins/dsh-subagent-model/
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
              // The catalog loader is NOT a standard prop the renderer supplies;
              // it is bound here because the Remote namespace is reachable only
              // through this plugin's own ctx.
              (chipProps) => h(withModel(ModelChip), { ...chipProps, loadCatalog }),
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
              withModel(SubagentModelTree),
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
              withModel(ModelHoverRow),
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
