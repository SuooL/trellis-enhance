# `trellis upgrade` Command

How `trellis upgrade` tells the user to upgrade their `trellis-enhance` install.

`trellis-enhance` is **not published to any npm registry**. The global `trellis` / `tl` command is a
symlink into a source clone's build output, so "upgrading the CLI" means `git pull` + rebuild in that
clone — there is no package for a package manager to fetch. `trellis upgrade` is therefore a
**guidance command**: it prints the correct steps and exits. It never installs anything.

This command stays separate from `trellis update`:

- `trellis upgrade` tells you how to refresh the **CLI itself** (the source clone + its build).
- `trellis update` refreshes a **project's** bundled Trellis files under `.trellis/` and the platform
  directories, from the templates of whatever CLI build is currently linked.

---

## User-facing contract

```text
trellis upgrade
```

Behavior:

- Takes **no options**. The former `--tag <tag-or-version>` and `--dry-run` flags are removed: `--tag`
  selected an npm dist-tag / version that no longer exists, and `--dry-run` only made sense when the
  command had a side effect to suppress. This command is already side-effect-free.
- Never spawns `npm`, `pnpm`, or any other package manager, and never builds a shell command string.
- Prints the self-hosted upgrade sequence: pull the source clone, then rebuild so the symlinked global
  command reflects the new code:

  ```text
  cd <trellis-enhance clone>
  git pull
  pnpm install                          # only needed when dependencies changed
  pnpm --filter trellis-enhance build   # global `trellis` is now current
  ```

- States that the clone's husky `post-merge` / `post-checkout` hooks already rebuild automatically
  when product source changed, so the explicit `build` is a fallback for when the hook was skipped
  (e.g. dependencies not installed yet, or a build failure was reported).
- Exits zero. There is no failure path to model, because nothing external is invoked.

The command does not try to locate the user's clone, mutate it, run git on the user's behalf, or
detect how the symlink was created. Guidance only — driving someone else's source checkout from a CLI
that lives inside it is a footgun, not a feature.

---

## Reporting the current install

To let the user confirm which build is actually on PATH, the output also points at:

```text
trellis --version
which trellis   # POSIX
where trellis   # Windows
```

This catches the common case where the shell resolves an older `trellis` binary earlier on PATH than
the symlink into the clone, which makes a successful rebuild look like it did nothing.

---

## Update hints

Any user-facing hint that previously said:

```text
npm install -g @mindfoldhq/trellis@latest
```

must not be reintroduced — the package does not exist. Hints should point to `trellis upgrade`
instead. This applies to CLI startup warnings, `trellis update` downgrade guidance, and session-start
update hints.

There is also no "latest version" to compare against: `getLatestNpmVersion()` in
`commands/update.ts` returns `null` unconditionally and never contacts a registry. Update hints
compare the project's `.trellis/.version` against the linked CLI's own version only.

---

## Test requirements

- Running the command produces guidance output and spawns no child process.
- No option parsing for `--tag` / `--dry-run` (they are not accepted).
- Output names the clone-pull + rebuild steps and the `trellis --version` / `which trellis` check.

---

## Cross-references

- Install and dev-loop model: `CLAUDE.md` → "How install works"
- Release model (no npm publish): `release-process.md`
- Project-file refresh semantics: `commands-update.md`
