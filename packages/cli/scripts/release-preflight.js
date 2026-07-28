#!/usr/bin/env node
/**
 * Release preflight for the `trellis-enhance` workspace.
 *
 * This fork is never published to a registry (see
 * `.trellis/spec/cli/backend/release-process.md`), so the only thing to verify
 * before tagging is that the version story is coherent:
 *
 *   1. `trellis-enhance` and `@mindfoldhq/trellis-core` carry the same
 *      `version`, and a git tag visible in the environment agrees with it.
 *   2. The CLI still reaches core through `workspace:*`, so this fork's
 *      `packages/core` can never be swapped for upstream's published package
 *      of the same name.
 *
 * Commands:
 *   check-versions [--require-tag]   Verify both of the above. Fails loudly;
 *                                    this is the one real release gate.
 *
 * The npm-era subcommands (`npm-tag`, `publish-plan`, `verify-packed-cli`,
 * `verify-npm`) were removed. They asserted facts about a registry this project
 * never writes to, and `publish-plan` went further: it queried npm for
 * `@mindfoldhq/trellis-core` — upstream's package, not this one — and reported
 * "already on npm / needs publish" based on the answer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const CORE_PKG = path.join(REPO_ROOT, "packages/core/package.json");
const CLI_PKG = path.join(REPO_ROOT, "packages/cli/package.json");
const ROOT_PKG = path.join(REPO_ROOT, "package.json");

const CORE_PKG_NAME = "@mindfoldhq/trellis-core";
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readVersions() {
  const core = readJSON(CORE_PKG);
  const cli = readJSON(CLI_PKG);
  return {
    coreName: core.name,
    coreVersion: core.version,
    cliName: cli.name,
    cliVersion: cli.version,
  };
}

function tagVersionFromEnv() {
  // GITHUB_REF for `push: tags: v*` looks like `refs/tags/v0.6.0`.
  // GITHUB_REF_NAME on `release.published` is the tag name.
  const ref = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || "";
  const m = ref.match(/(?:refs\/tags\/)?v(\d+\.\d+\.\d+(?:-[A-Za-z0-9.+-]+)?)$/);
  return m ? m[1] : null;
}

/**
 * The CLI must reach core through `workspace:*`, never a version range.
 *
 * `packages/core` is still named `@mindfoldhq/trellis-core`, and the upstream
 * project genuinely publishes that name. `workspace:*` makes pnpm link straight
 * to `packages/core`, so this fork's own code always wins. Replace it with an
 * exact version and pnpm becomes free to resolve *upstream's* core from the
 * registry instead — silently, because the package name matches.
 *
 * Every dependency field is checked, not just `dependencies`: moving the pin to
 * `devDependencies` reopens the same path. Overrides are read from the
 * workspace root, which is where pnpm honours `pnpm.overrides` / `resolutions`.
 *
 * Returns a reason string when the invariant is broken, or null when it holds.
 */
export function checkWorkspaceCoreDependency(cliPkg, rootPkg = {}) {
  for (const field of DEPENDENCY_FIELDS) {
    const range = cliPkg?.[field]?.[CORE_PKG_NAME];
    if (range !== undefined && !range.startsWith("workspace:")) {
      return `packages/cli sets ${field}["${CORE_PKG_NAME}"] to "${range}"`;
    }
  }
  const overrides = {
    ...(rootPkg?.pnpm?.overrides ?? {}),
    ...(rootPkg?.resolutions ?? {}),
  };
  for (const [key, range] of Object.entries(overrides)) {
    // Override keys are either a bare name or `name@range`.
    const targetsCore =
      key === CORE_PKG_NAME || key.startsWith(`${CORE_PKG_NAME}@`);
    if (!targetsCore) continue;
    if (typeof range === "string" && !range.startsWith("workspace:")) {
      return `the workspace root overrides "${key}" to "${range}"`;
    }
  }
  return null;
}

function fail(msg) {
  console.error(`${RED}x ${msg}${RESET}`);
  process.exit(1);
}

function checkVersions({ requireTag, quiet = false }) {
  const reason = checkWorkspaceCoreDependency(
    readJSON(CLI_PKG),
    readJSON(ROOT_PKG),
  );
  if (reason) {
    fail(
      `${reason}.\n` +
        `It must stay "workspace:*". Upstream publishes that same package name to\n` +
        `npm, so any version range can silently resolve to their core instead of\n` +
        `this repo's packages/core.`,
    );
  }
  const v = readVersions();
  if (v.coreVersion !== v.cliVersion) {
    fail(
      `Version mismatch:\n` +
        `  ${v.coreName}: ${v.coreVersion}\n` +
        `  ${v.cliName}:  ${v.cliVersion}\n` +
        `Both packages must share the exact same version. Re-run the release\n` +
        `bump script so they move together.`,
    );
  }
  const tagVersion = tagVersionFromEnv();
  if (requireTag) {
    if (!tagVersion) {
      fail(
        `Expected a git tag like v${v.cliVersion} via GITHUB_REF / GITHUB_REF_NAME but found "${
          process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || ""
        }".`,
      );
    }
    if (tagVersion !== v.cliVersion) {
      fail(
        `Git tag version (${tagVersion}) does not match package version (${v.cliVersion}).\n` +
          `Refusing to release: the tag, core package, and CLI package must agree.`,
      );
    }
  } else if (tagVersion && tagVersion !== v.cliVersion) {
    fail(
      `Git tag version (${tagVersion}) does not match package version (${v.cliVersion}).`,
    );
  }
  if (!quiet) {
    console.log(
      `${GREEN}ok${RESET} versions match: ${v.coreName}@${v.coreVersion} = ${v.cliName}@${v.cliVersion}` +
        (tagVersion ? ` = git tag v${tagVersion}` : ""),
    );
  }
  return { ...v, tagVersion };
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(
      `release-preflight <command>\n\n` +
        `commands:\n` +
        `  check-versions [--require-tag]\n`,
    );
    return;
  }
  if (cmd === "check-versions") {
    checkVersions({ requireTag: rest.includes("--require-tag") });
    return;
  }
  fail(`unknown command: ${cmd}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
