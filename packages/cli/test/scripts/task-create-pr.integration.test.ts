/**
 * Integration tests for `task.py create-pr`.
 *
 * The python lives under
 * `src/templates/trellis/scripts/common/task_store.py`; this test stamps the
 * templates into a fresh git repo and exercises the real
 * `python3 task.py create-pr` path.
 *
 * `create-pr` owns the `git push` step that Phase 3.4 forbids and Phase 3.5
 * requires, so its *refusal* paths matter as much as its happy path: a wrong
 * branch or a missing `gh` must produce actionable output rather than a
 * traceback or a surprise push.
 *
 * Every case here is offline — only `--dry-run` and the pre-flight refusals are
 * exercised, so nothing ever reaches a remote.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEMPLATE_SCRIPTS = path.resolve(
  __dirname,
  "../../src/templates/trellis/scripts",
);

function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function which(cmd: string): string | null {
  const r = spawnSync("which", [cmd], { encoding: "utf-8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (rc=${r.status}): ${r.stderr}`,
    );
  }
  return r.stdout.trim();
}

function setupRepo(tmp: string): void {
  fs.mkdirSync(tmp, { recursive: true });
  git(tmp, "init", "-q", "-b", "dev");
  git(tmp, "config", "user.email", "test@example.com");
  git(tmp, "config", "user.name", "Test");

  const scriptsDest = path.join(tmp, ".trellis", "scripts");
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, scriptsDest, { recursive: true });

  fs.writeFileSync(path.join(tmp, ".trellis", "config.yaml"), "\n");
  fs.writeFileSync(path.join(tmp, "README.md"), "seed\n");
  git(tmp, "add", "-A");
  git(tmp, "commit", "-q", "-m", "initial");
}

interface TaskOpts {
  branch?: string | null;
  baseBranch?: string | null;
  title?: string;
  goal?: string;
}

function makeTask(repo: string, name: string, opts: TaskOpts = {}): void {
  const dir = path.join(repo, ".trellis", "tasks", name);
  fs.mkdirSync(dir, { recursive: true });

  const goal = opts.goal ?? "Ship the thing.";
  fs.writeFileSync(
    path.join(dir, "prd.md"),
    `# ${name}\n\n## Goal\n\n${goal}\n\n## Requirements\n\n- TBD\n`,
  );

  const task: Record<string, unknown> = {
    id: name,
    name,
    title: opts.title ?? name,
    status: "in_progress",
    priority: "P2",
    createdAt: "2026-07-27",
    assignee: "test",
    creator: "test",
    subtasks: [],
    children: [],
    relatedFiles: [],
    meta: {},
  };
  if (opts.branch !== null) task.branch = opts.branch ?? `feature/${name}`;
  if (opts.baseBranch !== null) task.base_branch = opts.baseBranch ?? "dev";

  fs.writeFileSync(
    path.join(dir, "task.json"),
    JSON.stringify(task) + "\n",
  );
}

function runCreatePr(
  repo: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): { status: number | null; out: string } {
  const r = spawnSync(
    "python3",
    [".trellis/scripts/task.py", "create-pr", ...args],
    { cwd: repo, encoding: "utf-8", env: env ?? process.env },
  );
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/**
 * A PATH containing only `python3` and `git` — used to prove the missing-`gh`
 * branch is reached deterministically, whether or not the host has `gh`.
 */
function pathWithoutGh(tmp: string): NodeJS.ProcessEnv {
  const fakeBin = path.join(tmp, "fake-bin");
  fs.mkdirSync(fakeBin, { recursive: true });
  for (const cmd of ["python3", "git"]) {
    const real = which(cmd);
    if (real) fs.symlinkSync(real, path.join(fakeBin, cmd));
  }
  return { ...process.env, PATH: fakeBin };
}

describe.skipIf(!hasPython())("task.py create-pr", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-create-pr-test-"));
    setupRepo(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("dry-run previews push + gh without touching the remote", () => {
    makeTask(tmp, "my-task", { title: "My task", goal: "Ship the thing." });
    git(tmp, "switch", "-q", "-c", "feature/my-task");

    const { status, out } = runCreatePr(tmp, ["my-task", "--dry-run"]);

    expect(status).toBe(0);
    expect(out).toContain("git push -u origin feature/my-task");
    expect(out).toContain("gh pr create");
    expect(out).toContain("--base dev");
    expect(out).toContain("--head feature/my-task");
    expect(out).toContain("My task");
    // The PRD's Goal section becomes the PR body.
    expect(out).toContain("Ship the thing.");
    // Dry run must not create a remote-tracking ref.
    expect(git(tmp, "branch", "-r")).toBe("");
  });

  it("omits --body when the PRD goal is still the unfilled skeleton", () => {
    makeTask(tmp, "seed-task", { goal: "TBD." });
    git(tmp, "switch", "-q", "-c", "feature/seed-task");

    const { status, out } = runCreatePr(tmp, ["seed-task", "--dry-run"]);

    expect(status).toBe(0);
    expect(out).not.toContain("--body");
  });

  it("refuses when checked out on a different branch than the task's", () => {
    makeTask(tmp, "other-task");
    // Still on `dev`, task branch is feature/other-task.

    const { status, out } = runCreatePr(tmp, ["other-task"]);

    expect(status).toBe(1);
    expect(out).toContain("dev");
    expect(out).toContain("feature/other-task");
    expect(out).toContain("git switch");
    expect(out).not.toContain("Traceback");
  });

  it("refuses when the task has no branch recorded", () => {
    makeTask(tmp, "branchless", { branch: null });

    const { status, out } = runCreatePr(tmp, ["branchless"]);

    expect(status).toBe(1);
    expect(out).toContain("set-branch");
    expect(out).not.toContain("Traceback");
  });

  it("refuses when the task has no base branch recorded", () => {
    makeTask(tmp, "baseless", { baseBranch: null });
    git(tmp, "switch", "-q", "-c", "feature/baseless");

    const { status, out } = runCreatePr(tmp, ["baseless"]);

    expect(status).toBe(1);
    expect(out).toContain("set-base-branch");
    expect(out).not.toContain("Traceback");
  });

  it("prints copy-pasteable commands instead of dead-ending when gh is absent", () => {
    makeTask(tmp, "no-gh-task");
    git(tmp, "switch", "-q", "-c", "feature/no-gh-task");

    const { status, out } = runCreatePr(tmp, ["no-gh-task"], pathWithoutGh(tmp));

    expect(status).toBe(1);
    expect(out).toContain("gh");
    // The whole point: the user can still finish the job by hand.
    expect(out).toContain("git push -u origin feature/no-gh-task");
    expect(out).toContain("gh pr create");
    expect(out).not.toContain("Traceback");
    // Refusing must not have pushed anything.
    expect(git(tmp, "branch", "-r")).toBe("");
  });

  it("refuses outside a git repository", () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-nogit-"));
    try {
      fs.mkdirSync(path.join(bare, ".trellis"), { recursive: true });
      fs.cpSync(TEMPLATE_SCRIPTS, path.join(bare, ".trellis", "scripts"), {
        recursive: true,
      });
      makeTask(bare, "orphan");

      const { status, out } = runCreatePr(bare, ["orphan"]);

      expect(status).toBe(1);
      expect(out).toContain("git repository");
      expect(out).not.toContain("Traceback");
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });
});
