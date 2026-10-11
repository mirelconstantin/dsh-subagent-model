<p align="center">
  <img src="https://raw.githubusercontent.com/pazalo/.github/main/assets/pazalo-logo.png" width="112" alt="Pazalo">
</p>

<h1 align="center">dsh-subagent-model</h1>

<p align="center">
  <img src="https://img.shields.io/npm/v/dsh-subagent-model-FFC24D?style=flat-square&logo=npm&logoColor=black" alt="npm version">
  <img src="https://img.shields.io/npm/dw/dsh-subagent-model-F0522C?style=flat-square&logo=npm&logoColor=white" alt="npm downloads">
  <img src="https://img.shields.io/badge/Node-%3E%3D20-FFC24D?style=flat-square&logo=node&logoColor=black" alt="Node">
  <img src="https://img.shields.io/badge/Tests-63-FFC24D?style=flat-square" alt="Tests">
  <img src="https://img.shields.io/badge/Licence-Apache--2.0-F0522C?style=flat-square" alt="Licence">
</p>

<p align="center">
  See which model a DeepSeek Harness session is really running on. A chip in the
  header names the model and reasoning effort of whichever conversation is open —
  including a subagent's — a dropdown marks which child carries its own route
  instead of inheriting its parent's, and sidebar hover cards say what each
  conversation actually did.
</p>

## Install

From the GUI, paste this into **Add plugin**:

```
dsh-subagent-model
```

Or from a terminal:

```bash
dsh plugin add dsh-subagent-model
```

**No build step is involved** and there are no dependencies at all. Every entry
point ships as committed source: the Host reads `src/client.js` and serves it to
the page verbatim, so pnpm never has to run anything and you are never asked to
allowlist a build. Restart the profile afterwards and the chip appears.

<details>
<summary>Installing by other routes</summary>

| Route | Command |
| --- | --- |
| npm, the default | `dsh plugin add dsh-subagent-model` |
| Pinned to a version | `dsh plugin add dsh-subagent-model@1.0.0` |
| Pinned to a commit | `dsh plugin add github:mirelconstantin/dsh-subagent-model#<sha>` |
| Tarball | `dsh plugin add ./dsh-subagent-model-1.0.0.tgz` |
| Local checkout | `dsh plugin add /absolute/path/to/dsh-subagent-model` |

</details>

## What it shows

| seat | what it shows | where |
| --- | --- | --- |
| **header chip** | `model: <id> (effort)` for the **active** Session | beside the subagent pill in the conversation header |
| **subagent tree** | the shipped subagent dropdown, with a **route marker** per row | the `subagent-catalog` header cell |
| **hover-card rows** | model, effort, work done, active time, task, kind | inside every Session's hover card in the sidebar |

The effort appears only when one is set — it is optional on the same route record
the model comes from, and a session with none configured stays compact.

Presentation only. The model, its tools, and its session log are untouched: no
tool is registered, no service is published, and nothing the model can observe
changes.

## The problem it solves

DeepSeek Harness routes a session by model, and a subagent may run a *different*
one than its parent — but nothing on the page said so. Two things follow:

**A subagent's model was invisible until you opened it.** Session projections
reach the browser in two places, and they hold different sessions.
`projectionsBySession` only carries a session whose projection store is
*resident* in the client, and stores are created lazily
(`dsh-api-session-controller/lib/index.js:2525`) — so a subagent the user never
opened was simply absent. The list rows carry the same values under
`byId[id].projectionValues` (`:2942`, `:3521`, `:3549`), synthesized from the
parent's `subagentCatalog` (`:3518-3542`), which is what covers a child that is
listed but never loaded. Reading both sources is the whole fix.

**An inherited route was unrecoverable.** With model selection off — the
`subagent` default (`dsh-tool-subagent/README.md:47`) — every child inherits its
parent's route (`:67`), and that route is nowhere in the child's own log. The
plugin walks `parentId` up the lineage until an ancestor records an explicit
one, so an opened subagent names a real model marked `(inherited)` rather than
nothing.

## Where the value comes from

The `modelSelection` Session projection, which the harness already registers and
already ships to the browser:

```
dsh-api-session-controller/lib/types/model-selection-projection.js
  stateSchema : { lastUsed, pending }   (routes carry optional reasoningEffort)
  wire view   : { lastUsed, next }      // next = pending ?? lastUsed
  registered  : lib/index.js:2114 (installModelSelectionProjection)
```

`lastUsed` is folded from each request's own `request/header` config, so it is
the route the session **actually** used, not the one it was configured with.
`next` is the pending selection while one is queued and `lastUsed` otherwise, so
reading `next` answers "which model is this session on" in both states. That is
the same read the shipped Agent Team row performs
(`dsh-experimental-client-ui-agent-team/lib/client.js:89`).

## Subagents, honestly

Model selection is off by default, so a subagent reading `Inherited from parent`
is the **expected case, not a bug** — nothing was overridden. What differs by
construction:

- **A continuable subagent with its own route** snapshots
  `agentProvider` / `agentModel` / `agentReasoningEffort` in its descriptor
  (`dsh-subagent/lib/types/descriptor.js:38-45`), so its explicit model is
  recovered and shown in full.
- **A one-shot subagent with its own route** deliberately omits the agent route
  (`:37`, `:118-126`) because cold resume does not need it. An explicitly
  selected one-shot model is therefore not durable, and the plugin says
  `Inherited from parent` rather than guessing. That is a limit of the durable
  format, not of this plugin.

To pin every subagent's model, set `modelSelectionSettings: true` on the
`subagent` tool and pass a route per call; `list_subagent_models` then becomes
available for discovery.

## Three seats, and why the third replaces rather than adds

The chip and the hover rows ADD a cell each, so nothing shipped is displaced.
The tree cannot: the shipped `CatalogRows` renders no per-row slot
(`dsh-client-ui-subagent/lib/client.js:164-338`), so a marker beside a subagent
requires owning the `subagent-catalog` cell itself. It therefore claims that id
at `priority: -9999`, which is what makes a `list` slot keep it instead of the
shipped occupant (`dsh-client-ui-slots/lib/index.js:221`, `:278-293`) while a
duplicate id is rejected only at the *same* priority (`:183-184`).

That takeover is the one decision worth knowing about: removing the
`SHADOWED_CELL_ID` registration in `src/client.js` restores the shipped
dropdown and loses the markers, and nothing else depends on it.

| slot | declared by | this plugin |
| --- | --- | --- |
| `conversation.session.header.actions` | `dsh-client-ui-conversation/lib/index.js:18268-18271` | `id 'subagent-model'` (chip), and `id 'subagent-catalog'` at `priority -9999` (tree) |
| `sidebar.session.row.hover` | `dsh-client-ui-workspace/lib/index.js:4322-4325` | `id 'subagent-model'` |

## What each seat tells you

**The chip** names the effective route of whichever conversation is open, root or
subagent, and marks it `(switching)` while a queued selection has not been
consumed, `(inherited)` when it came from a parent. Its tooltip adds the model
breakdown across descendants — `3× deepseek-chat, 2× deepseek-reasoner` — and,
when a generation actually splits that breakdown, the same breakdown cut by
generation. That is the integration with the sibling `dsh-subagent-tree`: both
facts come from one walk over `subagentCatalog`, so they read in one place.

**The tree** puts a marker next to a subagent whose route is its own, and a
quieter one when it merely inherits. With selection off every child inherits, so
marking each one would mark all of them and say nothing — a marker therefore
appears only for a subagent that differs, and its tooltip names the parent's
model for comparison.

**The hover card** answers "what was this conversation". Each row is read from a
projection the client already holds and appears only when its value is present,
so a zero never reads as "did nothing": model and effort, turns and steps, active
time, generated tokens, the delegating agent's own task label, and the mode that
decides whether the session can be continued.

## Why there is no per-turn model history

`request/header` is the event recording each request's route, and nothing in
`SessionProjectionMap` ships it — the projections are `modelSelection`,
`subagentCatalog`, `sessionStats`, `tokenUsage`, `contextBreakdown` and the rest,
none carrying a route history. The `conversation.chat.turnTail` seat receives
only `turn`, `seq` and `openFile`
(`dsh-cordis-client-runner/lib/index.js:2570-2607`), and the log itself is
Host-side, reached only through `ctx.sessionQuery`
(`dsh-subagent/lib/types/list-children.js:70-72`).

So a client plugin cannot read which model each turn used. What is reachable is
the disagreement between `next` and `lastUsed`, reported as
`Route change  <from> → <to>, not yet applied`. The real per-turn history would
need a Host-side Remote over the log — a different plugin, with a restart cost.

## Honesty about missing data

Four states are kept apart, because collapsing them would print a lie:

| state | chip | hover card |
| --- | --- | --- |
| loaded, model known | `model: deepseek-chat (high)` | `Model  deepseek-chat (high)` |
| loaded, no request yet | *(nothing)* | `Model  No model yet` |
| listed in a catalog, never opened | *(nothing)* | `Model  <model>`, or `Inherited from parent` |
| neither store knows it | *(nothing)* | *(nothing)* |

## Files

| path | role |
| --- | --- |
| `cordis.patch.yml` | exactly one Loader row — the anchor |
| `src/index.js` | Host anchor; publishes nothing |
| `src/model.js` | the shared pure module the browser half imports |
| `src/client.js` | the browser half; registers all three seats |
| `locale/{en,ro,zh}.json` | dictionaries for namespace `dsh-subagent-model` |
| `scripts/unit.mjs` | `node --test` suite for `src/model.js` and locale parity |
| `scripts/check-plugin.mjs` | manifest, patch, exports, browser-half contract |

No build step, no bundler, no transpiler and **no dependency**.

### Why `src/model.js` is inlined rather than imported

A classic script cannot `import`, and the Host serves exactly one file per
package: the boot graph resolves `exports["./client"]` only
(`dsh-client-modules/lib/index.js:701-731`), and sibling files are served solely
under a hard-coded pattern — `CLIENT_CHUNK =
/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/` (`:169`, enforced at `:923`).
`src/model.js` does not match, so it is not reachable at runtime.

`src/client.js` therefore carries inlined copies of the pure functions, which
must stay behaviourally identical to `src/model.js`. The unit suite pins this by
evaluating the browser half under a stub `window.__ModuleLoader__` and asserting
every inlined function exists; the shared module remains the tested source of
truth.

## The browser half

Two loading rules are load-bearing, both measured on a live page and not
assumed. See `src/client.js` for the full notes.

**`inject` stays empty.** Naming `slots` makes `fiber.await()` park the row until
the renderer provides it, while the renderer waits on the UI packages this row
sits beside. The two wait on each other and the whole boot fails with
`web boot: 1 entry did not activate …`, taking the entire GUI down. With an empty
gate `apply` runs before `slots` exists, so `whenService` polls with
`setTimeout`. Do **not** substitute `queueMicrotask`: a microtask poll re-queues
itself ahead of the macrotasks every package activation depends on, starves the
boot, and reproduces the same failure.

**`ro` is added to the language catalog.** `en` and `zh` are shipped catalog
languages; `ro` is not, and the fallback chain walks the catalog rather than the
registered dictionaries — so a `ro` dictionary alone is unreachable until
`locale.addLanguage` adds the language.

## Verify

```sh
node --test scripts/unit.mjs    # 63 tests: model logic, cycles, depth grouping, locale parity
node scripts/check-plugin.mjs   # 26 checks: manifest, patch, exports, browser contract
```

## Licence

Apache-2.0. See [LICENSE](LICENSE).