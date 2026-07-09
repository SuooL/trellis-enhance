# Retire stale publish.yml

## Goal
Remove `.github/workflows/publish.yml`. It publishes the package to npm on release,
but trellis-enhance is self-maintained and installed via git symlink (not npm), so
the workflow is stale/misleading (it would publish `trellis-enhance` to npm).

## Requirements
- Delete `.github/workflows/publish.yml`.
- Confirm nothing references it.

## Acceptance Criteria
- [ ] `.github/workflows/publish.yml` gone.
- [ ] `ci.yml` (main) + `ci-dev.yml` + `prune-branches.yml` remain intact.
- [ ] No dangling references.

## Out of Scope
- Touching ci.yml / ci-dev.yml / release flow.
