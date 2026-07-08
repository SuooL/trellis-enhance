/**
 * Git-workflow feature templates.
 *
 * A self-contained "git-workflow standard" unit that `trellis init` always
 * writes into a fresh project:
 *   - spec/git-workflow.md          → .trellis/spec/tech/git-workflow.md
 *   - workflows/{ci,deploy,release,prune-branches}.yml + README.md
 *                                   → .github/workflows/
 *
 * These CI files are project-agnostic templates (search `# CUSTOMIZE`) and are
 * shipped as-is. The whole directory is copied into dist/ by copy-templates.js.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

// Spec doc written to .trellis/spec/tech/git-workflow.md
export const gitWorkflowSpec = readTemplate("spec/git-workflow.md");

// GitHub Actions workflow files written to .github/workflows/
const WORKFLOW_FILES = [
  "ci.yml",
  "deploy.yml",
  "release.yml",
  "prune-branches.yml",
  "README.md",
] as const;

/**
 * Return the `.github/workflows/` files as a map of filename → content.
 */
export function getGitWorkflowCiFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const name of WORKFLOW_FILES) {
    files.set(name, readTemplate(`workflows/${name}`));
  }
  return files;
}
