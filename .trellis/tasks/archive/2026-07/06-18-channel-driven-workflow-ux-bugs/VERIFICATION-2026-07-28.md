# 核验记录 2026-07-28(fork 侧只读复核)

清理上游遗留活跃任务时对本任务做了一次代码复核。**结论:两个 bug 都仍然存在,任务保留为活跃。**
但 PRD 对 Bug 2 的根因判断是**错的**,且两个 bug 在当前 fork 里的触发路径实际是死的 —— 详见下文。

## Bug 1:`dispatch_mode` 未与 workflow 切换联动

**仍存在,严重度:低(仅影响以 Codex CLI 为平台的用户)**

- `packages/cli/src/commands/workflow.ts:297-317` —— `writeWorkflow()` 之后唯一的副作用是 `warnAboutMissingAgents()`(检查 `.trellis/agents/*.md`)。没有写 config,也没有 `dispatch_mode` 提示。
- `packages/cli/src/configurators/workflow.ts:139-148` —— 注释明确承认「user can switch to a channel-driven workflow at any time via `trellis workflow --template`」,却只分发 agent 文件,没做 config 联动。
- `dispatch_mode` 至今是注释掉的、且仅 Codex 生效:`templates/trellis/config.yaml:120`(`#   dispatch_mode: inline  # or "sub-agent" ...`),消费方只有 `templates/shared-hooks/inject-workflow-state.py:229-275` 和 `templates/trellis/scripts/common/workflow_phase.py:148-164`,服务于 `codex-inline` / `codex-sub-agent` 两个虚拟平台。

**修复形状**:在 `commands/workflow.ts`(以及 init 路径 `commands/init.ts:1881-1990`)写入非 native workflow 后,或补 `.trellis/config.yaml`,或在 `warnAboutMissingAgents` 旁打印提示。约 20 行,单点改动。

## Bug 2:`trellis update` 每次都重新询问 `workflow.md`

**仍存在,严重度:中(机制真实)/ 低(当前 fork 触发不到)**

⚠️ **PRD 猜的根因是错的。** PRD 认为 hash 没被移除;实际上移除**确实发生了**:

- `commands/workflow.ts:144-158` 的 `applyHashContract()` 对任何非 native id 都会调 `removeHash(cwd, PATHS.WORKFLOW_GUIDE_FILE)`;`commands/init.ts:1985-1990` 在 `--workflow <non-native>` 时同样处理。测试已断言:`test/commands/workflow.integration.test.ts:124,164,180`。

**真实根因是它与 update 的交互:**

1. `commands/update.ts:886` 无条件用 **native** 正文播种更新集:`files.set(\`${DIR_NAMES.WORKFLOW}/workflow.md\`, workflowMdTemplate);`
2. `analyzeChanges()`(`update.ts:988-1012`)把「内容不同 + 无存储 hash」判为用户已修改 → 进 `changedFiles`。
3. `isKnownUntrackedTemplate`(`update.ts:247-261`)只白名单了 `AGENTS.md`;`PROTECTED_PATHS`(`update.ts:115-121`)不含 `workflow.md`。
4. 于是 `update.ts:1071-1077` 把 `.trellis/workflow.md` 打印在「Modified by you (need your decision)」下,`promptConflictResolution()`(`update.ts:1105`)**每次运行**都问 overwrite/skip/create-new —— 正是上报的症状。

这个设计张力在 `test/commands/workflow.integration.test.ts:182-184` 的测试注释里已有记录。

**修复形状**:把选中的 workflow id 持久化(如写入 `.trellis/config.yaml`),并让 `collectTemplateFiles` 在非 native workflow 生效时跳过 `workflow.md`(或视为 protected)。涉及 `update.ts`、`commands/workflow.ts`、`commands/init.ts` 与 hash 契约测试。

## 为什么保留而不立即修:当前 fork 触发不到

本 fork 指向自有 marketplace —— `packages/cli/src/utils/template-fetcher.ts:18-21` → `https://raw.githubusercontent.com/SuooL/trellis-marketplace/main/index.json`,而该 index 目前返回 `{"version":1,"templates":[]}`。

因此 `trellis workflow --list` 只能提供 `native`,除非用户显式传 `--workflow-source` 指向上游或第三方 marketplace,否则两个 bug 在 fork 生成的项目里都触发不到。

**顺带发现的陈旧面**(不属本任务,但相关):`packages/cli/src/cli/index.ts:117,259,263` 仍把 `tdd` / `channel-driven-subagent-dispatch` 当示例 id 宣传,而本 fork 自己的 marketplace 无法提供它们。
