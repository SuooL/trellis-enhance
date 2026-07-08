<!-- ═══════════════════════════════════════════════════════════════════════
     TRELLIS-ENHANCE CONTEXT — read this first.
     Lives on the working line (main / dev). For the full story see FORK.md.
     ═══════════════════════════════════════════════════════════════════════ -->

# Trellis-Enhance — SuooL's self-maintained Trellis (branches: `main` / `dev` / `feature`)

This repo is **`trellis-enhance`** — SuooL's own, self-maintained product, forked from Trellis
(`mindfold-ai/Trellis`). The npm package is renamed to **`trellis-enhance`** (bins stay `trellis` / `tl`);
it does **not** track or phone the upstream npm package. It is the **CLI source** — not a project that
*uses* Trellis. Customizations live in the CLI's templates/configurators; the built `trellis init` then
generates them into any target project.

**Goal:** my own opinionated default workflow — model routing, cross-model review, extra workflow states,
an adversarial-review capability, and a Git/CI standard — baked into every `trellis init`. Self-owned:
`trellis update` refreshes a project purely from THIS CLI's templates; no upstream version check.

## Branch model (this repo follows trellis-enhance's own git-workflow standard)
- **`main`** — the product / release line. **Default branch.**
- **`dev`** — integration branch; feature work lands here first.
- **`feature/<task-slug>`** — per-task development. The `git_branch.py` hook creates these off `dev`; flow is `feature` → PR → `dev` → `main`.
- **`upstream`** remote = `mindfold-ai/trellis` — kept **only** for occasional manual comparison: `git fetch upstream && git diff upstream/main main -- <paths>`, cherry-pick what's worthwhile. Not auto-tracked/merged. (This repo is standalone, no longer a GitHub fork.)

## What's customized (all in `packages/cli/src/templates/…` + `…/configurators/`)
| Area | What | Key files |
|---|---|---|
| **Sub-agent models** | implement=**Opus 4.8**; research=**Sonnet** (+ `mcp__codex__codex` tool for a cross-model 2nd opinion); check=**cross-model** — a thin Claude wrapper that delegates the review to **Codex GPT-5.5 (effort xhigh, read-only)** and applies fixes (Design 1) | `templates/claude/agents/trellis-{implement,research,check}.md` |
| **Custom workflow states** | `needs-rework` / `blocked` / `deploying`, with per-turn breadcrumbs + `/continue` routing; writer = new `task.py set-status` (+ `cmd_set_status` in task_store) | `templates/trellis/workflow.md`, `templates/common/commands/continue.md`, `templates/trellis/scripts/task.py`, `…/common/task_store.py` |
| **Question / adversarial review** | On-demand multi-role, **dual independent panels (Opus 4.8 + Codex GPT-5.5)** critical review; keyword-triggered skill + explicit command. New skill must be registered in `SKILL_DESCRIPTIONS` (shared.ts) | `templates/common/skills/adversarial-review.md`, `templates/common/commands/question.md`, `configurators/shared.ts` |
| **Git/CI standard** (always generated) | 3-branch model (main=release / dev=integration+CD-to-prod / `feature/<task-slug>`); PR→dev → CI (build+tests+**diff-coverage ≥ 80%**) → auto-merge; dev→prod SSH deploy (opt-in via `vars.DEPLOY_ENABLED`); manual `workflow_dispatch` release; weekly branch prune. Emitted on every `trellis init`. | `templates/git-workflow/` (spec + 4 `.github/workflows/*.yml` + README), wired in `templates/git-workflow/index.ts` + `configurators/workflow.ts` + `templates/trellis/index.ts` |
| **Branch lifecycle hook** | `after_create` → create `feature/<slug>` off `dev` (safe-skips on non-git); `after_archive` → delete merged branch | `templates/trellis/scripts/hooks/git_branch.py`, `templates/trellis/config.yaml` (hooks) |

## How install works — symlink dev, rebuild = live, NEVER reinstall

The global `trellis` / `tl` command is **symlinked** to this repo's built output:
`/opt/homebrew/bin/trellis → …/node_modules/…/bin/trellis.js → /Users/suool/git/Trellis/packages/cli`.
So the global command runs **whatever is currently built in this working tree**.

**The dev loop (no reinstall, ever):**
```bash
cd /Users/suool/git/Trellis            # work on a feature/* branch (or dev); merge to main per the standard
# ...edit source under packages/cli/src/...
pnpm --filter trellis-enhance build    # tsc + copy-templates → dist/ ; global `trellis` is now updated
```
- ✅ **Editing + `build` is all it takes** — the symlink means the change is live immediately. No `npm i -g`.
- ⚠️ The global command = **"whatever branch is checked out here + last build"**. After switching branches (`main` / `dev` / `feature/*`), rebuild so the global CLI reflects that branch's code.
- 🔁 Only re-link if the symlink itself is ever removed: `cd packages/cli && pnpm link --global` (or `npm link`). After the `@mindfoldhq/trellis → trellis-enhance` rename the existing bin symlink still resolves by path, so no relink was needed.

**Self-owned updates:** `trellis update` in a project refreshes its `.trellis/` from THIS CLI's templates only. The upstream-npm version check was removed (`getLatestNpmVersion()` returns null) — it never phones `registry.npmjs.org`.

```bash
pnpm --filter trellis-enhance typecheck
pnpm --filter trellis-enhance test     # NOTE: 2 pre-existing failures in test/templates/trellis.test.ts
                                       # (missing marketplace/workflows/{native,tdd}/workflow.md) are
                                       # UPSTREAM/env, not from this fork.
# Smoke-test the generated output in a scratch dir:
d=$(mktemp -d); (cd "$d" && git init -q && node /Users/suool/git/Trellis/packages/cli/dist/cli/index.js init --claude -y -u tester)
```
When you edit a template that a configurator renders per-platform, remember the **init-write path and the update-collect path must stay byte-identical** (see `.trellis/spec/cli/backend/configurator-shared.md`) or `trellis update` hash-tracking / tests break.

## How this was built (provenance)
Prototyped & validated first in a separate project (`/Users/suool/git/cc2cx`, "Phase A"), then ported into this fork ("Phase B"). The design decisions, per-item rationale, and the cross-model dogfood-review that caught 4 blockers + 2 majors are written up in **FORK.md**.

---

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Trellis** (14336 symbols, 20870 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Trellis/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Trellis/clusters` | All functional areas |
| `gitnexus://repo/Trellis/processes` | All execution flows |
| `gitnexus://repo/Trellis/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
