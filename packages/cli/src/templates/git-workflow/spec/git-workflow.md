# Git Workflow Standard

> Three-branch model + PR-to-dev flow + "ship with tests" DoD.
> AI-executable conventions for every task in this project.

---

## Overview

This project uses a simplified three-branch model. Every task is developed on
its own `feature/*` branch, merged into `dev` via a reviewed + CI-gated pull
request, and released to `main` only at fixed milestones.

| Branch | Role | Deploy behavior |
|--------|------|-----------------|
| `main` | Release. Only major/minor version cuts land here (tag + GitHub Release). | No per-feature deploy. |
| `dev` | Integration. All feature work merges here. | **Continuous deploy to production** on push (per-project opt-in). |
| `feature/<task-slug>` | Feature / bugfix / hotfix development. PR target is always `dev`. | None. |

Flow:

```
feature/<slug>  →  PR  →  dev  →  CI (build + test + diff-cov ≥ 80%) green
                              →  auto-merge + delete branch
                              →  (dev) auto-deploy to production
                              →  [milestone] manual release: dev → main (tag + Release)
```

---

## Branching Rules

- **One branch per task.** Branch name is `feature/<task-slug>`, where
  `<task-slug>` is the Trellis task name **without** the leading `MM-DD-` date
  prefix (e.g. task `07-08-git-workflow-standard` → `feature/git-workflow-standard`).
- The `after_create` lifecycle hook (`git_branch.py create`) creates this branch
  automatically **only** when the working directory is a git repo and the task
  has no `branch` set yet. Non-git repos / already-set branches are safe-skipped.
- **PR target is always `dev`.** The `after_create` hook records this; you only
  need `task.py set-base-branch <task> <branch>` when targeting something else.
- **Never push directly to `dev` or `main`.** All changes reach `dev` through a
  PR; `main` only receives changes through the release workflow.
- `hotfix` work uses the same `feature/*` convention — there is no separate
  `release/` or `hotfix/` branch.
- After a feature PR merges into `dev`, the branch is deleted automatically
  (GitHub `delete-branch-on-merge` for the remote; `git_branch.py cleanup` for
  the local branch on `after_archive`).

---

## Definition of Done

- [ ] Code implements the prd's acceptance criteria.
- [ ] **New features ship with tests.** Any new/changed behavior has covering
      tests. This is enforced by CI as a **diff-coverage ≥ 80% hard gate** on the
      lines the PR adds or changes — a PR that lowers patch coverage below the
      threshold fails and cannot auto-merge.
- [ ] Build passes and the full test suite is green.
- [ ] The PR targets `dev`.

lint / type-check are informational signals, not hard merge gates (they may be
surfaced in CI but do not block auto-merge).

---

## Pre-Development Checklist

Before writing code for a task, confirm:

1. **On the right branch** — you are on `feature/<task-slug>`, not on `dev` /
   `main`. If the `after_create` hook was skipped (non-git repo at create time,
   or branch set later), create it manually:
   `git switch -c feature/<task-slug>` then `task.py set-branch <task> feature/<task-slug>`.
2. **Test plan exists** — you know which tests will cover the new behavior
   (the diff-coverage gate will reject under-tested diffs).

> PR target and base freshness used to be items 2 and 3 here. The `after_create`
> hook already records `dev` as the base and forks from an up-to-date `dev`, so
> asking you to re-verify them by hand was pure ceremony.

---

## Quality Check

Before opening / finalizing the PR to `dev`, verify:

| Check | Requirement |
|-------|-------------|
| Build | Passes locally. |
| Tests | Full suite green; new behavior is covered. |
| Scope | Only files required by this task changed. |

CI owns the rest. Diff coverage, the PR base, and "nothing was pushed straight
to `dev`" were all on this list, but they are decided on the server: the
coverage gate runs against the PR diff, `create-pr` reads the base from
`task.json`, and branch protection is what actually prevents a direct push.
Re-checking them by hand cost time and caught nothing — and diff coverage in
particular was unverifiable locally, since the tooling only exists in CI.

When all pass, open the PR with `task.py create-pr` (`--dry-run` previews it).
That command pushes the branch and opens the PR in one step — it is the only
point in the workflow where a push happens. CI runs on the PR to `dev`; on
green it auto-merges, the branch is deleted, and `dev` deploys to production
(if the project enabled deploy).

---

## Release (main)

`main` is cut manually at milestones via the `release.yml` GitHub Actions
workflow (`workflow_dispatch`): choose a `major` / `minor` bump, CI merges
`dev → main`, computes the next `vX.Y.Z` tag from the last tag, generates a
changelog, and creates a GitHub Release. There is no per-feature deploy from
`main`.

---

## CI / Automation Boundary

Trellis (the AI session) manages **local** git actions: creating the feature
branch, setting the PR base, opening the PR. It does **not** merge, deploy, or
release — those happen on GitHub in response to PR / push / dispatch events via
the workflows under `.github/workflows/`. Auto-merge depends on the repository
having branch protection with the CI check as a required status; see
`.github/workflows/README.md` for the required repo settings.

---

**Language**: All documentation should be written in **English**.
