/**
 * Integration tests for the `after_create` branch hook's `base_branch` handling.
 *
 * `task.py create` seeds `base_branch` with whatever branch happens to be checked
 * out. That is right for projects that branch off their current work, but wrong
 * under this repo's three-branch model where every PR targets `dev`: creating a
 * few tasks back to back left each one pointing at the *previous* task's
 * `feature/*` branch, and `task.py create-pr` then opened the PR against a
 * sibling feature branch instead of `dev`.
 *
 * The hook forks from `dev`, so `dev` is the base — these tests pin that it says
 * so unconditionally, while still respecting a genuine fallback when no `dev`
 * branch exists.
 */

import { afterEach, describe, expect, it } from "vitest";
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

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
  return r.stdout.trim();
}

function setupRepo(tmp: string, withDev: boolean): void {
  fs.mkdirSync(tmp, { recursive: true });
  git(tmp, "init", "-q", "-b", withDev ? "dev" : "main");
  git(tmp, "config", "user.email", "test@example.com");
  git(tmp, "config", "user.name", "Test");

  fs.mkdirSync(path.join(tmp, ".trellis"), { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, path.join(tmp, ".trellis", "scripts"), {
    recursive: true,
  });
  fs.writeFileSync(path.join(tmp, "README.md"), "seed\n");
  git(tmp, "add", "-A");
  git(tmp, "commit", "-q", "-m", "initial");
}

/** Write a task.json the way `task.py create` does — base seeded from HEAD. */
function seedTask(repo: string, name: string, seededBase: string): string {
  const dir = path.join(repo, ".trellis", "tasks", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "task.json"),
    JSON.stringify({
      id: name,
      name,
      title: name,
      status: "planning",
      branch: null,
      base_branch: seededBase,
      subtasks: [],
      children: [],
    }) + "\n",
  );
  return dir;
}

function runHook(repo: string, taskDir: string): { status: number | null; out: string } {
  const r = spawnSync(
    "python3",
    [".trellis/scripts/hooks/git_branch.py", "create"],
    {
      cwd: repo,
      encoding: "utf-8",
      env: { ...process.env, TASK_JSON_PATH: path.join(taskDir, "task.json") },
    },
  );
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

function baseBranchOf(taskDir: string): string | undefined {
  return JSON.parse(
    fs.readFileSync(path.join(taskDir, "task.json"), "utf-8"),
  ).base_branch;
}

describe.skipIf(!hasPython())("git_branch.py create — base_branch", () => {
  let tmp: string;

  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("rewrites a sibling feature branch seed to dev", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-base-"));
    setupRepo(tmp, true);
    // Simulate creating a task while standing on another task's branch.
    git(tmp, "switch", "-q", "-c", "feature/previous-task");
    const taskDir = seedTask(tmp, "my-task", "feature/previous-task");

    const { out } = runHook(tmp, taskDir);

    expect(baseBranchOf(taskDir), out).toBe("dev");
  });

  it("still normalizes the legacy main seed to dev", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-base-"));
    setupRepo(tmp, true);
    const taskDir = seedTask(tmp, "main-seed", "main");

    runHook(tmp, taskDir);

    expect(baseBranchOf(taskDir)).toBe("dev");
  });

  it("records the branch it actually forked from", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-base-"));
    setupRepo(tmp, true);
    const taskDir = seedTask(tmp, "forked", "feature/whatever");

    runHook(tmp, taskDir);

    // The hook checks out `dev` before branching, so HEAD's parent is dev.
    expect(baseBranchOf(taskDir)).toBe("dev");
    expect(git(tmp, "branch", "--show-current")).toBe("feature/forked");
  });
});
