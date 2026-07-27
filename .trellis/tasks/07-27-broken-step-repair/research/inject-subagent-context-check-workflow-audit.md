# Research: build_check_prompt() hardcoded workflow vs. per-platform agent definitions

- **Query**: Confirm whether stripping the hardcoded check-workflow text out of `build_check_prompt()` (inject-subagent-context.py:386-418), leaving only context injection, is safe given each platform's own `trellis-check` agent definition. Also check `build_implement_prompt`/`build_finish_prompt` for the same class of conflict, whether any test asserts the current prompt text, and the git history of "impact radius analysis (L1-L5)".
- **Scope**: internal (repo: `/Users/suool/git/Trellis`)
- **Date**: 2026-07-27

## Findings

### 1. Which platforms actually run `inject-subagent-context.py`?

Single source of truth: `packages/cli/src/templates/shared-hooks/index.ts:75-109` (`SHARED_HOOKS_BY_PLATFORM`), enforced at build/collect time by `getSharedHookScriptsForPlatform()` and asserted by `packages/cli/test/templates/shared-hooks.test.ts:59-73`.

| Platform | Ships `inject-subagent-context.py`? | Wiring (settings/hooks file) |
|---|---|---|
| **claude** | ✅ | `templates/claude/settings.json:38-54` — `PreToolUse` → `.claude/hooks/inject-subagent-context.py` |
| **cursor** | ✅ | `templates/cursor/hooks.json:6` (also gets `inject-shell-session-context.py` for `beforeShellExecution`, cursor-only) |
| **codebuddy** | ✅ | `templates/codebuddy/settings.json:35-41` — `PreToolUse` |
| **droid** | ✅ | `templates/droid/settings.json:35-41` — `PreToolUse` → `.factory/hooks/inject-subagent-context.py` |
| **kiro** | ✅ | Not a settings.json — wired per sub-agent: `templates/kiro/agents/trellis-check.json` `hooks.agentSpawn` → `.kiro/hooks/inject-subagent-context.py` (also `session-start.py` + `inject-workflow-state.py`) |
| codex | ❌ (class-2 pull-based) | only `inject-workflow-state.py`; codex's own `hooks/session-start.py` is separate |
| copilot | ❌ (class-2) | only `inject-workflow-state.py` |
| gemini | ❌ (class-2) | `session-start.py` + `inject-workflow-state.py` only |
| qoder | ❌ (class-2) | same as gemini; `configurators/qoder.ts:23` explicitly notes `inject-subagent-context.py` is excluded because "Qoder's hook can't inject" |
| trae | ❌ (class-2, per `SHARED_HOOKS_BY_PLATFORM`) | `session-start.py` + `inject-workflow-state.py` only |
| opencode | ⚠️ **not this .py file**, but ships its **own JS reimplementation** — `templates/opencode/plugins/inject-subagent-context.js` (`tool.execute.before` hook). Not part of `SHARED_HOOKS_BY_PLATFORM` at all (opencode is copied wholesale by `walkOpenCodeTemplateDir()` in `configurators/opencode.ts`). See "Caveat" below — this file independently hardcodes an abbreviated version of the same workflow text. |
| pi, zcode, reasonix, antigravity, devin, kilo | ❌ (pull-based / no hooks) | `pi.ts:26`, `zcode.ts:4` ("pull-based class-2 platform (agentCapable, no hooks)") — agents are fully self-contained, no hook context injection at all |

**Class-2 (pull-based) confirmed set** (test-asserted at `shared-hooks.test.ts:62`): `codex, copilot, gemini, qoder, trae`. Plus `pi`, `zcode`, `reasonix`, and the non-agent-capable platforms are outside the shared-hook table entirely.

**Conclusion for Q1**: exactly **5 platforms** run `inject-subagent-context.py`'s `build_check_prompt()`: **claude, cursor, codebuddy, droid, kiro**. `opencode` runs a parallel JS copy of the same logic, not this file.

---

### 2. Per-platform: is the agent's own `trellis-check` definition already complete without the hook's injected workflow?

| Platform | Agent file | Has own complete workflow (get diff → check vs spec → self-fix → verify)? | Verdict if hook stops injecting workflow |
|---|---|---|---|
| **claude** | `templates/claude/agents/trellis-check.md:8-116` | Yes, but a **different** workflow: "Cross-model review — Design 1" — delegates the actual review reasoning to `mcp__codex__codex` (GPT-5.5, effort `xhigh`, read-only), then Claude applies fixes. Steps 1-4 fully spelled out (gather diff+context → delegate to Codex → apply fixes → verify), plus a fallback path if Codex is unavailable. | **Safe — in fact this is the whole point of the fix.** Today the hook's injected "Check item by item against specs" / "Must execute complete checklist" / "impact radius (L1-L5)" instructions run **in the same prompt** as, and contradict/duplicate, the Codex-delegation instructions. Removing hook-injected workflow text resolves the conflict; the agent file alone is self-sufficient. |
| **cursor** | `templates/cursor/agents/trellis-check.md:6-107` | Yes — full Steps 1-4 (Get Changes / Check Against Specs and Task Artifacts / Self-Fix / Run Verification), byte-identical in structure to droid/codebuddy's version. | **Safe.** Agent file already duplicates (not conflicts with) the hook's workflow; removing the hook's copy just removes redundancy. |
| **codebuddy** | `templates/codebuddy/agents/trellis-check.md:6-115` | Yes — same full Steps 1-4 as cursor. | **Safe** — same reasoning. |
| **droid** | `templates/droid/droids/trellis-check.md:7-107` | Yes — same full Steps 1-4. | **Safe** — same reasoning. |
| **kiro** | `templates/kiro/agents/trellis-check.json` (`prompt` field, JSON) | Yes — the entire Steps 1-4 workflow (Get Changes / Check Against Specs and Task Artifacts / Self-Fix / Run Verification) plus Report Format is embedded **directly in the JSON agent prompt itself**, independent of anything the hook injects. | **Safe** — self-contained. |

No platform among the 5 that run the hook would lose necessary instructions if `build_check_prompt()` stopped injecting a workflow — 4 of them already carry an identical duplicate workflow in their own agent file, and Claude (the one platform where the hook's workflow actively **conflicts** with the agent's cross-model design) is the one the fix is meant to un-block.

For completeness, the pull-based platforms not touched by this hook (`gemini`, `qoder`, `trae`, `reasonix`, `zcode`, `pi`) were also inspected: every one of their `trellis-check.md` files carries its own complete workflow (verified: `templates/gemini/agents/trellis-check.md`, `templates/qoder/agents/trellis-check.md`, `templates/trae/agents/trellis-check.md`, `templates/reasonix/agents/trellis-check.md`, `templates/zcode/agents/trellis-check.md`) — consistent with them never depending on this hook.

---

### 3. Do `build_implement_prompt()` and `build_finish_prompt()` have the same class of conflict?

**`build_implement_prompt()`** (`inject-subagent-context.py:351-383`) injects:
```
1. Understand specs
2. Understand task artifacts
3. Implement feature
4. Self-check
```
vs. `templates/claude/agents/trellis-implement.md:36-79` ("Core Responsibilities" + "## Workflow" sections): `1. Understand Specs → 2. Understand Requirements → 3. Implement Features → 4. Verify`.

**Verdict**: **no conflict** — these are the same 4 steps in the same order, described in near-identical language (redundant, not contradictory). Claude's implement agent has no delegation/cross-model design analogous to the check agent's Codex delegation, so there is nothing for the hook's workflow to contradict. Same holds for cursor/codebuddy/droid/kiro implement agents (not read in full here, but they follow the same non-cross-model implement pattern as their check agents).

**`build_finish_prompt()`** (`inject-subagent-context.py:421-460`) is gated behind `is_finish_phase = "[finish]" in original_prompt.lower()` (line 721). Searched the entire `templates/` tree for the literal marker `[finish]`:
```
packages/cli/src/templates/shared-hooks/inject-subagent-context.py:720-721   (the check itself)
packages/cli/src/templates/opencode/plugins/inject-subagent-context.js:476-477  (JS mirror)
```
No other template — not `templates/trellis/workflow.md`, not `templates/common/commands/finish-work.md`, not any agent/skill file — ever tells the main session to include the literal string `[finish]` when dispatching `trellis-check`. `workflow.md`'s actual Phase 3 ("Finish", lines 585-693) does spec-sync (`trellis-update-spec` skill, done by the **main session**, not a spawned sub-agent) and commit steps; the only sub-agent dispatch documented for check is Phase 2.2 (`workflow.md:546-575`), which is the ordinary (non-finish) check dispatch.

**Verdict**: `build_finish_prompt()` currently appears to be **dead code reachable only if some prompt happens to literally contain "[finish]"** — the documented dispatch protocol in `workflow.md` never produces that trigger. No conflict was found because the code path doesn't appear to be exercised by the current workflow; this is a separate observation from the `build_check_prompt` conflict and outside what was asked, but relevant context if the fix also touches this function.

---

### 4. Tests asserting the specific hardcoded prompt text

Searched `packages/cli/test/` for `build_check_prompt`, `"impact radius"`, `"Check item by item"`, `"Must execute complete checklist"`, `"L1-L5"`:

- `packages/cli/test/regression.test.ts:6071-6072` — only a **comment** referencing the function names, not an assertion on their content.
- No test in the repo asserts on the literal strings `"impact radius"`, `"Check item by item"`, `"Must execute complete checklist"`, or `"L1-L5"` (confirmed via repo-wide grep — the only 5 hits for `"L1-L5"`/`"impact radius"` are: `.trellis/tasks/07-27-broken-step-repair/prd.md`, `.trellis/tasks/07-27-workflow-friction-reduction/prd.md`, `packages/cli/src/templates/shared-hooks/inject-subagent-context.py`, `.cursor/hooks/inject-subagent-context.py`, `.claude/hooks/inject-subagent-context.py` — i.e. this repo's own installed copies of the hook, plus the two task PRDs, none of which are test files).

What tests **do** assert about `inject-subagent-context.py`'s output (none of which are broken by removing the "## Workflow" section text):
- `regression.test.ts:6065-6078` — the `<!-- trellis-hook-injected -->` marker appears ≥3 times (once each for implement/check/finish). This marker is emitted at the top of each `build_*_prompt` function, separate from the "## Workflow" section — safe to keep while removing the workflow bullets.
- `regression.test.ts:6082-6153` — per-platform **agent markdown/JSON files** (not the hook) carry the "Trellis Context Loading Protocol" fallback section, "Active task:" hint text, and mention `prd.md`/`design.md`/`implement.md`. These are assertions on the agent definitions, not on `inject-subagent-context.py`'s generated prompt text.
- `packages/cli/test/templates/shared-hooks.test.ts` — asserts the **distribution table** (which platforms get which hook file), not prompt content.
- `packages/cli/test/templates/opencode.test.ts:494-534` — exercises the JS mirror's `buildPrompt`, asserting marker presence and that the context (spec/prd content) is inlined — not the specific "## Workflow" wording.

**Conclusion for Q4**: no test locks in the current hardcoded workflow text of `build_check_prompt()` (or the sibling `build_*_prompt` functions). Removing/rewriting the "## Workflow" section is not expected to break any existing test.

---

### 5. Git history of "impact radius analysis (L1-L5)"

```
git log --all --oneline -S "impact radius" -- .
54d27d76 chore: trellis self update
4476844b feat: claude hooks migrate to shared + 0.5.0 migration manifest
efccf6f4 feat: add hooks + agents for 7 platforms, remove iFlow/multi-agent/Ralph Loop
2910c099 feat: upgrade 7 platforms to agent-capable + hooks/agent format research
b5418872 feat(cli): add iFlow cli support (#22)
1c616225 init project   <-- earliest hit
```

The line `- Pay special attention to impact radius analysis (L1-L5)"""` is **already present verbatim** in the very first commit of this repo's history (`1c616225 init project`, both in `.claude/hooks/inject-subagent-context.py` and its `src/templates/` counterpart — squashed/imported history, not a true "birth" commit with prior context). Searching that same initial commit's full diff for any accompanying **definition** of what "L1" through "L5" mean (checklist levels, severity tiers, impact-radius tiers, etc.) found nothing — no spec file, checklist, or comment in that commit defines an "L1-L5" scale. A repo-wide grep today for `L1\b|L2\b|...|L5\b` under `.trellis/spec/` turns up exactly one unrelated hit (`commands-channel.md:1169`, a `// L1 fix:` code comment about a bugfix label, unrelated to review levels).

**Conclusion for Q5**: "impact radius analysis (L1-L5)" is **undefined jargon that has existed unexplained since this repository's initial commit** — there is no earlier commit or spec document in this repo's visible history that defines what L1 through L5 mean for impact-radius analysis. (Note: this repo's history starts from a squashed/imported "init project" commit, so an original definition may have existed in a pre-fork ancestor not present here — but nothing in this repo's own history or specs defines it.)

## Caveats / Not Found

- **opencode has a parallel, independently-hardcoded copy** of this same workflow text in `templates/opencode/plugins/inject-subagent-context.js:246-256` (JS, not Python) — e.g. `"2. **Check against specs** - Check item by item"` / `"Must execute complete checklist"` (no "impact radius (L1-L5)" line there, and no `"in check specs"` qualifier — it's a slightly abbreviated variant). If the intended fix is scoped to `inject-subagent-context.py` only, this JS file will retain its own hardcoded check-workflow text unless also addressed — it was NOT asked about but is directly analogous and touches the same "hook hardcodes a workflow that may collide with the agent's own design" pattern. opencode's own `trellis-check.md`, however, uses the plain (non-cross-model) self-check workflow, so there is currently no live conflict there — only latent duplication, same as cursor/codebuddy/droid.
- `build_finish_prompt()`'s `[finish]` trigger appears unreachable via the documented `workflow.md` dispatch protocol (see Q3) — flagged for awareness, not verified against runtime behavior (e.g., some ad-hoc user prompt could still type `[finish]` manually).
- Did not check `.trellis/tasks/07-27-broken-step-repair/prd.md` or `design.md` for the proposed fix's exact wording — this research addresses only the safety questions asked, not the fix's implementation details.
- Did not run the actual `pnpm --filter trellis-enhance test` suite to confirm zero regressions; this is a static/source-level read of what the tests assert, not a live test run.
