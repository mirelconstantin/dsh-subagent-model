# AGENTS.md — working on dsh-subagents-model

## Read this first

**[RELEASING.md](./RELEASING.md) is mandatory.** It defines the version scheme,
the release sequence, and the promise this plugin makes to users. Do not change,
publish or tag anything without having read it.

Two rules are absolute:

1. **Every release bumps `package.json` → `version`.** `npm version patch` (or
   `minor`/`major`), then tag `v<version>`. CI fails a tag that disagrees with the
   manifest, but CI cannot catch a bump that was forgotten before the tag.
2. **A release must never require a user to edit their profile.** The installer
   composes this package by itself. If you think a step is needed, it is a bug in
   the package.

## What this is

A **client-side** DeepSeek Harness plugin: it reads the `modelSelection`
Session projection and renders which model a conversation is actually running on.
Three seats, all additive — it never claims a shipped slot, so the harness's own
subagent dropdown is untouched.

- `src/index.js` — the Host anchor. Deliberately empty; it exists so the client
  half is discovered. Read its module comment before changing anything.
- `src/client.js` — the browser half. **A classic script**: no `import`, no
  `export`, no JSX. It is served verbatim and executed as-is.
- `src/client.model.js` — the pure reading logic, loaded at runtime through
  `require.async('./client.model.js')`. Also a classic script.
- `src/model.js` — re-exports the chunk as ESM so `node --test` exercises the
  exact functions the browser runs. Keep the export lists identical.

## The three traps in this codebase

Each of these cost a release, and each is invisible on screen.

**1. The chunk's `id` must be the bare package name.**
The runtime builds the module key itself as `` `${id}/${chunk}` ``
(`dsh-client-modules/lib/client.js:476-478`). Writing
`id: 'dsh-subagents-model/client.model.js'` registers the chunk under a key that
`require.async` never requests, the rejection is swallowed, and **every seat
renders nothing**. See `RELEASING.md` §3.

**2. `createPortal(children, container)` — children first.**
`h(container, ref, props, …)` is not a portal; it throws inside React's
`createChild` the moment the panel opens. The renderer contains a throwing slot
entry and abdicates it (`dsh-client-ui-renderer/lib/client.js:605-625`), so the
chip silently disappears instead of opening.

**3. `projectionsBySession` is populated lazily.**
A store exists only once a session is actually opened, so a delegated-but-never-
opened child is absent from it and carries its values on the list row's
`projectionValues` instead. Read through `catalogFor(projections, byId, id)` —
never the projection map alone — or subagents vanish from the summaries.

## Running it

```powershell
npm test            # 89 unit + 34 composition + the install probe. This is the gate.
npm run test:unit   # pure reading logic only
```

`npm test` runs `prepublishOnly`'s suite, so a release cannot skip it. The install
probe packs the real tarball, unpacks it into a throwaway profile, and executes
the shipped bytes — it is the only check that runs what a user actually gets.

There is no build step and no install step. Never add one: every entry point
ships as committed source on purpose, so the plugin has no dependencies and
nothing to allowlist.

## Style

Match the file you are editing: dense explanatory comments that cite the shipped
code they were derived from (`dsh-client-ui-conversation/lib/client.js:16923`),
and say *why* rather than restating the code. Comments quoting a line number are
load-bearing — they are how the next change knows what still holds.

Keep the CSS tokens `--dsw-*` and the font tokens `--dsh-content-font-*`. Never a
literal colour. Match the control you sit beside: the dock chip is the
ContextMeter's trigger rule for rule.

Copy is locale-owned. Every user-visible string is a key in both
`locale/en.json` and `locale/ro.json` and in the two flattened dictionaries
inlined in `src/client.js`. A key present in one and not the other fails
`npm test`.

## Before you commit

- `npm test` passes.
- A new check exists **only** if it would have caught a real past defect.
- The README and the two locale dictionaries match what the code does.
- If you changed behaviour, the version is bumped per `RELEASING.md`.