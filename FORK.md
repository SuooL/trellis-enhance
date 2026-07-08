# FORK.md — Trellis-Enhance (SuooL's self-maintained Trellis)

> **`trellis-enhance`** — my own, self-maintained product, forked from
> [Trellis](https://github.com/mindfold-ai/Trellis). The npm package is renamed to `trellis-enhance`
> (the command stays `trellis` / `tl`), and it does **not** track or phone the upstream npm package —
> `trellis update` refreshes projects purely from this CLI's own templates. `upstream` is kept only as a
> git remote for occasional manual comparison.
> This document is the development record + maintenance guide. Auto-loaded quick context: [`CLAUDE.md`](./CLAUDE.md).

---

## 1. What this is & why

Trellis is an engineering-workflow framework for AI coding: it persists specs/tasks/memory into a
repo and injects the right context into each AI session. Upstream ships sensible defaults, but I
wanted **my own opinionated defaults** to be what `trellis init` produces — without re-customizing
every project by hand.

This fork changes the **CLI's templates + configurators** (`packages/cli/src/…`), so the built CLI
generates my customized workflow into every project I init. Install once,
then `trellis init` anywhere gets:

- model-routed sub-agents (Opus writes, Codex reviews),
- a cross-model adversarial-review capability,
- extra workflow states for real-life flow,
- and a ready-made Git branching + GitHub Actions CI/CD standard.

## 2. Branch & remote model

This repo is **standalone** (not a GitHub fork) and follows trellis-enhance's own git-workflow standard:

| Branch / remote | Role |
|---|---|
| `main` (origin) | Product / release line. **Default branch.** |
| `dev` (origin) | Integration branch — feature work lands here first. |
| `feature/<task-slug>` | Per-task development (created off `dev` by the `git_branch.py` hook). Flow: `feature` → PR → `dev` → `main`. |
| `upstream` = `mindfold-ai/trellis` | Kept only for occasional manual comparison. |

**Install (personal use):**
```bash
npm i -g 'git+https://github.com/SuooL/trellis-enhance.git'   # installs the default branch (main)
```
(For local dev the symlink model in §4 is the maintained path — no reinstall.)

**Compare with upstream when I want (manual, not automatic):**
```bash
git fetch upstream
git log --oneline upstream/main ^main                     # commits upstream has that main doesn't
git diff upstream/main main -- packages/cli/src/templates  # how my defaults differ from upstream
# cherry-pick anything worthwhile onto a feature branch → dev → main.
```

## 3. Customizations (the catalog)

Everything lives under `packages/cli/src/templates/…` (+ two configurator files). The list of
changed files vs upstream is the source of truth: `git fetch upstream && git diff --name-status upstream/main main`.

### 3.1 Sub-agent model routing
- **implement = Opus 4.8** — strongest coder writes the code. (`templates/claude/agents/trellis-implement.md`, `model: opus`)
- **research = Sonnet** — fast/cheap for search+persist; also given the `mcp__codex__codex` tool so it can pull a **cross-model second opinion** on genuinely hard research topics. (`…/trellis-research.md`)
- **check = cross-model (Codex GPT-5.5, effort xhigh)** — see below. (`…/trellis-check.md`)

**Why:** different models catch different bug classes. Letting Opus write and a *different* model (GPT-5.5) review is a deliberate diversity play, not redundancy.

### 3.2 Cross-model `trellis-check` (Design 1)
`trellis-check` stays a Claude Code sub-agent (so it still receives Trellis's hook-injected diff/spec
context), but its job is to **delegate the actual review reasoning to Codex GPT-5.5** via
`mcp__codex__codex` (`model: gpt-5.5`, `config.model_reasoning_effort: xhigh`, `sandbox: read-only`),
then verify + apply the fixes itself. Falls back to native Claude self-review if Codex is unreachable.

> **Key enabler:** the fork adds `mcp__codex__codex` to the check agent's `tools:`, so even when
> dispatched as a sub-agent it can call Codex directly.
> **Constraint:** a Claude Code sub-agent's `model:` only accepts Claude models — you *cannot* set it
> to a GPT model. Cross-model work must go through delegation (the Codex plugin), not `model:`.

### 3.3 Custom workflow states
Added `needs-rework`, `blocked`, `deploying`. Each custom state needs **three things in sync**
(this is a hard contract):
1. a `[workflow-state:<name>]` breadcrumb block in `templates/trellis/workflow.md` (open/close tags must match exactly),
2. a routing branch in `templates/common/commands/continue.md` (Step 3),
3. a **writer** — the new `task.py set-status <dir> <status>` command (impl: `cmd_set_status` in `task_store.py`, with charset validation + an unknown-status hint).

### 3.4 Question / adversarial-review
On-demand, multi-role **critical + constructive** review of any target (plan / design / code / question),
run as **two independent expert panels** — one on **Opus 4.8**, one on **Codex GPT-5.5 (high)** — whose
**divergences are foregrounded** (a point one model raises but the other misses is usually the real issue).
Roles are user-specified or auto-discovered. Output is a persisted report.

- Skill (keyword-triggered): `templates/common/skills/adversarial-review.md` → generates `trellis-adversarial-review/SKILL.md`.
- Command (explicit): `templates/common/commands/question.md` → `/trellis:question`.
- **Required wiring:** the skill's auto-trigger description must be registered in `SKILL_DESCRIPTIONS`
  in `packages/cli/src/configurators/shared.ts`, or `wrapWithSkillFrontmatter` throws at build/render.

### 3.5 Git branching + CI/CD standard (always generated)
Every `trellis init` now also writes a complete Git workflow standard:

- **Branch model:** `main` = release (fixed big versions only, no per-feature deploy) · `dev` =
  integration + **continuous deploy to prod** · `feature/<task-slug>` = development (hotfix too).
- **Flow:** `feature` → PR → `dev` → CI → auto-merge + branch cleanup; `dev` → deploy prod.
- **CI gate (`ci.yml`):** build + tests + **diff-coverage ≥ 80%** (new/changed lines) → GitHub native
  auto-merge (`--squash`, head-commit-pinned). Requires branch protection with the `verify` check.
- **Deploy (`deploy.yml`):** push to `dev`, gated by `vars.DEPLOY_ENABLED`, SSH/rsync to a cloud
  server via secrets (`DEPLOY_HOST/USER/KEY/PATH`).
- **Release (`release.yml`):** manual `workflow_dispatch` (choose major/minor) → merge dev→main,
  tag `vX.Y.Z`, changelog (via `--notes-file`, injection-safe), GitHub Release.
- **Prune (`prune-branches.yml`):** weekly; deletes `feature/*` branches whose PR is merged into `dev`
  (uses `gh pr list --state merged`, because squash-merge breaks ancestry checks).
- **Branch lifecycle hook** (`scripts/hooks/git_branch.py`, always included, safe-skips on non-git):
  `after_create` creates `feature/<slug>` **off `dev`** and defaults `base_branch=dev`; `after_archive`
  deletes the local branch once merged.
- Sources: `templates/git-workflow/{spec,workflows}/…`, wired via `templates/git-workflow/index.ts`,
  `configurators/workflow.ts`, `templates/trellis/index.ts`.

## 4. Build, verify, ship

**Install model = symlink; rebuild = live; never reinstall.** The global `trellis` / `tl` is symlinked to
this repo's build (`/opt/homebrew/bin/trellis → …/packages/cli`), so it runs whatever is currently built
here. The dev loop is just edit → build:

```bash
cd /Users/suool/git/Trellis                   # on a feature/* branch (or dev)
# ...edit packages/cli/src/...
pnpm --filter trellis-enhance build           # tsc + copy-templates → dist/ ; global `trellis` now updated
pnpm --filter trellis-enhance typecheck
pnpm --filter trellis-enhance test            # see note below

# Smoke-test the generated output end-to-end:
d=$(mktemp -d); ( cd "$d" && git init -q \
  && node /Users/suool/git/Trellis/packages/cli/dist/cli/index.js init --claude -y -u tester )
# expect: agents carry model:, workflow.md has the 3 custom states, question skill+command,
#         git_branch.py hook, task.py set-status, .github/workflows/*, spec/tech/git-workflow.md
```

- ⚠️ Global CLI = "current checked-out branch + last build here". `git checkout main` + build → temporarily
  loses customizations; switch back to `custom` + rebuild to restore.
- 🔁 Re-link only if the symlink is ever removed: `cd packages/cli && pnpm link --global`. (The
  `@mindfoldhq/trellis → trellis-enhance` rename did not need a relink — the bin symlink resolves by path.)
- ✋ No `npm i -g` for local dev. A from-scratch git-install (`npm i -g 'git+…trellis-enhance.git'`, default branch `main`) is a fallback for
  *other* machines, but note the CLI depends on `@mindfoldhq/trellis-core` via `workspace:*`, so a clean
  external install may need adjustment — the symlink model above is the maintained path.

**Test note:** `test/templates/trellis.test.ts` has **2 pre-existing failures** (missing
`marketplace/workflows/{native,tdd}/workflow.md`). These files aren't tracked in the repo; the
failures exist on a clean upstream clone too and are **unrelated to this fork's changes**. Everything
else (1298 tests) passes.

## 5. Provenance / how it was built

1. **Phase A — prototype** in a separate consumer project (`/Users/suool/git/cc2cx`): built and
   *actually tested* every customization against real Claude + Codex calls. Archived task records
   (full PRDs, research, design decisions) live in `cc2cx/.trellis/tasks/archive/2026-07/`:
   `07-08-customize-workflow`, `07-08-git-workflow-standard`, `07-08-phase-b-fork-port`.
2. **Phase B — port** into this fork's templates/configurators; built; smoke-tested `trellis init`
   (15/15 artifacts present).
3. A **cross-model dogfood review** (the new `trellis-check` via Codex GPT-5.5 xhigh) was run on the
   git-workflow files and caught **4 blockers + 2 majors** — e.g. a `release.yml` shell-injection via
   commit subject, a CI auto-merge race, and a `prune-branches.yml` that was a no-op because squash-merge
   breaks ancestry checks. All fixed before shipping.

## 6. Gotchas for future me

- Working on trellis-enhance? Do it on a **`feature/*`** branch → PR to **`dev`** → **`main`** (its own git-workflow standard). Don't commit straight to `main`.
- Adding a new common skill → **register its description in `SKILL_DESCRIPTIONS` (shared.ts)** or the build throws.
- Adding a custom state → wire **all three** places (workflow.md block + continue.md route + a status writer).
- Editing a per-platform-rendered template → keep the init-write and update-collect paths byte-identical (`configurator-shared.md`).
- Cross-model = **delegation** (`mcp__codex__codex`), never a `model:` value on a Claude sub-agent.
- `trellis-adversarial-review` is general review; `trellis-check` is the task-internal code gate on a diff. Don't conflate.
</content>
