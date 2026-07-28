# 归档说明

**判定:ALREADY_FIXED(功能已在当前代码中落地)。归档于 2026-07-28。**

## 依据

PRD 要求的「无损 PRD 收敛」已经存在于全部三份模板副本,并有回归测试守护:

- `packages/cli/src/templates/common/skills/brainstorm.md:51` —— 第 8 步要求在终审 / `task.py start` 前跑收敛 pass。
- 同文件 `:141-154` —— `## PRD Convergence Pass` 章节,包含 PRD 点名要的无损规则:合并重复事实、折叠 `What I already know` / `Assumptions` / 已解决的 `Open Questions`、合并并列的 bug+需求清单,且 `Preserve every file:line anchor, decision, constraint, requirement ID, and acceptance-criteria mapping`。
- 同文件 `:161` —— Quality Bar 把「planning ready」门禁挂在该 pass 上。
- 平台副本齐备且意图一致:`templates/codex/skills/brainstorm/SKILL.md`、`templates/copilot/prompts/brainstorm.prompt.md`。
- 漂移守护:`packages/cli/test/regression.test.ts:3703-3730` —— `it("[#320] brainstorm templates require lossless PRD convergence before start")`,遍历 3 份模板断言四条必需字符串。

## 唯一未勾选项

`prd.md:36` 的「回复上游 issue #320 并关闭」属于上游 GitHub 事务,对本 fork 不适用。
