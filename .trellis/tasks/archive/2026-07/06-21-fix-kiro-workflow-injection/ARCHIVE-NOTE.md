# 归档说明

**判定:ALREADY_FIXED(修复已合入,原 `status: in_progress` 是陈旧状态)。归档于 2026-07-28。**

## 依据

修复落在 `fbb38c93 fix(kiro): wire per-turn workflow injection for the main session`(2026-06-21),已验证为当前 `dev` 的祖先。`implement.md` 步骤 1-5 全部到位:

- **步骤 1(能力表 + 错误注释)**:`templates/shared-hooks/index.ts:61-68` 已改为 "Kiro supports per-turn + spawn hooks on both surfaces",旧的 "only agentSpawn" 说法已删;`SHARED_HOOKS_BY_PLATFORM.kiro`(`:103-107`)= `["session-start.py", "inject-workflow-state.py", "inject-subagent-context.py"]`。
- **步骤 2(Kiro stdout 契约)**:`templates/shared-hooks/inject-workflow-state.py:382-388` —— `if platform == "kiro": print(breadcrumb); return 0`,绕开 `hookSpecificOutput` 信封,且条件隔离使 Gemini/Claude 路径不受影响(`:390-398`)。`session-start.py:822-827` 同款分支。Kiro 检测走 `KIRO_PROJECT_DIR` / `.kiro` 脚本路径(`:105,127`)。附带加固:`:310-317` 的 `_load_hook_input()` 避免 Kiro IDE `runCommand` 留着 stdin 时永久阻塞。
- **步骤 3(CLI 主 agent)**:`templates/kiro/agents/trellis.json` 存在,`hooks.agentSpawn → session-start.py`、`hooks.userPromptSubmit → inject-workflow-state.py`、`resources: ["file://.trellis/workflow.md"]`;3 个子 agent JSON 保持 `agentSpawn → inject-subagent-context.py`。在 `templates/kiro/index.ts` 接线,`{{PYTHON_CMD}}` 由 `configurators/kiro.ts:36-49` 解析。
- **步骤 4(IDE hook)**:`templates/kiro/hooks/trellis-workflow-state.kiro.hook` 为 `when:{type:"promptSubmit"}` + `then:{type:"runCommand", …inject-workflow-state.py, timeout:30}`。
- **步骤 5(测试)**:`test/templates/kiro.test.ts`(5 例)+ `test/scripts/inject-workflow-state-kiro.integration.test.ts`(4 例),归档核验时实跑 **9/9 通过**。
- **spec 已更新**:`.trellis/spec/cli/backend/platform-integration.md:1539` 记录了 Kiro 的 per-turn 事件、纯 stdout 契约与激活命令。

## 残留(对本 fork 不适用)

- `implement.md` 步骤 6(docs-site 中英页面):文档站是独立上游仓库,本仓库无 `docs/`。
- 步骤 7 的真机 Kiro 验证:已在 spec 中显式记录为待办(`**Real-machine note:** … pending Kiro hardware verification`),代码侧无待修项。
