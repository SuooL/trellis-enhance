# Release Process

> Release and versioning rules for the `trellis-enhance` monorepo.
>
> **This fork is never published to an npm registry.** There is no `npm publish` step, no dist-tag,
> and no publish workflow. A "release" is a version bump + a `v<version>` tag in this repository,
> promoted from `dev` to `main` by a pull request. Distribution to a machine is a source clone +
> build + global symlink (see `CLAUDE.md` → "How install works").

---

## Overview

The workspace holds two packages. Both are consumed **from the workspace**, never from a registry:

| Package | Directory | Role | Distribution |
|---|---|---|---|
| `trellis-enhance` | `packages/cli` | User-facing CLI (`trellis` / `tl` bins), owns all templates and configurators | Built to `packages/cli/dist/`, exposed via `pnpm link --global` |
| `@mindfoldhq/trellis-core` | `packages/core` | Programmatic core APIs (`/channel`, `/task`, `/mem`, `/testing`) used by the CLI | Consumed by the CLI via `workspace:*`; never installed standalone |

The version numbers stay locked to each other. `packages/cli/package.json` and
`packages/core/package.json` must always carry the same `version`, and the git tag must match it —
the tag is the only release artifact, so a mismatch makes the release unidentifiable.

---

## No npm publishing

- Do **not** run `npm publish` / `pnpm publish` from any machine or workflow for these packages.
- `.github/workflows/` contains exactly `ci.yml` and `prune-branches.yml`. There is no
  `publish.yml`; it was deliberately retired (archived task
  `.trellis/tasks/archive/2026-07/07-08-retire-publish-workflow`) because it would have published
  `trellis-enhance` to a registry the project does not use.
- `packages/cli/scripts/release-preflight.js` exposes exactly one command: `check-versions`. The
  npm-era subcommands (`npm-tag`, `publish-plan`, `verify-packed-cli`, `verify-npm`) were **removed**
  on 2026-07-28. They asserted facts about a registry this project never writes to, and `publish-plan`
  went further — it queried npm for `@mindfoldhq/trellis-core`, which is *upstream's* published
  package rather than this fork's, and reported "already on npm / needs publish" from the answer. Do
  not add them back.
- Users do not upgrade with `npm install -g`. They `git pull` in their clone and rebuild; the husky
  `post-merge` / `post-checkout` hooks rebuild automatically when product source changed.
  `trellis upgrade` prints those instructions rather than invoking a package manager
  (see `commands-upgrade.md`).

---

## Version invariants

| Invariant | Rule |
|---|---|
| Shared version | `packages/cli/package.json` and `packages/core/package.json` must have the same `version`. |
| Shared tag | Git tag `v<version>` must match both package versions. |
| Source dependency | CLI depends on core with `workspace:*` — this stays `workspace:*`; nothing rewrites it to a fixed range, because nothing is packed for a registry. Enforced by `check-versions` across every dependency field plus the root `pnpm.overrides` / `resolutions`, since upstream publishes a package under the same `@mindfoldhq/trellis-core` name. |
| Tag ancestry | Every `v*` tag must be reachable from `main`. Tags that are not on `main`'s ancestor chain are stray upstream leftovers and get pruned (33 such tags were removed in the 2026-07 cleanup). Verified 2026-07-28: 103 local tags, all reachable from `main`, 0 stray — and `origin` carries none of them. |

Required gate:

```bash
node packages/cli/scripts/release-preflight.js check-versions
```

---

## Release flow

There is one release line: `main`. Work reaches it through the project's own git-workflow
(`feature/*` → PR → `dev` → PR → `main`). A release is therefore two steps: **promote, then tag.**

**Step 1 — promote `dev` → `main` by PR.**

1. Land all work on `dev` the normal way — `feature/<task-slug>` → PR → CI `verify` green →
   squash auto-merge.
2. Open the promotion PR:

   ```bash
   gh pr create --base main --head dev --title "release: dev → main(…)"
   ```

3. CI (`.github/workflows/ci.yml`) runs `verify` on the PR: typecheck, lint, coverage tests, build,
   build-output verification, and the diff-coverage gate.
4. **Merge manually.** `ci.yml`'s `auto-merge` job is scoped to `github.base_ref == 'dev'` — `main`
   is released deliberately, so no auto-merge ever fires there.

Precedent: PR #21 (`release: dev → main`, 24 commits, merged 2026-07-28) is the reference shape for a
promotion PR — a Chinese body grouping the batch by theme, plus a note on why the merge is manual.

**Step 2 — bump + tag, on `main`.**

```bash
git switch main && git pull
pnpm release            # patch; also release:minor / release:major
```

`packages/cli/scripts/release.js` runs: **branch guard** → `check-manifest-continuity` → core tests →
CLI tests → pre-release commit (excluding `docs-site`, `marketplace`, `.trellis`) →
`bump-versions.js <type>` → `release-preflight check-versions` → version commit (message = the bare
version string) → `git tag v<version>` → `git push origin main` → `git push origin refs/tags/v<version>`.

It performs **no publication** — the pushed tag *is* the release.

> **It refuses to run anywhere but `main`.** `releaseBranchError()` compares the checked-out branch
> against `main` and aborts before anything is bumped, committed, or tagged. This replaced an earlier
> `pushTarget()` that returned the literal `main` ref regardless of the checkout, so running from
> `dev` tagged a `dev` commit while pushing a stale local `main`.

> **The tag is pushed on its own ref, never with `--tags`.** `git push --tags` would push all 103
> local tags inherited from upstream history to an `origin` that carries none of them. The two pushes
> fail differently and the script says which happened: if the **branch** push fails the whole release
> is still local and the script deletes the local tag so a retry starts clean; if the **tag** push
> fails the version commit already landed, so re-push the tag by hand and do *not* re-run
> `pnpm release`, which would bump the version a second time.

Prerequisite repo configuration: branch protection on both `main` and `dev` with `verify` as the
required check, and "Allow auto-merge" enabled (auto-merge only ever applies to `dev`).

**Retired tracks.** `pnpm release:beta` / `release:rc` / `release:promote` and their
`check-docs-changelog` guard existed only because beta/rc lines were npm dist-tags (`beta`, `rc`,
`latest`) on the upstream registry. With no registry there is nothing for a prerelease dist-tag to
mean, so they were **removed** on 2026-07-28: `release.js` accepts only `patch` / `minor` / `major`,
the three scripts are gone from both the root and `packages/cli` `package.json`, and
`packages/cli/scripts/check-docs-changelog.js` was deleted along with its last caller.
`bump-versions.js` still understands `beta` / `rc` / `promote` as bump arithmetic, but nothing in the
release path passes them.

---

## Manifest continuity

Each release line maintains `packages/cli/src/migrations/manifests/<version>.json`. `trellis update`
walks the manifest chain between `fromVersion` and `toVersion`, so every version a user's project can
upgrade through needs a local manifest.

If a manifest is missing on the current branch, restore it deliberately from the branch that has it:

```bash
git show main:packages/cli/src/migrations/manifests/<version>.json \
  > packages/cli/src/migrations/manifests/<version>.json
git add packages/cli/src/migrations/manifests/<version>.json
git commit -m "chore: restore manifest <version> from main"
```

Do not bulk-merge whole manifest directories across branches — branch-specific manifests can mention
files that do not exist on the other branch.

---

## Submodule commit ordering

`docs-site` and `marketplace` are submodules inherited from upstream (`mindfold-ai/docs`,
`mindfold-ai/marketplace`). This fork does not publish to the upstream docs site, so the upstream
docs-changelog lifecycle scripts (`docs-beta-start.sh`, `docs-beta-to-rc.sh`, `docs-promote.sh`) are
**not** part of this fork's release path. The ordering rule below still applies whenever a release
commit happens to move a submodule pointer, because a pointer to an unpushed SHA breaks any CI
checkout that initialises submodules:

```bash
cd docs-site
git add . && git commit -m "docs: …" && git push origin main

cd ..
git add docs-site
git commit -m "chore: bump docs-site"
git push origin <branch>
```

`packages/cli/scripts/release.js` excludes `docs-site` and `marketplace` from its automatic
pre-release staging so submodule pointer changes cannot hide inside a generic release commit.

Verify every submodule pointer exists on its remote before tagging:

```bash
git submodule foreach 'sha=$(git rev-parse HEAD); git ls-remote origin $sha | grep -q $sha && echo "ok $name" || echo "FAIL $name $sha not on remote"'
```

Any `FAIL` line means: `cd <submodule> && git checkout -B main && git push origin main` before
tagging.

> **Incident note (2026-06, v0.6.4, upstream).** `marketplace/workflows/native/workflow.md` was
> edited and pointer-bumped in the main repo, but the submodule itself was never pushed. The tag went
> out and CI died at checkout with `fatal: remote error: upload-pack: not our ref <SHA>`. The failure
> mode is invisible from main-repo `git status` (the submodule is "clean" locally), which is why the
> verify step above is mandatory and not advisory.

### Contract: the pre-release sweep MUST exclude `.trellis/`

The pre-release `git add` in `release.js` (the `chore: pre-release updates` commit) **must** exclude
`.trellis/` from its pathspec, alongside `docs-site` and `marketplace`:

```js
run("git add -A -- ':!docs-site' ':!marketplace' ':!.trellis'");
```

`.trellis/tasks/` is not gitignored, so a blanket `git add -A` sweeps in any dirty in-progress task
dirs, workspace journal drafts, and runtime artifacts present in the release session. Staging
`.trellis/` is only ever allowed through `common/safe_commit.py`'s precise allowlist (see the
"unscoped `.trellis` staging" bug class in `script-conventions.md`) — never through a release-time
blanket stage.

> **Incident note (2026-06, #303).** A `release.js` pre-release `git add -A` that excluded only
> `docs-site`/`marketplace` swept 6 unrelated in-progress community-governance task files into the
> pre-release commit twice (`5ee43ecc`, `ec123deb`). The maintainer had to `git rm --cached` three
> times (`d66405d9`, `81960120`, `3c3219cf`) before finally tracking the drafts to stop the bleed
> (`e83233c9`). The same staging-scope defect also lives in `add_session.py` and in ad-hoc human/AI
> `git add -A`. This contract exists so the release route can never re-open that escape hatch. See
> `script-conventions.md` → "Absolute prohibition: never blanket-stage".

---

## Artifact verification for release-claimed assets

Any doc, changelog, or spec that says a feature is "bundled", "installed automatically", or "included
with Trellis" must be verified against the **built output**, not only against the source tree. Source
existing under `packages/cli/src/templates/` is not evidence that `copy-templates` carried it into
`dist/`, and `dist/` is what the symlinked global command actually runs.

Before tagging a release that adds or changes a bundled template, skill, workflow, hook, script, or
generated platform asset:

1. Build the CLI.
2. Confirm the expected `dist/templates/**` paths exist.
3. Use the built entrypoint in a fresh temp git repository and run the user-facing command that
   should install the asset.
4. Check both the generated files and `.trellis/.template-hashes.json` for the expected paths.
5. Run `trellis update --dry-run` from the temp repository and confirm it reports "already up to
   date" — this is what catches an init-write / update-collect byte mismatch.

Example for a built-in multi-file skill:

```bash
pnpm --filter trellis-enhance build

test -f packages/cli/dist/templates/common/bundled-skills/<skill>/SKILL.md

tmpdir=$(mktemp -d /tmp/trellis-release-smoke-XXXXXX)
printf '{"name":"trellis-smoke","version":"0.0.0"}\n' > "$tmpdir/package.json"
git -C "$tmpdir" init -q
(
  cd "$tmpdir"
  node /Users/suool/git/Trellis/packages/cli/dist/cli/index.js init -u smoke --yes --claude --codex
  test -f .claude/skills/<skill>/SKILL.md
  test -f .agents/skills/<skill>/SKILL.md
  grep -q '<skill>' .trellis/.template-hashes.json
  node /Users/suool/git/Trellis/packages/cli/dist/cli/index.js update --dry-run
)
```

---

## Pre-release checklist

- [ ] Worktree is clean except intentional release changes.
- [ ] Relevant coding specs have been read.
- [ ] Manifest exists for the target version.
- [ ] Submodule commits are pushed before main-repo pointer commits (if any moved).
- [ ] `node packages/cli/scripts/release-preflight.js check-versions` passes.
- [ ] Release-claimed bundled assets are verified in `dist/` plus a fresh temp-directory
      `trellis init` / `trellis update --dry-run` smoke test.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass or the blocker is recorded.
- [ ] Breaking releases include `migrationGuide` and `aiInstructions` in the manifest.
- [ ] No `npm publish` was run and no publish workflow was reintroduced.

---

## Cross-references

- Core/CLI code ownership and package boundaries: `trellis-core-sdk.md`
- Manifest format and migration types: `migrations.md`
- CLI upgrade contract (self-hosted, no npm): `commands-upgrade.md`
- Native dependency policy: `quality-guidelines.md`
- Install / dev-loop model: `CLAUDE.md` → "How install works"
