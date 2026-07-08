# GitHub Actions — Git Workflow Standard

Scaffolding for the three-branch model (`main` = release, `dev` = integration +
continuous deploy, `feature/*` = development). See
`.trellis/spec/tech/git-workflow.md` for the full convention.

These workflows are **project-agnostic templates**. Search each file for
`# CUSTOMIZE` and plug in your project's build / test / coverage / restart
commands (defaults assume a Node project).

## Workflows

| File | Trigger | What it does |
|------|---------|--------------|
| `ci.yml` | PR → `dev` | Build + tests + diff-coverage ≥ 80% hard gate; enables auto-merge on green. |
| `deploy.yml` | push → `dev` | SSH/rsync deploy to production (opt-in via `DEPLOY_ENABLED`). |
| `release.yml` | manual (`workflow_dispatch`) | Merge `dev` → `main`, compute next `vX.Y.Z`, tag, changelog, GitHub Release. |
| `prune-branches.yml` | weekly cron + manual | Delete `feature/*` remote branches already merged into `dev`. |

## Required repository settings

Auto-merge and the merge gate only work if the repo is configured to enforce
them. Under **Settings**:

1. **General → Pull Requests**
   - Enable **Allow auto-merge** (required for `ci.yml`'s auto-merge step).
   - Enable **Automatically delete head branches** (delete-branch-on-merge).

2. **Branches → Branch protection rules** for **`dev`** *and* **`main`**:
   - **Require a pull request before merging.**
   - **Require status checks to pass before merging** → add the CI job
     **`verify`** (from `ci.yml`) as a **required** check for `dev`.
     Without a required check, auto-merge would merge without waiting for CI.
   - Recommended: require branches to be up to date before merging.

## Required secrets / variables

Set these under **Settings → Secrets and variables → Actions**.

### Variables

| Name | Used by | Meaning |
|------|---------|---------|
| `DEPLOY_ENABLED` | `deploy.yml` | Set to `true` to enable production deploy on push to `dev`. Absent/other value = deploy skipped. |

### Secrets (only needed if `DEPLOY_ENABLED=true`)

| Name | Used by | Meaning |
|------|---------|---------|
| `DEPLOY_HOST` | `deploy.yml` | Server hostname or IP. |
| `DEPLOY_USER` | `deploy.yml` | SSH user. |
| `DEPLOY_KEY` | `deploy.yml` | Private SSH key (PEM) for that user. |
| `DEPLOY_PATH` | `deploy.yml` | Absolute target directory on the server. |

`GITHUB_TOKEN` is provided automatically by Actions; `ci.yml` (auto-merge),
`release.yml`, and `prune-branches.yml` use it — no manual setup needed.

## Diff-coverage gate

`ci.yml` uses [`diff-cover`](https://github.com/Bachmann1234/diff_cover) against
a Cobertura report as the default, language-agnostic patch-coverage gate
(threshold = 80%). Swap it for your stack's equivalent if preferred (Codecov
patch status, `undercover`, jest/vitest coverage thresholds, etc.). Make sure
your test step emits a coverage report in a format the gate can read.
