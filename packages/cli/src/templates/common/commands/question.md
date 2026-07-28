# Question — Adversarial Review

Explicit entry point for a multi-role, dual-panel adversarial + constructive review.

Usage: `{{CMD_REF:question}} <question, or a pointer to the plan / design / code / doc to review>`

## What to do

1. Load and follow the **`trellis-adversarial-review`** skill.
2. Treat everything after the command as the review target. If it points at files or a diff, read them first.
3. Follow the skill: target + roles → two independent panels (native + one Codex call) → contrast the divergences → deliver where it belongs (a file for a substantial review, an inline answer for a short one).

This command is the explicit trigger. The skill also auto-loads when the user asks for 对抗性审查 / 批判性审查 / adversarial review / red-team — but not on casual phrasing like "what do you think", and not for reviewing a code diff, which is `trellis-check`'s job.
