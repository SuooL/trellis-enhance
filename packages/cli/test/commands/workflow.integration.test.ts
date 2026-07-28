/**
 * Integration tests for `trellis workflow` and the init/update hash boundary
 * for non-native workflow selection.
 *
 * Coverage:
 * - `trellis workflow --template native`: writes bundled content, keeps hash.
 * - `trellis workflow --template tdd`: writes marketplace content, removes hash.
 * - `trellis init --workflow tdd`: marketplace content is written, hash removed.
 * - `trellis update` after switch to tdd does NOT silently restore native.
 * - Non-interactive modified workflow.md fails without --force / --create-new.
 * - `--create-new` writes `.new` and leaves workflow.md + hash untouched.
 * - `.trellis/.workflow-template` marker: written on non-native switch/init,
 *   cleared on switch back to native, and never rewritten by update.
 * - `trellis update` stops re-listing a non-native workflow.md as "Modified by
 *   you" on every run, while a native project still receives workflow.md updates.
 * - Codex `dispatch_mode` warning fires only for a non-native switch on a
 *   Codex-configured project with the knob still unset.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("figlet", () => ({
  default: { textSync: vi.fn(() => "TRELLIS") },
}));

vi.mock("inquirer", () => ({
  default: { prompt: vi.fn().mockResolvedValue({ proceed: true }) },
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockImplementation((cmd: string) => {
    const py = process.platform === "win32" ? "python" : "python3";
    return cmd === `${py} --version` ? "Python 3.11.12" : "";
  }),
}));

import { init } from "../../src/commands/init.js";
import { update } from "../../src/commands/update.js";
import { runWorkflowCommand, WorkflowCommandError } from "../../src/commands/workflow.js";
import { PATHS } from "../../src/constants/paths.js";
import { loadHashes } from "../../src/utils/template-hash.js";
import { workflowMdTemplate } from "../../src/templates/trellis/index.js";
import { replacePythonCommandLiterals } from "../../src/configurators/shared.js";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

/** TDD content stub returned by the marketplace fetch mock. */
const TDD_CONTENT = [
  "# TDD Workflow",
  "",
  "## Phase Index",
  "Phase 2.1 red → green → refactor.",
  "",
  "[workflow-state:in_progress]",
  "tdd in-progress breadcrumb",
  "[/workflow-state:in_progress]",
  "",
].join("\n");

function stubMarketplaceFetch(): void {
  const index = {
    version: 1,
    templates: [
      {
        id: "tdd",
        type: "workflow",
        name: "TDD Workflow",
        description: "red/green/refactor",
        path: "workflows/tdd/workflow.md",
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/index.json")) {
        return new Response(JSON.stringify(index), { status: 200 });
      }
      if (url.endsWith("workflows/tdd/workflow.md")) {
        return new Response(TDD_CONTENT, { status: 200 });
      }
      return new Response("", { status: 404 });
    }),
  );
}

describe("trellis workflow integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-workflow-int-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("init --workflow native keeps workflow.md hash-tracked", async () => {
    stubMarketplaceFetch();
    await init({ yes: true });

    const wfPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    expect(fs.existsSync(wfPath)).toBe(true);
    expect(fs.readFileSync(wfPath, "utf-8")).toBe(
      replacePythonCommandLiterals(workflowMdTemplate),
    );
    const hashes = loadHashes(tmpDir);
    expect(hashes[PATHS.WORKFLOW_GUIDE_FILE]).toBeTruthy();
  });

  it("init --workflow tdd writes marketplace content and removes the hash entry", async () => {
    stubMarketplaceFetch();
    await init({ yes: true, workflow: "tdd" } as Record<string, unknown>);

    const wfPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    const written = fs.readFileSync(wfPath, "utf-8");
    expect(written).toBe(replacePythonCommandLiterals(TDD_CONTENT));

    const hashes = loadHashes(tmpDir);
    expect(hashes[PATHS.WORKFLOW_GUIDE_FILE]).toBeUndefined();
  });

  it("init --workflow-source resolves custom workflow marketplace content", async () => {
    const index = {
      version: 1,
      templates: [
        {
          id: "custom",
          type: "workflow",
          name: "Custom Workflow",
          path: "workflows/custom/workflow.md",
        },
      ],
    };
    const customContent = "# Custom Workflow\n\n## Phase Index\nCustom phase.\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith("/index.json")) {
          return new Response(JSON.stringify(index), { status: 200 });
        }
        if (url.endsWith("workflows/custom/workflow.md")) {
          return new Response(customContent, { status: 200 });
        }
        return new Response("", { status: 404 });
      }),
    );

    await init({
      yes: true,
      workflow: "custom",
      workflowSource: "gh:example/workflows",
    } as Record<string, unknown>);

    const wfPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    expect(fs.readFileSync(wfPath, "utf-8")).toBe(
      replacePythonCommandLiterals(customContent),
    );
    expect(loadHashes(tmpDir)[PATHS.WORKFLOW_GUIDE_FILE]).toBeUndefined();
  });

  it("init --workflow missing-id rejects instead of exiting successfully", async () => {
    stubMarketplaceFetch();

    await expect(
      init({ yes: true, workflow: "missing-id" } as Record<string, unknown>),
    ).rejects.toThrow(/workflow template/i);
  });

  it("trellis workflow --template native refreshes hash after switching from tdd", async () => {
    stubMarketplaceFetch();
    await init({ yes: true, workflow: "tdd" } as Record<string, unknown>);
    expect(
      loadHashes(tmpDir)[PATHS.WORKFLOW_GUIDE_FILE],
    ).toBeUndefined();

    // Switching FROM a non-native workflow requires --force because the file
    // has no stored hash → the resolver conservatively flags it as "modified",
    // and non-interactive mode must not silently overwrite user content.
    await runWorkflowCommand({ template: "native", force: true });

    const wfPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    expect(fs.readFileSync(wfPath, "utf-8")).toBe(
      replacePythonCommandLiterals(workflowMdTemplate),
    );
    // Switching back to native re-tracks the hash so update() can manage it.
    expect(loadHashes(tmpDir)[PATHS.WORKFLOW_GUIDE_FILE]).toBeTruthy();
  });

  it("trellis workflow --template tdd writes marketplace content and removes the hash", async () => {
    stubMarketplaceFetch();
    await init({ yes: true });
    expect(loadHashes(tmpDir)[PATHS.WORKFLOW_GUIDE_FILE]).toBeTruthy();

    await runWorkflowCommand({ template: "tdd" });

    const wfPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    expect(fs.readFileSync(wfPath, "utf-8")).toBe(
      replacePythonCommandLiterals(TDD_CONTENT),
    );
    expect(loadHashes(tmpDir)[PATHS.WORKFLOW_GUIDE_FILE]).toBeUndefined();
  });

  it("non-interactive run with a locally-modified workflow.md fails without --force", async () => {
    stubMarketplaceFetch();
    await init({ yes: true });

    const wfPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    fs.writeFileSync(wfPath, "# My custom edits", "utf-8");

    // Simulate non-interactive shell.
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: false,
    });

    try {
      await expect(runWorkflowCommand({ template: "tdd" })).rejects.toThrow(
        WorkflowCommandError,
      );

      // File must remain untouched, and hash must not have been re-stamped.
      expect(fs.readFileSync(wfPath, "utf-8")).toBe("# My custom edits");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalIsTTY,
      });
    }
  });

  it("explicit --template run with a locally-modified workflow.md fails even when stdin is a TTY", async () => {
    stubMarketplaceFetch();
    await init({ yes: true });

    const wfPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    fs.writeFileSync(wfPath, "# My custom edits", "utf-8");

    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true,
    });

    try {
      await expect(runWorkflowCommand({ template: "tdd" })).rejects.toThrow(
        WorkflowCommandError,
      );
      expect(fs.readFileSync(wfPath, "utf-8")).toBe("# My custom edits");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalIsTTY,
      });
    }
  });

  it("--create-new writes .new file and never touches workflow.md or hash", async () => {
    stubMarketplaceFetch();
    await init({ yes: true });

    const wfPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    const originalContent = fs.readFileSync(wfPath, "utf-8");
    const originalHash = loadHashes(tmpDir)[PATHS.WORKFLOW_GUIDE_FILE];

    await runWorkflowCommand({ template: "tdd", createNew: true });

    const newPath = `${wfPath}.new`;
    expect(fs.existsSync(newPath)).toBe(true);
    expect(fs.readFileSync(newPath, "utf-8")).toBe(
      replacePythonCommandLiterals(TDD_CONTENT),
    );
    // Active workflow file and hash must both be untouched.
    expect(fs.readFileSync(wfPath, "utf-8")).toBe(originalContent);
    expect(loadHashes(tmpDir)[PATHS.WORKFLOW_GUIDE_FILE]).toBe(originalHash);
  });

  it("trellis update after switching to tdd does not silently restore native workflow", async () => {
    stubMarketplaceFetch();
    await init({ yes: true });
    await runWorkflowCommand({ template: "tdd" });

    const wfPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    const beforeUpdate = fs.readFileSync(wfPath, "utf-8");

    // Non-interactive skip on conflicts — update should treat the user's
    // workflow as "modified" (no hash) and skip writing native bytes over it.
    await update({ skipAll: true });

    const afterUpdate = fs.readFileSync(wfPath, "utf-8");
    expect(afterUpdate).toBe(beforeUpdate);
    expect(afterUpdate).not.toBe(
      replacePythonCommandLiterals(workflowMdTemplate),
    );
  });

  // ---------------------------------------------------------------------------
  // Active-workflow marker (.trellis/.workflow-template)
  //
  // Regression cover for the "trellis update re-prompts for workflow.md on
  // every run" bug: the hash entry is intentionally absent for a non-native
  // workflow, which analyzeChanges() read as "user modified it" — so update
  // asked overwrite/skip/create-new forever. The marker lets update drop the
  // file from the template set instead.
  // ---------------------------------------------------------------------------

  const markerPath = () => path.join(tmpDir, PATHS.WORKFLOW_TEMPLATE_FILE);

  it("switching to a non-native workflow records the active template id", async () => {
    stubMarketplaceFetch();
    await init({ yes: true });
    // Default native init leaves no marker — absence means native.
    expect(fs.existsSync(markerPath())).toBe(false);

    await runWorkflowCommand({ template: "tdd" });
    expect(fs.readFileSync(markerPath(), "utf-8").trim()).toBe("tdd");
  });

  it("switching back to native clears the marker", async () => {
    stubMarketplaceFetch();
    await init({ yes: true, workflow: "tdd" } as Record<string, unknown>);
    expect(fs.readFileSync(markerPath(), "utf-8").trim()).toBe("tdd");

    await runWorkflowCommand({ template: "native", force: true });
    expect(fs.existsSync(markerPath())).toBe(false);
  });

  it("init --workflow tdd records the marker", async () => {
    stubMarketplaceFetch();
    await init({ yes: true, workflow: "tdd" } as Record<string, unknown>);
    expect(fs.readFileSync(markerPath(), "utf-8").trim()).toBe("tdd");
  });

  it("trellis update stops listing a non-native workflow.md as needing a decision", async () => {
    stubMarketplaceFetch();
    await init({ yes: true });
    await runWorkflowCommand({ template: "tdd" });

    // console.log is already spied in beforeEach, so re-spying hands back the
    // same recorder — drop the switch-command output before measuring update's.
    const logSpy = vi.spyOn(console, "log").mockImplementation(noop);
    logSpy.mockClear();
    await update({ skipAll: true });
    const printed = logSpy.mock.calls
      .map((call) => call.map(String).join(" "))
      .join("\n");

    // The whole symptom was workflow.md showing up under "Modified by you
    // (need your decision)" on every single run.
    expect(printed).not.toContain(PATHS.WORKFLOW_GUIDE_FILE);
  });

  it("repeated updates keep a non-native workflow.md byte-identical", async () => {
    stubMarketplaceFetch();
    await init({ yes: true });
    await runWorkflowCommand({ template: "tdd" });

    const wfPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    const expected = replacePythonCommandLiterals(TDD_CONTENT);

    await update({ skipAll: true });
    await update({ skipAll: true });

    expect(fs.readFileSync(wfPath, "utf-8")).toBe(expected);
    // The marker itself is protected user state — update must never rewrite it.
    expect(fs.readFileSync(markerPath(), "utf-8").trim()).toBe("tdd");
  });

  it("a native project still receives workflow.md updates (marker absent)", async () => {
    stubMarketplaceFetch();
    await init({ yes: true });

    const wfPath = path.join(tmpDir, PATHS.WORKFLOW_GUIDE_FILE);
    // Simulate an older installed workflow.md that is still hash-pristine, so
    // update() is allowed to refresh it to current native bytes.
    const native = replacePythonCommandLiterals(workflowMdTemplate);
    fs.writeFileSync(wfPath, "# stale native workflow\n", "utf-8");
    const { updateHashes } = await import("../../src/utils/template-hash.js");
    updateHashes(
      tmpDir,
      new Map([[PATHS.WORKFLOW_GUIDE_FILE, "# stale native workflow\n"]]),
    );

    await update({ skipAll: true });

    expect(fs.readFileSync(wfPath, "utf-8")).toBe(native);
  });

  // ---------------------------------------------------------------------------
  // Codex dispatch_mode linkage
  // ---------------------------------------------------------------------------

  it("warns that Codex dispatch_mode defaults to inline after a non-native switch", async () => {
    stubMarketplaceFetch();
    await init({ yes: true, codex: true } as Record<string, unknown>);

    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    await runWorkflowCommand({ template: "tdd" });
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join("");

    expect(written).toContain("dispatch_mode");
    expect(written).toContain("tdd");
  });

  it("stays quiet about dispatch_mode when switching to native", async () => {
    stubMarketplaceFetch();
    await init({ yes: true, codex: true } as Record<string, unknown>);
    await runWorkflowCommand({ template: "tdd" });

    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    await runWorkflowCommand({ template: "native", force: true });
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join("");

    expect(written).not.toContain("dispatch_mode");
  });

  it("stays quiet about dispatch_mode when the user already set it explicitly", async () => {
    stubMarketplaceFetch();
    await init({ yes: true, codex: true } as Record<string, unknown>);

    const configPath = path.join(tmpDir, ".trellis", "config.yaml");
    fs.appendFileSync(
      configPath,
      "\ncodex:\n  dispatch_mode: sub-agent\n",
      "utf-8",
    );

    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    await runWorkflowCommand({ template: "tdd" });
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join("");

    expect(written).not.toContain("dispatch_mode");
  });

  it("stays quiet about dispatch_mode when Codex is not a configured platform", async () => {
    stubMarketplaceFetch();
    await init({ yes: true, claude: true } as Record<string, unknown>);

    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    await runWorkflowCommand({ template: "tdd" });
    const written = stderrSpy.mock.calls.map((c) => String(c[0])).join("");

    expect(written).not.toContain("dispatch_mode");
  });
});
