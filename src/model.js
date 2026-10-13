/**
 * dsh-subagents-model — the ESM face of the shared model-reading logic.
 *
 * Run: `node --test scripts/unit.mjs` (which imports this file directly).
 *
 * THIS MODULE HOLDS NO LOGIC. It re-exports `src/client.model.js`, which is the
 * one copy of every function below. That file is a package-local CLIENT CHUNK: a
 * classic script served at `/plugins/dsh-subagents-model/client.model.js` and
 * self-registering through `window.__ModuleLoader__.load({ id, chunk, factory })`
 * — the shape three shipped packages already use
 * (`@deepseek-ai/dsh-client-ui-sidebar-terminal/lib/client.terminal.js:1-6`).
 * The browser half fetches it with `require.async('./client.model.js')`
 * (`dsh-client-modules/lib/client.js:707-713`) and the Host serves it
 * (`dsh-client-modules/lib/index.js:915-932`, `CLIENT_CHUNK` at `:169`).
 *
 * The logic used to be duplicated three times — here, plus an inlined copy in each
 * of the two browser files — which is what made a fix land in one and miss the
 * others. One copy removes the possibility rather than the drift.
 *
 * WHY THE RE-EXPORT EVALUATES ITS TARGET INSTEAD OF IMPORTING IT. A named `import`
 * of a chunk would run the module's top-level `window.__ModuleLoader__.load(...)`
 * at load time, and under `node --test` there is no `window`: the suite would fail
 * on a global it never asked about. Evaluating the same file and reading its
 * `module.exports` runs exactly the same module-scoped factory, so
 * `scripts/unit.mjs` stays green with no stub and no test-only branch.
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
 * cannot be recovered from it. A descriptor that carries no `agentModel` in
 * EITHER mode therefore names the route as inherited — the parent's — and
 * `childRouteOf` says so instead of inventing a value, which is what sends
 * `resolveRoute` up the lineage for continuable children exactly as it already
 * did for one-shot ones.
 *
 * @module dsh-subagents-model/model
 */

import { readFileSync } from 'node:fs'

/**
 * Load the chunk's factory and run it, exactly as `dsh-client-modules` does.
 *
 * The chunk never uses its `require`, and a module-scoped loader capture is all
 * the shape needs: it proves the self-registering form is intact without running
 * the platform's fetch. The loader is captured per call rather than module-scoped
 * so two evaluations of the same source cannot interfere.
 *
 * @returns {Record<string, any>} The chunk's `module.exports`.
 */
function loadChunkExports() {
  let loaded = null
  const loader = { load: (entry) => { loaded = entry } }
  const source = readFileSync(new URL('./client.model.js', import.meta.url), 'utf8')
  // eslint-disable-next-line no-new-func -- one module-scoped body, not a dynamic request.
  new Function('window', source)({ __ModuleLoader__: loader })
  if (loaded === null || typeof loaded.factory !== 'function') {
    throw new Error('src/client.model.js did not register a factory via window.__ModuleLoader__.load')
  }
  return loaded.factory(() => { throw new Error('the model chunk requires nothing') })
}

const {
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
  rollUpByModel,
  shortenModel,
  summarizeSubagentModels,
} = loadChunkExports()

export {
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
  rollUpByModel,
  shortenModel,
  summarizeSubagentModels,
}
