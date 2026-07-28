# Adversarial Review (multi-role · two independent panels)

Critical **and** constructive review of a target (a plan, design, code, doc, or open
question) by two independent panels — one native (this session), one **Codex GPT-5.5**.
Different models catch different failure modes; **the divergences are the signal**.

On-demand only. Not tied to the task lifecycle.

---

## Step 1: Target + roles

**Target** — if the user pointed at files / a diff / a doc, read them first so the panels
review real content, not a summary.

**Roles** — use exactly the roles the user named. Otherwise pick **2–3** relevant expert
lenses (security, performance, correctness, maintainability, domain, ops…). Name them in
one line before proceeding. More lenses mostly produce more overlap, not more insight.

## Step 2: Two independent panels

Independence is the point — do not feed one panel's findings into the other.

**Panel A — native.** In this session, review through each role: concrete weaknesses,
risks and bugs (with severity and specifics), plus constructive fixes. Cite real
locations/quotes from the target.

**Panel B — Codex GPT-5.5.** Exactly **one** call, with all roles in the same prompt:

```
mcp__codex__codex(
  model = "gpt-5.5",
  config = { "model_reasoning_effort": "high" },
  sandbox = "read-only",
  cwd = <repo root>,
  prompt = <target content, pasted — Codex gets no session context>
         + <the roles, clearly separated>
         + "Give a critical AND constructive review per role: concrete weaknesses,
            risks, bugs, with severity and specifics, plus constructive fixes."
)
```

One call per role would multiply cost and re-paste the whole target N times for no real
gain — the roles are separable inside a single prompt.

If Codex is unavailable, **say so in the output** and proceed with Panel A alone. A
single-model review presented as a dual-model one is worse than no review, because the
caller trusts it more than they should.

## Step 3: Contrast

Foreground the **divergences** — a point raised by one panel and not the other, or where
the two disagree, is usually either the real issue or a genuine judgment call.

- **Consensus** — both panels flagged it (high confidence).
- **Divergence** — one panel only, or conflicting (needs your judgment; explain why they
  differ if you can).
- **Recommendations** — prioritized: blocker → major → minor.

## Step 4: Deliver it where it belongs

Match the output to the target:

- **Inside an active task, or a review worth keeping** → write
  `{TASK_DIR}/review/<topic-slug>.md` (or
  `.trellis/workspace/<developer>/reviews/<YYYY-MM-DD>-<topic-slug>.md` when standalone),
  then reply with the path plus the top consensus issues and key divergences.
- **A short question with a short answer** → just answer, in chat. Forcing a file and a
  second lookup for something that fits in a paragraph is pure overhead.

State which panels actually ran (both, or native-only and why) wherever the result lands.

---

Distinct from `trellis-check`: check is a task-internal quality gate on a code diff. This
reviews any target — plans, designs, docs, open questions — and is only ever run on request.
