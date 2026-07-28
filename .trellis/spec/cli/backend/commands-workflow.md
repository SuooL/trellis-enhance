# `trellis workflow` Command

`trellis workflow` lists and switches the project's active `.trellis/workflow.md`
template. It is the only command that deliberately replaces an existing
workflow variant in-place after init.

## Scenario: workflow marketplace templates and switcher

### 1. Scope / Trigger

Trigger: adding a user-facing command and init flags that change a runtime-parsed
template, marketplace lookup behavior, and `.trellis/.template-hashes.json`
ownership.

This spec applies when editing:

- `packages/cli/src/commands/workflow.ts`
- `packages/cli/src/utils/workflow-resolver.ts`
- `packages/cli/src/commands/init.ts` workflow-selection code
- `packages/cli/src/configurators/workflow.ts`
- `marketplace/workflows/**`
- workflow-related tests

### 2. Signatures

CLI signatures:

```text
trellis workflow
trellis workflow --list
trellis workflow --template <id>
trellis workflow --marketplace <source> --template <id>
trellis workflow --template <id> --force
trellis workflow --template <id> --create-new

trellis init --workflow <id>
trellis init --workflow-source <source> --workflow <id>
```

Resolver signatures:

```typescript
export const NATIVE_WORKFLOW_ID = "native";

export interface ResolvedWorkflowTemplate {
  id: string;
  type: "workflow";
  name: string;
  description?: string;
  path: string;
  content: string;
  source: "bundled" | "marketplace";
}

export interface WorkflowTemplateListing {
  id: string;
  type: "workflow";
  name: string;
  description?: string;
  path: string;
  source: "bundled" | "marketplace";
}

export function listWorkflowTemplates(options?: {
  source?: string;
}): Promise<{ templates: WorkflowTemplateListing[]; errorMessage?: string }>;

export function resolveWorkflowTemplate(
  id: string,
  options?: { source?: string },
): Promise<ResolvedWorkflowTemplate>;
```

Configurator signature:

```typescript
export interface WorkflowOptions {
  projectType: ProjectType;
  skipSpecTemplates?: boolean;
  packages?: DetectedPackage[];
  remoteSpecPackages?: Set<string>;
  workflowMdOverride?: string;
}
```

### 3. Contracts

Marketplace entries use `type: "workflow"` and point to one markdown file:

```json
{
  "id": "tdd",
  "type": "workflow",
  "name": "TDD Workflow",
  "description": "Trellis workflow variant that drives Phase 2 with one red / green / refactor behavior slice at a time",
  "path": "workflows/tdd/workflow.md",
  "tags": ["workflow", "tdd", "testing"]
}
```

Built-ins:

- `native` is the ONLY id the CLI ships. Every other id must be served by the
  configured marketplace, so `trellis workflow --list` is the authoritative
  list. Do not advertise specific marketplace ids (e.g. `tdd`) in `--help`
  text, spec, or bundled skills — this fork's marketplace decides what exists,
  and a hard-coded example that the index does not serve fails with
  `Workflow template "<id>" not found in marketplace index.`

Ownership contract:

- `native` is Trellis-managed. After writing it, refresh the
  `.trellis/workflow.md` hash with `updateHashes`.
- Every non-native workflow is user-managed local content. After writing it,
  remove `.trellis/workflow.md` from `.trellis/.template-hashes.json` with
  `removeHash`.
- Record the active id in `.trellis/.workflow-template` (absent = native), and
  list that path in `PROTECTED_PATHS` so update never rewrites it.
  `collectTemplateFiles` must omit `workflow.md` entirely while the marker
  names a non-native id.
- Do not add a long-lived field that makes `trellis update` **chase** a selected
  variant — update must never re-fetch or refresh marketplace workflow content.
  Switching is an explicit project action. The `.workflow-template` marker is
  the opposite of chasing: it exists so update can *exclude* the file. Without
  it, the intentionally-absent hash entry made `analyzeChanges` classify
  workflow.md as "Modified by you" and re-prompt overwrite/skip/create-new on
  every single run.
- The marker is required rather than inferring intent from "hash entry missing",
  because a missing entry is ambiguous: it means either "user selected a
  non-native workflow" or "this project predates hash-tracking for
  workflow.md". Skipping updates on that ambiguity would silently freeze
  workflow.md for legacy projects — a worse failure than the prompt it replaces.

Platform-linkage contract:

- After writing a non-native workflow on a Codex-configured project where
  `codex.dispatch_mode` is still unset, warn on stderr that the default
  (`inline`) instructs Codex NOT to dispatch implement/check sub-agents. The
  bundled native workflow reconciles this with parallel `<status>-inline`
  breadcrumb variants; a marketplace workflow has none, so the default
  contradicts the workflow just selected. Non-blocking; never fails the write.

Runtime parser contract:

- Every workflow template must keep `## Phase Index`, `## Phase 1: Plan`,
  `#### X.Y` step headings, platform marker syntax, and all required
  `[workflow-state:*]` blocks.
- SessionStart, per-turn workflow-state hooks, `trellis-start`, and
  `get_context.py --mode phase` read the current `.trellis/workflow.md`; do not
  duplicate variant-specific behavior in hook scripts or skills.

Native source-of-truth contract:

- `packages/cli/src/templates/trellis/workflow.md` is the source of truth for
  native workflow.
- If `marketplace/workflows/native/workflow.md` exists, tests must enforce byte
  identity with the bundled native template.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| `trellis workflow --template <id>` and current workflow is modified | Exit 1 with guidance to use `--force` or `--create-new`; do not prompt, even on a TTY |
| Interactive `trellis workflow` picker and current workflow is modified | Prompt for overwrite, create-new, or skip |
| `--create-new` | Write a generated `workflow.md.new` file beside `.trellis/workflow.md`; do not change active workflow or hash file |
| `--force` | Overwrite active workflow and apply the native/non-native hash contract |
| Missing workflow id | Throw `WorkflowResolveError` / command error; CLI exits non-zero |
| Marketplace index fetch fails | List can still show bundled native with warning; resolve fails with workflow-specific error |
| Workflow entry path is missing, not `.md`, absolute, or contains `..` | Fail with workflow-specific error |
| `init --workflow missing-id` | Reject; do not print and return success |
| `init --workflow tdd` | Write marketplace content and remove `.trellis/workflow.md` hash |
| `trellis update` after switching to non-native | Omit `workflow.md` from the template set (marker names a non-native id); never restore native, and never re-list it as "Modified by you" |
| `trellis update` on a native project | `workflow.md` stays on the normal template path and a hash-pristine file is refreshed to current native bytes |
| Non-native switch on a Codex project with `dispatch_mode` unset | stderr warning about the `inline` default; write still succeeds |

### 5. Good/Base/Bad Cases

- Good: `trellis workflow --template tdd` replaces a pristine native workflow,
  removes the workflow hash, and later `trellis update --skip-all` leaves TDD
  content in place.
- Base: `trellis init --workflow native` writes bundled native workflow and
  keeps `.trellis/workflow.md` hash-tracked.
- Bad: `trellis workflow --template tdd` writes TDD content and records the TDD
  hash. The next `trellis update` sees a pristine file and overwrites it with
  native workflow.

### 6. Tests Required

Unit tests:

- `resolveWorkflowTemplate("native")` returns bundled content without fetch.
- Marketplace workflow resolution fetches `index.json` and one markdown file.
- Missing id errors mention workflow templates, not spec templates.
- Invalid / escaping workflow paths fail before fetch or file read.

Integration tests:

- `init --workflow native` keeps `.trellis/workflow.md` hash-tracked.
- `init --workflow tdd` writes marketplace content and removes the hash.
- `init --workflow-source <source> --workflow custom-id` writes custom content.
- `init --workflow missing-id` rejects.
- `trellis workflow --template tdd` writes marketplace content and removes the
  hash.
- Explicit `--template` with modified workflow fails even when `stdin.isTTY` is
  true.
- `--create-new` writes a generated `workflow.md.new` file beside `.trellis/workflow.md` and does not touch the active
  workflow or hash.
- `trellis update` after switching to non-native does not restore native.
- `.trellis/.workflow-template` is written on a non-native switch/init, cleared
  on switching back to native, and left untouched by `trellis update`.
- Repeated `trellis update` runs stop listing a non-native `workflow.md` under
  "Modified by you", while a native project still has a hash-pristine
  `workflow.md` refreshed to current native bytes.
- The Codex `dispatch_mode` warning fires only for a non-native switch on a
  Codex-configured project with the knob unset — silent for native, for an
  explicitly-set knob, and for non-Codex projects.
- Marketplace native mirror matches bundled native workflow when the mirror file
  exists.
- Real `marketplace/workflows/tdd/workflow.md` planning breadcrumbs include the
  TDD gates: observable behavior slices, public interface under test, and mock
  boundaries.

Runtime parsing validation:

```bash
python3 ./.trellis/scripts/get_context.py --mode phase
python3 ./.trellis/scripts/get_context.py --mode phase --step 2.1
python3 ./.trellis/scripts/get_context.py --mode phase --step 2.2 --platform codex
python3 ./.trellis/scripts/get_context.py --mode phase --step 2.1 --platform codex-sub-agent
python3 ./.trellis/scripts/get_context.py --mode phase --step 2.1 --platform claude
```

### 7. Wrong vs Correct

#### Wrong

```typescript
// Records non-native content as the pristine template hash.
fs.writeFileSync(".trellis/workflow.md", tddContent);
updateHashes(cwd, new Map([[PATHS.WORKFLOW_GUIDE_FILE, tddContent]]));
```

This makes `trellis update` auto-replace TDD with bundled native workflow later.

#### Correct

```typescript
fs.writeFileSync(".trellis/workflow.md", tddContent);
removeHash(cwd, PATHS.WORKFLOW_GUIDE_FILE);
```

Missing hash means update conservatively treats the workflow as user-managed and
routes it through the normal modified-file decision path.

#### Wrong

```typescript
if (isInteractive()) {
  await promptForOverwrite();
}
```

An explicit `trellis workflow --template tdd` can hang in a TTY even though it is
a scriptable command path.

#### Correct

```typescript
const explicitTemplate = Boolean(options.template);
if (explicitTemplate || !isInteractive()) {
  throw new WorkflowCommandError("... use --force or --create-new ...");
}
```

Only the no-argument interactive picker may prompt for conflict resolution.
