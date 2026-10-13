<p align="center">
  <img src="https://raw.githubusercontent.com/pazalo/.github/main/assets/pazalo-logo.png" width="112" alt="Pazalo">
</p>

<h1 align="center">dsh-subagent-model</h1>

<p align="center">
  <img src="https://img.shields.io/npm/v/dsh-subagent-model-FFC24D?style=flat-square&logo=npm&logoColor=black" alt="npm version">
  <img src="https://img.shields.io/npm/dw/dsh-subagent-model-F0522C?style=flat-square&logo=npm&logoColor=white" alt="npm downloads">
  <img src="https://img.shields.io/badge/Node-%3E%3D20-FFC24D?style=flat-square&logo=node&logoColor=black" alt="Node">
  <img src="https://img.shields.io/badge/Tests-84-FFC24D?style=flat-square" alt="Tests">
  <img src="https://img.shields.io/badge/Licence-Apache--2.0-F0522C?style=flat-square" alt="Licence">
</p>

<p align="center">
  See which model a DeepSeek Harness session is really running on. A chip in the
  header names the model and reasoning effort of whichever conversation is open —
  including a subagent's — a chip in the composer dock below the composer shows
  which models a whole run delegated to, and sidebar hover cards say what each
  conversation actually did. It only ever ADDS controls: the harness's own
  subagent dropdown is left exactly as shipped.
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

The only dependency-shaped field is a **peer range on the runtime itself** —
`@deepseek-ai/dsh-app-boot: >=0.2.0-rc.2 <0.3.0` — and that is the field DSH
actually evaluates: a plugin whose dsh peer range does not satisfy the running
runtime is **skipped at boot**, with a warning naming the mismatch. Accept it on
an unexpected runtime with `dsh plugin allow-version`, or wait for a release
that fits the range.

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
| **bottom-bar chip** | how many subagents this run delegated to, and which models they ran on | `conversation.composer.dock`, below the composer beside the ContextMeter |
| **hover-card rows** | model, effort, work done, active time, tokens, cache, context window, task, kind | inside every Session's hover card in the sidebar |

The chip's tooltip also names the reasoning efforts a model offers and which one
is its default, read from the live model catalog. A model the catalog does not
list adds nothing: the catalog is advisory and routing accepts ids it does not
advertise, so its absence is never treated as a fault.

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

## Three seats, and why none of them replaces anything

Every seat ADDS a cell with its own `id`, so no shipped occupant is displaced
and the harness's own subagent dropdown is left exactly as shipped. That is not
an aesthetic choice: an earlier version of this plugin claimed the
`subagent-catalog` header cell at `priority: -9998` in order to put a model
marker beside each subagent row, because the shipped `CatalogRows` renders no
per-row slot (`dsh-client-ui-subagent/lib/client.js:164-338`). Replacing that
cell means reimplementing its entire navigation contract — `openChild`,
`openChildAside`, `refreshProjection`, the tree walk, the focus model — and every
mistake in that reimplementation removes the **stock subagent list** from the
header. It did; the list stopped appearing.

The per-subagent model breakdown now lives in the bottom-bar chip instead, which
needs none of that machinery. `scripts/check-plugin.mjs` asserts that nothing
claims or shadows a shipped cell, so the takeover cannot quietly return.

| slot | declared by | this plugin |
| --- | --- | --- |
| `conversation.session.header.actions` | `dsh-client-ui-conversation/lib/index.js:18268-18271` | `id 'subagent-model'` (chip) |
| `conversation.composer.dock` | `dsh-client-ui-conversation/lib/index.js:18329-18332` | `id 'subagent-model-dock'` at `order 40` (bottom bar) |
| `sidebar.session.row.hover` | `dsh-client-ui-workspace/lib/index.js:4322-4325` | `id 'subagent-model'` |

## What each seat tells you

**The chip** names the effective route of whichever conversation is open, root or
subagent, and marks it `(switching)` while a queued selection has not been
consumed, `(inherited)` when it came from a parent. Its tooltip adds the model
breakdown across descendants — `3× deepseek-chat, 2× deepseek-reasoner` — and,
when a generation actually splits that breakdown, the same breakdown cut by
generation. That is the integration with the sibling `dsh-subagent-tree`: both
facts come from one walk over `subagentCatalog`, so they read in one place.

**The bottom-bar chip** answers the same question for the whole run rather than
for the conversation that happens to be open: how many subagents this session
delegated to, and which models they ran on. It lives in
`conversation.composer.dock`, the row below the composer beside the built-in
ContextMeter — the same slot and the same control shape the sibling
`dsh-opencode-router` uses for its proxy chip. It renders nothing at all for a
run that never delegated, so an ordinary conversation grows no extra furniture.

**The hover card** answers "what was this conversation". Each row is read from a
projection the client already holds and appears only when its value is present,
so a zero never reads as "did nothing": model and effort, turns and steps, active
time, generated tokens, the delegating agent's own task label, and the mode that
decides whether the session can be continued.

## Per-turn model history — implemented but not mounted

`src/client.route-history.js` is a complete implementation of per-turn route
history, but **nothing loads it**: `src/client.js` only calls `require.async` for
`./client.model.js`. The file is inert and contributes nothing to the UI. It is
left in the package because it is a finished, self-contained piece of work whose
reader has to match the current projection shape before it is mounted.

The route shown for any session therefore comes from the `modelSelection`
projection only. Per-turn accuracy would require mounting this chunk and adding
a `conversation.chat.turnTail` seat; see the reasoning below for why that was not
done.

`request/header` is the event recording each request's route. Nothing in
`SessionProjectionMap` ships it, so the chip reads the `modelSelection`
projection — but the event journal itself reaches the browser unfiltered, and
`request/header` is in it (`dsh-api-session-controller/lib/client.js:166`, the
stream at `:398`). The harness's own chat view already reads it that way
(`dsh-client-ui-chat/lib/client.js:9389-9394`).

So each turn's real route is recovered client-side, with no Host work: a
`request/header` conversation Definition folds the events into a per-turn map,
and a `conversation.chat.turnTail` entry reads it. Because the opening journal
frame is a snapshot, a session opened before the plugin mounted still gets its
history rather than only events from that moment on.

`reason` decides where a turn's route is anchored. `initial`, `resume` and
`series` all anchor; a bare `change` is a mid-series re-route and does not,
unless it carries `startsSeries`. An absent `reasoningEffort` is not "off" — a
`adapterDefaults.reasoningEffort` means the adapter supplies it, and the row
says so rather than implying no effort.

The older `Route change <from> → <to>, not yet applied` row is the disagreement
between `next` and `lastUsed`, and still reports a queued switch that no
request has consumed yet.

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
| `src/model.js` | the pure logic, as plain ESM for the unit suite |
| `src/client.js` | the browser half; registers all seats |
| `src/client.model.js` | the same pure logic as a browser chunk the half loads |
| `src/client.route-history.js` | the `request/header` fold and the per-turn route map — **not currently loaded**, see above |
| `locale/{en,ro}.json` | dictionaries for namespace `dsh-subagent-model` |
| `scripts/unit.mjs` | `node --test` suite for `src/model.js` and locale parity |
| `scripts/check-plugin.mjs` | manifest, patch, exports, browser-half contract |

No build step, no bundler, no transpiler and **no installed dependency** — the
one declared peer is the runtime this plugin was verified against, and DSH
resolves it from the installation.

### Why the pure logic lives in a second chunk

A classic script cannot `import`, but it does not have to: the `require` the
factory is handed carries an `async` method that fetches a package-local chunk
(`dsh-client-modules/lib/client.js:707-713`), and `CLIENT_CHUNK =
/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/` (`:169`, served at `:915-932`) is the
pattern that file has to match. Three shipped packages already ship a second
chunk this way — `dsh-client-ui-sidebar-terminal` and
`dsh-client-ui-sidebar-documentpreview` — so this is a supported shape, not a
workaround.

`src/model.js` is a plain ESM module, which no browser script can reach, so
`src/client.model.js` holds the same functions as a self-registering chunk and
`src/client.js` loads it once. The duplication was previously the whole cost of
shipping both; it is now confined to one chunk whose exports are checked against
`src/model.js`.

Every seat renders nothing until that chunk resolves, which is what keeps a
failed fetch from taking the conversation header down. The trade is that the chip
appears a tick later than a sync import would allow; nothing else on the page
waits on it.

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
`locale.addLanguage` adds the language. Both `locale/en.json` and
`locale/ro.json` ship the same key set, and `scripts/check-plugin.mjs` fails the
build if they drift apart.

## Verify

```sh
node --test scripts/unit.mjs    # 84 tests: model logic, cycles, depth grouping, locale parity
node scripts/check-plugin.mjs   # 31 checks: manifest, dsh peer range, patch, exports, browser contract
```

## Licence

Apache-2.0. See [LICENSE](LICENSE).
