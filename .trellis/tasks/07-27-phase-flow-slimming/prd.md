# Trellis 三阶段流程：让已有的轻量/复杂之分真正生效

父任务：`07-27-workflow-friction-reduction`（子任务 1）

> **本 PRD 已于 2026-07-27 重写。** 原版基于静态审计，主张「新增第三档」并把若干项称为
> 「虚设门禁」「死代码」。深入代码与历史后，两处判断需要修正（见下），
> 修正后的方案**更小**：不新发明分档，只让 `workflow.md` 自己声称的规则前后一致。

## Goal

消除轻量任务的规划摩擦，做法是让 `workflow.md` 内部自洽 —— 而不是增加新机制。

## 需要修正的两处原判断

### 修正 1：JSONL 门禁不是「虚设」，是**实现时丢了限定词**

原判断：`:400-445` 的 1.3 是 `[required · once]` 且设 ready gate，但 `:463` 自述运行时
tolerate seed-only manifest，故称其为散文强制、运行时不校验的虚设门禁。

**实际情况**：该门禁是针对 issue #292 **刻意收紧**的（见 `06-24-issue-292-jsonl-gate`
任务，及 `regression.test.ts:3655` 的 `[#292]` 测试）。运行时 tolerance 是**为向后兼容
有意保留**的，#292 的需求原文明确写着「Keep consumer tolerance intact ... but planning
guidance must not present that tolerance as permission to skip curation」。

**真正的缺陷在别处**：#292 的需求原文限定的是**复杂任务** ——

> Update the brainstorm quality bar so **complex** sub-agent-dispatch tasks are not
> considered planning-complete until both manifests contain real entries

但落到 `workflow.md` 文本时，`complex` 这个限定词丢了：

| 位置 | 文本 | complex 限定 |
|---|---|---|
| `:443` | "Ready gate: both `implement.jsonl` and `check.jsonl` must contain at least one real ... entry before `task.py start`" | ❌ 丢失 |
| `:463` | "On sub-agent-dispatch platforms, `implement.jsonl` and `check.jsonl` must both have real curated entries before start" | ❌ 丢失 |
| `:482` | 1.5 完成标准表中的对应行 | ❌ 丢失 |

而 `:164` 明写 **"Lightweight tasks may be PRD-only"**。两条规则直接冲突：
轻量任务据称只需 `prd.md`，却仍被要求手工整理两个 manifest。

**结论**：加回 complex 限定不是反转 #292，是**把它实现完整**。这也正好消除轻量任务
最大的一处规划摩擦 —— 无需新增任何档位机制。

### 修正 2：`[workflow-state:completed]` 不是死代码，是**有意保留**

原判断：`:276-278` 该块自述 DEAD，应删除。

**实际情况**：`regression.test.ts:3735` 有专门断言
（`[workflow-state-r3-completed] ... block is present and well-formed`），
`workflow.md:268-274` 的注释也写明是为将来「显式 in_progress→completed 转换」保留的。
**不删。** 原判断过于草率。

## 需求

### R1 — JSONL ready gate 加回 complex 限定
- `:443`、`:463`、`:482` 三处补上限定，与 `:164` 的 lightweight/complex 之分一致。
- 相应更新 `regression.test.ts:3662-3669` 的断言文本。
- **保留 `[#292]` 测试本身**，只把断言调整为复杂任务版本 —— 不得连同 #292 的把关能力一起丢掉。
- `[workflow-state:planning]` 的 breadcrumb 同步（`regression.test.ts:3651` 锁了原句）。
- brainstorm 系列模板（`common/skills/brainstorm.md`、`codex/skills/brainstorm/SKILL.md`、
  `copilot/prompts/brainstorm.prompt.md`）的对应措辞同步，三份必须一致
  （`regression.test.ts:3683-3691` 逐份断言）。

### R2 — 消除 3.3 与 3.4 的重复判断
`:605` 的 3.3 强制 spec update（"即使结论是无需更新也要走一遍判断"）与 `:609`
的 3.4 spec-sync preamble 问的是同一个问题。保留一处，另一处改为指向它。

### R3 — 承接子任务 3 移交的 D6（agent/skill 双形态）
`trellis-check` 同时以 agent（`claude/agents/trellis-check.md`）与 skill
（`common/skills/check.md`）存在，内容不同且都可被自动触发。
`workflow.md:226` 只说 "prefer the Agent form"，未排除 skill 被自动触发。
需明确二者的适用边界（子代理平台用 agent 形态，inline 平台用 skill 形态），
必要时收窄 `configurators/shared.ts` 中 `SKILL_DESCRIPTIONS` 的 check 描述。

## 约束

- **不得削弱 #292 的把关**：复杂的子代理任务仍必须有真实 manifest 条目。
- **breadcrumb 不变量**：改动 `[required · once]` 标记或 breadcrumb 时，
  两者必须同步（`workflow.md:113-118` 的契约注释）。
- **模板双路径一致**：`.trellis/spec/cli/backend/configurator-shared.md`。
- **不新增分档机制**：轻量/复杂之分已存在于 `:164`，本任务只让它生效，不发明第三档。
- 不删 `[workflow-state:completed]`（见修正 2）。

## Acceptance Criteria

- [ ] 轻量任务（仅 `prd.md`）在子代理平台上不再被 JSONL ready gate 阻挡；
      复杂任务仍被阻挡。
- [ ] `[#292]` 测试仍存在且仍能拦住「复杂任务 seed-only manifest 就 start」。
- [ ] 三份 brainstorm 模板措辞一致（`regression.test.ts` 逐份断言通过）。
- [ ] 3.3 与 3.4 不再各问一次同样的 spec 判断。
- [ ] D6：agent 与 skill 两种 check 形态的适用边界明确，不会在同一平台上双触发。
- [ ] `pnpm typecheck` 与 `test` 全绿（基线：54 文件 / 1306 passed / 1 skipped）。
- [ ] scratch 目录 `trellis init --claude -y` 冒烟通过。

## Notes

- 顺带处理：上游遗留任务 `06-24-issue-292-jsonl-gate` 的 4 条验收标准均已打勾但一直挂在
  in_progress，本轮归档（用户已同意）。
- 原 PRD 提到的「14 平台变体块占 workflow.md 大量篇幅」属产品决策（是否收缩平台支持），
  不在本任务范围，仍记于父任务待定。
