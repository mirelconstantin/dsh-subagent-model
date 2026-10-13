# Release rules — read before you change anything here

This file exists because this plugin has shipped three defects that were
invisible on screen, and the fix for each is only durable if the release
process cannot be skipped.

## 1. Bump the version on EVERY release

`package.json` → `version` is the single source of truth. `npm publish` refuses a
duplicate version, so a forgotten bump is a failed release, not a silent one.

The scheme is `MAJOR.MINOR.PATCH`:

| Change | Bump | Example |
| --- | --- | --- |
| A user-visible behaviour change, a new seat, a new feature | MINOR | `1.1.1` → `1.2.0` |
| A fix for something that was broken or silent | PATCH | `1.1.1` → `1.1.2` |
| A change that removes or redefines existing behaviour | MAJOR | `1.1.1` → `2.0.0` |

**When in doubt, bump PATCH.** Every bug fixed in this project so far was a PATCH
release: a wrong chunk id, a mis-ordered `createPortal`, a store read that
dropped never-opened sessions. Under-versioning hides a fix behind a major or
minor bump, which makes the release history useless.

Do not jump versions. Do not reuse one. Do not publish a release with no code
change beyond the bump itself.

### The exact sequence

```powershell
cd C:\Users\mirel\.dsh\plugins\dsh-subagents-model

# 1. bump FIRST, so the tests run against the version being released
npm version patch        # or: npm version minor / npm version major

# 2. the full gate — this is what `prepublishOnly` will re-run
npm test

# 3. commit the bump together with the change it describes
git add -A
git commit -m "release: dsh-subagents-model@1.1.2 — <what changed, one line>"

# 4. tag; the tag and the manifest version must match, and CI enforces it
git tag v1.1.2
git push origin main --tags
```

`npm version` also rewrites the README's install examples and creates the commit
and tag for you — use it rather than editing the version by hand, so the two
cannot drift.

### What CI does with this

- `.github/workflows/tests.yml` runs on every push and pull request: the unit
  suite, the composition checks, and the install probe.
- `.github/workflows/release.yml` runs on a `v*` tag: it re-runs the full gate,
  then **fails** if the tag does not match `package.json`'s version, then
  publishes with provenance.

So the version cannot be wrong at publish time. It can still be *forgotten*
before the tag, which is why step 1 above comes first.

## 2. A release must never need a user to fix their profile

This is the promise the README makes, and it is the promise that was broken four
times.

The installer composes this package by itself
(`dsh-plugin-manager/lib/index.js:247-265`): it reads this package's
`cordis.patch.yml`, mounts the Loader row, and adds the package to
`dsh.profile.bundles`. Nothing else is needed.

**Never ask a user to edit `cordis.patch.yml` or `package.json`.** A second
definition of the same package fails composition and takes the whole web shell
down with it (`dsh-client-modules/lib/index.js:871-877`) — a guide that says
"add this row" is a guide that can break someone's entire GUI.

If a release ever needs a configuration step, that is a bug in the package, and
the fix is to make the package self-sufficient rather than to document the step.

## 3. The gates that exist because something was invisible

Every defect in this plugin's history rendered **nothing**, logged **nothing**,
and passed every static check. A green unit suite was not sufficient evidence.
These are the checks that would have caught them:

| Check | What it catches |
| --- | --- |
| `scripts/install-probe.mjs` | Anything missing from the tarball, or a chunk that will not load for an installed user |
| The bare-package-id assertion | A wrong `id` on `client.model.js`, which silently blanks every seat |
| The `createPortal` argument-order assertion | A panel that throws on click and disappears |
| `catalogFor` assertions | A lazily-populated store read the wrong way, so subagents vanish |
| The "no seat claims a shipped cell" assertion | A regression that removes the harness's own subagent dropdown |

**If you add a check, add it because it would have caught a real past defect.**
Not for coverage. A check nobody can act on is noise that trains you to skip the
suite.

## 4. Verify by executing, not by reading

The three bugs above were all invisible to static review. The probes that caught
them all *run* the browser half:

```powershell
node scripts/install-probe.mjs     # ships, installs and executes the tarball
node .github/../scripts/…          # see scripts/ for the full list
```

If you are changing `src/client.js` or `src/client.model.js`, run the probes
before you commit, not just `node --test scripts/unit.mjs`.

## 5. Never claim something was verified unless it was

A rendered component in a stubbed harness is not the same as the running GUI.
When reporting a fix, say which of these actually happened:

- the suite passes,
- a probe reproduces the old failure and passes on the new code,
- it was seen working in a live client.

Only the third is worth telling a user to trust. The first two are worth having.