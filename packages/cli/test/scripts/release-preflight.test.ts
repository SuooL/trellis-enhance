/**
 * Unit tests for the two release invariants that have no other guard.
 *
 * Both helpers are pure and exported specifically so these can run without a
 * subprocess: `release.js` refuses to run anywhere but `main`, and
 * `release-preflight.js` refuses to let the CLI reach core through anything but
 * `workspace:*`. The last test runs the real gate against the real repo, so a
 * package.json edit that breaks the invariant fails CI rather than a release.
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

// @ts-expect-error - plain JS release script, not part of the typed src/ build
import { releaseBranchError } from "../../scripts/release.js";
// @ts-expect-error - plain JS release script, not part of the typed src/ build
import { checkWorkspaceCoreDependency } from "../../scripts/release-preflight.js";

const CORE = "@mindfoldhq/trellis-core";
const SCRIPTS = path.resolve(__dirname, "../../scripts");

describe("releaseBranchError", () => {
  it("allows main", () => {
    expect(releaseBranchError("main")).toBeNull();
  });

  it.each(["dev", "feature/some-task", "HEAD"])(
    "rejects %s and names the branch",
    (branch) => {
      const error = releaseBranchError(branch);
      expect(error).toContain(branch);
      expect(error).toContain("git switch main");
    },
  );
});

describe("checkWorkspaceCoreDependency", () => {
  it("accepts workspace protocol ranges", () => {
    expect(
      checkWorkspaceCoreDependency({ dependencies: { [CORE]: "workspace:*" } }),
    ).toBeNull();
    expect(
      checkWorkspaceCoreDependency({ dependencies: { [CORE]: "workspace:^" } }),
    ).toBeNull();
  });

  it("accepts a package that does not depend on core at all", () => {
    expect(checkWorkspaceCoreDependency({})).toBeNull();
    expect(checkWorkspaceCoreDependency({ dependencies: {} })).toBeNull();
  });

  // The whole point: upstream publishes this exact package name, so a version
  // range can resolve to their core instead of packages/core.
  it.each([
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ])("rejects an exact version pinned in %s", (field) => {
    const error = checkWorkspaceCoreDependency({ [field]: { [CORE]: "0.6.5" } });
    expect(error).toContain(field);
    expect(error).toContain("0.6.5");
  });

  it("rejects a caret range, not just exact versions", () => {
    expect(
      checkWorkspaceCoreDependency({ dependencies: { [CORE]: "^0.6.0" } }),
    ).toContain("^0.6.0");
  });

  it("rejects a root pnpm override that repins core", () => {
    const error = checkWorkspaceCoreDependency(
      { dependencies: { [CORE]: "workspace:*" } },
      { pnpm: { overrides: { [CORE]: "0.6.5" } } },
    );
    expect(error).toContain("overrides");
    expect(error).toContain("0.6.5");
  });

  it("rejects a root resolutions entry keyed name@range", () => {
    const error = checkWorkspaceCoreDependency(
      { dependencies: { [CORE]: "workspace:*" } },
      { resolutions: { [`${CORE}@^0.6.0`]: "0.6.5" } },
    );
    expect(error).toContain("0.6.5");
  });

  it("ignores overrides aimed at other packages", () => {
    expect(
      checkWorkspaceCoreDependency(
        { dependencies: { [CORE]: "workspace:*" } },
        { pnpm: { overrides: { "some-other-pkg": "1.2.3" } } },
      ),
    ).toBeNull();
  });
});

describe("check-versions gate", () => {
  it("passes against the current workspace", () => {
    const out = execFileSync("node", ["release-preflight.js", "check-versions"], {
      cwd: SCRIPTS,
      encoding: "utf-8",
      // A stray tag ref in the ambient env would be compared against the
      // package version and fail for reasons unrelated to this repo's state.
      env: { ...process.env, GITHUB_REF: "", GITHUB_REF_NAME: "" },
    });
    expect(out).toContain("versions match");
  });
});
