#!/usr/bin/env python3
"""Git branch lifecycle hook for Trellis tasks.

Implements the three-branch model (see .trellis/spec/tech/git-workflow.md):
creates a `feature/<task-slug>` branch when a task is created, and deletes the
local feature branch once it has merged into `dev`.

Usage (called automatically by task.py hooks via config.yaml):
    python3 .trellis/scripts/hooks/git_branch.py create
    python3 .trellis/scripts/hooks/git_branch.py cleanup

Environment:
    TASK_JSON_PATH  - Absolute path to task.json (set by task.py)

Design notes:
    - The hook is invoked with cwd = repo root (see task_utils.run_task_hooks).
    - It NEVER fails the lifecycle event: non-git repos, already-set branches,
      or git errors are warned about and exit 0. Hook failures would otherwise
      only print a warning upstream, but we keep the contract explicit here.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

# The integration branch every feature PR targets.
DEV_BRANCH = "dev"

# Leading Trellis date prefix on task names/slugs, e.g. "07-08-".
DATE_PREFIX_RE = re.compile(r"^\d{2}-\d{2}-")

# ─── Helpers ──────────────────────────────────────────────────────────────────


def _warn(msg: str) -> None:
    print(f"[git_branch] {msg}", file=sys.stderr)


def _read_task() -> tuple[dict, str] | None:
    path = os.environ.get("TASK_JSON_PATH", "")
    if not path:
        _warn("TASK_JSON_PATH not set — skipping")
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f), path
    except (OSError, json.JSONDecodeError) as e:
        _warn(f"could not read task.json ({e}) — skipping")
        return None


def _write_task(data: dict, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


# Bound on any single git invocation. `create`/`cleanup` call `git fetch`
# against a remote — without a timeout and with terminal prompts enabled, a
# stalled network or an interactive credential/host-key prompt could hang the
# lifecycle event indefinitely, which is worse than the "never fail" contract
# this hook otherwise upholds (a bounded failure is recoverable; a hang isn't).
_GIT_TIMEOUT_SECONDS = 15


def _git(*args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    try:
        return subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=_GIT_TIMEOUT_SECONDS,
            env=env,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        _warn(f"git {' '.join(args)} failed to run ({e}) — treating as failure")
        return subprocess.CompletedProcess(args, returncode=1, stdout="", stderr=str(e))


def _is_git_repo() -> bool:
    result = _git("rev-parse", "--is-inside-work-tree")
    return result.returncode == 0 and result.stdout.strip() == "true"


def _slug(name: str) -> str:
    """Derive the feature-branch slug from a task name/slug.

    Strips the leading `MM-DD-` Trellis date prefix if present.
    """
    return DATE_PREFIX_RE.sub("", name.strip())


def _local_branch_exists(branch: str) -> bool:
    result = _git("rev-parse", "--verify", "--quiet", f"refs/heads/{branch}")
    return result.returncode == 0


def _remote_branch_ref(branch: str) -> str | None:
    """Return `origin/<branch>` if that remote-tracking ref exists, else None."""
    result = _git(
        "rev-parse", "--verify", "--quiet", f"refs/remotes/origin/{branch}"
    )
    return f"origin/{branch}" if result.returncode == 0 else None


def _checkout_dev_base() -> str | None:
    """Best-effort switch to an up-to-date `DEV_BRANCH` before branching off it.

    Feature branches are meant to fork from `dev`, not from whatever happens
    to be checked out when the task is created. Tries, in order: fetch the
    latest `origin/dev` and switch to (or create tracking) local `dev`. If
    there's no `dev` anywhere yet (fresh repo, no remote), returns None and
    the caller falls back to branching from the current HEAD.
    """
    _git("fetch", "origin", DEV_BRANCH)  # best-effort; ignore failures (no remote, offline)

    remote_dev = _remote_branch_ref(DEV_BRANCH)
    if _local_branch_exists(DEV_BRANCH):
        switch = _git("switch", DEV_BRANCH)
        if switch.returncode != 0:
            return None
        # Fast-forward local dev to match origin/dev when possible; never
        # force it (avoid discarding local work). Must run only after
        # switching onto dev, else it would merge into whatever branch was
        # previously checked out. Best-effort: ignore failure (e.g. diverged
        # local dev) and branch off whatever dev currently points to.
        if remote_dev:
            _git("merge", "--ff-only", remote_dev)
        return DEV_BRANCH

    if remote_dev:
        switch = _git("switch", "-c", DEV_BRANCH, remote_dev)
        return DEV_BRANCH if switch.returncode == 0 else None

    return None


def _is_merged_into(branch: str, target: str) -> bool:
    """True if `branch` is already merged into `target`.

    Checks against the freshest ref we have for `target` — `origin/<target>`
    if a fetch succeeds, else the local branch — since a stale local `dev`
    could otherwise make an actually-merged branch look unmerged.

    Known limitation: this is an ancestry check, so it only detects regular
    (non-squash) merges. `ci.yml` auto-merges with `--squash`, which creates
    a new commit on `dev` that does not have the feature branch's commits as
    ancestors — a squash-merged branch will therefore *not* be detected as
    merged here and is safe-skipped (left for manual cleanup / the
    `prune-branches.yml` GitHub-side job, which checks merged-PR state
    instead of ancestry).
    """
    _git("fetch", "origin", target)  # best-effort; ignore failures

    ref = _remote_branch_ref(target) or (target if _local_branch_exists(target) else None)
    if ref is None:
        return False
    result = _git("branch", "--merged", ref)
    if result.returncode != 0:
        return False
    merged = {ln.strip().lstrip("* ").strip() for ln in result.stdout.splitlines()}
    return branch in merged


# ─── Actions ──────────────────────────────────────────────────────────────────


def cmd_create() -> None:
    task = _read_task()
    if task is None:
        return
    data, path = task

    if data.get("branch"):
        _warn(f"branch already set ({data['branch']}) — skipping create")
        return

    if not _is_git_repo():
        _warn("cwd is not a git repository — skipping branch creation")
        return

    name = data.get("name") or data.get("id") or ""
    slug = _slug(name)
    if not slug:
        _warn("task has no usable name/slug — skipping")
        return

    branch = f"feature/{slug}"

    if _local_branch_exists(branch):
        # Branch exists but task.json didn't record it; just switch + persist.
        switch = _git("switch", branch)
    else:
        # New branch: fork from an up-to-date `dev`, not from whatever is
        # currently checked out. If `dev` doesn't exist yet (fresh repo, no
        # remote), fall back to branching from the current HEAD.
        if _checkout_dev_base() is None:
            _warn(f"no {DEV_BRANCH} branch found — branching from current HEAD")
        switch = _git("switch", "-c", branch)

    if switch.returncode != 0:
        _warn(f"git switch failed ({switch.stderr.strip()}) — skipping")
        return

    data["branch"] = branch
    # Default the PR target to the integration branch when unset or still the
    # template default (`main`).
    if not data.get("base_branch") or data.get("base_branch") == "main":
        data["base_branch"] = DEV_BRANCH
    _write_task(data, path)
    print(f"[git_branch] created and switched to {branch} (base={data['base_branch']})")


def cmd_cleanup() -> None:
    task = _read_task()
    if task is None:
        return
    data, _ = task

    if not _is_git_repo():
        _warn("cwd is not a git repository — skipping cleanup")
        return

    branch = data.get("branch")
    if not branch:
        _warn("task has no branch recorded — nothing to clean up")
        return

    if not _local_branch_exists(branch):
        _warn(f"local branch {branch} does not exist — nothing to clean up")
        return

    if not _is_merged_into(branch, DEV_BRANCH):
        _warn(f"{branch} is not merged into {DEV_BRANCH} yet — safe-skip")
        return

    # Don't try to delete the branch we're currently on.
    current = _git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if current == branch:
        _git("switch", DEV_BRANCH)

    result = _git("branch", "-d", branch)
    if result.returncode != 0:
        _warn(f"could not delete {branch} ({result.stderr.strip()}) — skipping")
        return
    print(f"[git_branch] deleted local branch {branch} (merged into {DEV_BRANCH})")


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    actions = {
        "create": cmd_create,
        "cleanup": cmd_cleanup,
    }
    fn = actions.get(action)
    if fn:
        fn()
    else:
        _warn(f"unknown action: {action!r}; valid: {', '.join(actions)}")
        # Never fail the lifecycle event.
        sys.exit(0)
