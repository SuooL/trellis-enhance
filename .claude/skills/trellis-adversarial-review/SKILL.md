---
name: trellis-adversarial-review
description: "Multi-role, dual-model adversarial + constructive review of any project content, plan, design, or question. Independent expert panels run on Opus 4.8 AND Codex GPT-5.5, then divergences are contrasted. Use when the user asks for 对抗性审查 / 批判性审查 / adversarial review / red-team / critical review / 让专家评审 / 找出方案(或代码/设计)的缺陷 / a second independent opinion, or explicitly invokes the question command."
---

# Adversarial Review (multi-role · dual independent panels)

Critical **and** constructive review of a target (a plan, design, code, doc, or open question) by multiple expert roles, run as **two independent panels** — one on **Opus 4.8**, one on **Codex GPT-5.5** — whose divergences are then contrasted. Different models catch different failure modes; the divergences are the signal.

This is an on-demand capability. It is NOT tied to the task lifecycle — run it on anything, any time the user asks for a critical/adversarial review or a second opinion.

---

## Step 1: Establish the target + the roles

**Target**: identify what is being reviewed. If the user gave a question/topic, use it. If they pointed at files/a diff/a doc, read those first so the panels review real content, not a summary.

**Roles** (two sources):
- **User-specified** — if the user named roles/lenses ("review as a security expert and a DB architect"), use exactly those.
- **Auto-discovered** — otherwise, derive 2–5 of the most relevant expert lenses for this target (e.g. security, performance, correctness, maintainability, domain expert, UX, ops/reliability). List them with a one-line focus each, and briefly tell the user which roles you picked before proceeding.

## Step 2: Run two independent panels

For the chosen roles, run the critique **twice, independently** — the panels must not see each other's output (independence is what creates diversity):

**Panel A — Opus 4.8 (native).** In this session (Opus), for each role, produce a critical + constructive review: concrete weaknesses/risks/bugs (severity + specifics), and constructive improvements. Cite real locations/quotes from the target.

**Panel B — Codex GPT-5.5.** Delegate to Codex once per role (or once with all roles clearly separated), independently:
```
mcp__codex__codex(
  model = "gpt-5.5",
  config = { "model_reasoning_effort": "high" },
  sandbox = "read-only",
  cwd = <repo root>,
  prompt = <the target content (paste it — Codex has no context injection) + the role(s) + "Give a critical AND constructive review: concrete weaknesses, risks, bugs, with severity and specifics, plus constructive fixes. Cite specifics.">
)
```
Paste the actual target content into the Codex prompt — Codex does not receive Trellis/session context automatically.

If Codex is unreachable, note it and proceed with Panel A only (single-model review), clearly flagged.

## Step 3: Contrast + synthesize

Merge both panels and **foreground the divergences** — a point raised by one model but not the other, or where the two disagree, is often the real issue or a genuine judgment split. Produce:
- **Consensus issues** — flagged by both panels (high confidence).
- **Divergences** — raised by only one model, or conflicting conclusions (needs human judgment; say why they differ if you can).
- **Constructive recommendations** — prioritized (blocker → major → minor).

## Step 4: Persist the report

Write the report to a file (files outlive the conversation):
- Inside an active task → `{TASK_DIR}/review/<topic-slug>.md` (create `review/` if needed).
- Standalone → `.trellis/workspace/<developer>/reviews/<YYYY-MM-DD>-<topic-slug>.md` (or a user-specified path).

Report structure:
```markdown
# Adversarial Review: <topic>
- Target: <what was reviewed>
- Roles: <roles + source: user-specified / auto-discovered>
- Models: Opus 4.8 + Codex GPT-5.5 (high)

## Consensus issues (both panels — high confidence)
## Divergences (one panel only / conflicting — needs judgment)
## Constructive recommendations (prioritized)
## Per-role detail (collapsible)
### <role> — Opus panel
### <role> — Codex panel
```

Then reply with the file path + a short summary (top consensus issues + key divergences). Do not paste the full report into chat — the file is the deliverable.

---

## Notes

- Distinct from `trellis-check`: check is a task-internal code-quality gate on a diff; this is a general critical review of any target (plans, designs, code, questions).
- Keep the two panels genuinely independent — do not feed Panel A's findings into Panel B's prompt.
- Codex delegation details: see the project's Codex usage conventions (model `gpt-5.5`, `model_reasoning_effort` via `config`, `sandbox: read-only` for review).
