#!/usr/bin/env node
/**
 * Release orchestrator for the CLI + core pair.
 *
 * This fork publishes nothing: a release is a synchronized version bump plus a
 * `v<version>` tag on `main`. Work reaches `main` through the normal
 * `feature/*` -> `dev` -> `main` pull requests; this script runs afterwards, on
 * `main`, and turns the promoted commit into a tagged release:
 *
 *   branch guard -> manifest guard -> tests -> pre-release commit
 *   -> synchronized bump -> version check -> version commit -> tag -> push
 *
 * See `.trellis/spec/cli/backend/release-process.md` for the surrounding
 * promote-then-tag flow.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIR = path.resolve(__dirname, "..");

const RELEASE_TYPES = new Set(["patch", "minor", "major"]);
const RELEASE_BRANCH = "main";

function fail(message) {
  console.error(`x ${message}`);
  process.exit(1);
}

function run(command, options = {}) {
  execSync(command, {
    cwd: options.cwd ?? CLI_DIR,
    env: process.env,
    stdio: options.capture ? ["pipe", "pipe", "pipe"] : "inherit",
    encoding: "utf-8",
  });
}

function output(command, options = {}) {
  return execSync(command, {
    cwd: options.cwd ?? CLI_DIR,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function hasGitDiff() {
  try {
    execSync("git diff-index --quiet HEAD", {
      cwd: CLI_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return false;
  } catch {
    return true;
  }
}

/**
 * Every `v*` tag must be reachable from `main` ("Tag ancestry" in
 * release-process.md), and the release commits go straight onto the release
 * branch. Both hold only when `main` is the branch that is checked out.
 *
 * The previous code pushed the literal `main` ref rather than checking, so
 * running from `dev` tagged a dev commit while pushing whatever the stale local
 * `main` happened to point at. Refusing to run is the fix; the push target then
 * simply follows the checkout.
 */
export function releaseBranchError(branch) {
  if (branch === RELEASE_BRANCH) return null;
  return (
    `releases run on \`${RELEASE_BRANCH}\`, but \`${branch}\` is checked out.\n` +
    `Land the work on \`dev\`, promote it with a \`dev\` -> \`${RELEASE_BRANCH}\` PR, then:\n` +
    `  git switch ${RELEASE_BRANCH} && git pull && pnpm release`
  );
}

function assertOnReleaseBranch() {
  const error = releaseBranchError(output("git rev-parse --abbrev-ref HEAD"));
  if (error) fail(error);
}

function deleteLocalTag(tag) {
  try {
    run(`git tag -d "${tag}"`, { capture: true });
  } catch {
    // Already gone — nothing to clean up.
  }
}

/**
 * Push the release commits, then the single new tag.
 *
 * Never `--tags`: that pushes every local tag, and this clone carries the full
 * upstream tag history while `origin` has none of it.
 *
 * The two pushes fail differently and need different advice, so they are not
 * collapsed: before the branch lands, the whole release is still local and
 * retryable; after it lands, re-running the bump would burn a second version.
 */
function pushRelease(version) {
  const tag = `v${version}`;
  try {
    run(`git push origin ${RELEASE_BRANCH}`);
  } catch {
    deleteLocalTag(tag);
    fail(
      `pushing \`${RELEASE_BRANCH}\` failed; removed the local tag ${tag} so a retry starts clean.\n` +
        `The bump and version commits are still local and unpushed. Fix the cause, then reset\n` +
        `them (\`git reset --hard origin/${RELEASE_BRANCH}\`) before re-running \`pnpm release\` —\n` +
        `re-running on top of them bumps the version a second time.`,
    );
  }
  try {
    run(`git push origin "refs/tags/${tag}"`);
  } catch {
    fail(
      `\`${RELEASE_BRANCH}\` was pushed but the tag ${tag} was not.\n` +
        `Do NOT re-run \`pnpm release\` — the version commit already landed and a re-run\n` +
        `would bump again. Push the existing tag instead:\n` +
        `  git push origin "refs/tags/${tag}"`,
    );
  }
}

function main() {
  const [type = "patch"] = process.argv.slice(2);
  if (!RELEASE_TYPES.has(type)) {
    fail(`usage: release.js <patch|minor|major>`);
  }

  assertOnReleaseBranch();
  run("node scripts/check-manifest-continuity.js");
  run("pnpm --filter @mindfoldhq/trellis-core test");
  run("pnpm test");

  // Exclude .trellis/ from the pre-release sweep: dirty task/workspace files
  // (parallel in-progress work, runtime artifacts) must never be swept into
  // "chore: pre-release updates" (#303). Staging .trellis/ only ever goes
  // through safe_commit.py's precise allowlist, never a blanket `git add -A`.
  run("git add -A -- ':!docs-site' ':!marketplace' ':!.trellis'");
  if (hasGitDiff()) {
    run("git commit -m 'chore: pre-release updates'");
  }

  const version = output(`node scripts/bump-versions.js ${type}`);
  run("node scripts/release-preflight.js check-versions");
  run("git add package.json ../core/package.json");
  run(`git commit -m "${version}"`);
  run(`git tag "v${version}"`);
  pushRelease(version);

  console.log(
    `\nReleased v${version} — tagged on \`${RELEASE_BRANCH}\` and pushed. ` +
      `Nothing was published; the tag is the release artifact.`,
  );
}

// Guarded so tests can import the pure helpers without kicking off a release.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
