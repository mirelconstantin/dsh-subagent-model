/**
 * Host-side anchor row for the session-model chip.
 *
 * This module runs in the **Host** (Node) process. It deliberately does
 * nothing on its own: the work is done by this package's browser half,
 * `src/client.js`, which the Host serves at
 * `/plugins/dsh-subagent-model/client.js` and the browser then executes.
 *
 * It exists because `@deepseek-ai/dsh-client-modules` discovers client
 * packages by scanning the **Host Loader's live entries** — a package with no
 * live Loader row is never scanned and its browser half is never served:
 *
 *   dsh-client-modules/lib/index.js:743-773  locatePkgJson(loaderName, baseUrl)
 *   dsh-client-modules/lib/index.js:701-731  resolveMeta(...)  -> dsh.client + exports["./client"]
 *   dsh-client-modules/lib/index.js:352-360  create(loader, id)
 *
 * **Why no host behaviour is needed here.** The displayed value comes from the
 * `modelSelection` Session projection, which `dsh-api-session-controller`
 * already registers and wires to the client
 * (`lib/types/model-selection-projection.js`, registered at `lib/index.js:2114`
 * by `installModelSelectionProjection`). Its view is `{ lastUsed, next }`,
 * where `next` is the pending selection when one exists and otherwise the
 * route the last request actually used. Both are plain JSON and both already
 * reach the browser in every projection push frame, so the browser reads what
 * it is already holding. Nothing on the Host can see which Session a browser
 * tab is displaying, so a Host-side computation would answer a different
 * question from the one the chip asks.
 *
 * The pure function that reads the value, `src/model.js`, is therefore shared
 * with the tests rather than exported from this row.
 *
 * So the anchor is load-bearing infrastructure, not a stub. It is written as a
 * plain, well-formed Cordis plugin so it composes like any other Host entry:
 * an `apply` that returns nothing (Cordis would read a returned array of tool
 * names as a disposer and misbehave), no `inject`, and no `Config` — this row
 * takes no configuration, which also keeps the package free of any dependency.
 *
 * Model-facing behaviour: none. No tool is registered, no service is
 * published, no event is subscribed, no session data is read or written. The
 * model, its tools, and its session logs are untouched by this file.
 *
 * @module dsh-subagent-model
 */

/** Loader identity. Matches the package name so diagnostics name the package. */
export const name = 'dsh-subagent-model'

/**
 * Mount the anchor.
 *
 * Returns nothing on purpose: Cordis reads whatever a plugin body returns as
 * an effect, and there is no effect to hand back. The browser half mounts on
 * its own from the boot graph this row makes reachable.
 *
 * @param {any} ctx - Cordis context (unused; nothing is injected and nothing is registered).
 * @returns {void} nothing.
 */
export function apply(ctx) {
  // Intentionally empty — see the module comment.
  void ctx
}

export default { name, apply }
