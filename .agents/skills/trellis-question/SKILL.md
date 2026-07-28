---
name: trellis-question
description: "Explicit entry point for a multi-role, dual-model adversarial + constructive review of a plan, design, code, doc, or open question. Loads the trellis-adversarial-review skill and runs two independent expert panels (Opus 4.8 + Codex GPT-5.5), contrasts the divergences, and persists a report. Use when the user wants a critical second opinion or invokes the question command."
---

# Question — Adversarial Review

Explicit entry point for a multi-role, dual-model adversarial + constructive review.

Usage: ``question` (Trellis command) <question, or a pointer to the plan / design / code / doc to review>`

## What to do

1. Load and follow the **`trellis-adversarial-review`** skill.
2. Treat everything after the command as the review target (a question, or a pointer to files / a diff / a doc). If it points at files or a diff, read them first.
3. Run the skill's full flow: establish target + roles (user-specified or auto-discovered) → two independent panels (Opus 4.8 + Codex GPT-5.5) → contrast divergences → persist the report → reply with the path + a short summary.

This command is just the explicit trigger; the skill also auto-loads when the user asks for 对抗性审查 / 批判性审查 / adversarial review / a critical second opinion.
