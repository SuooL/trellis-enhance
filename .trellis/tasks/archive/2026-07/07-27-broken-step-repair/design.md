# Design — 修复断裂步骤

## 缺陷 1：hook 注入的 workflow 与 agent 定义冲突

### 调研结论（已独立验证）

装 `inject-subagent-context.py` 的平台**只有 5 个**
（`templates/shared-hooks/index.ts:79-109`，测试锁定于 `shared-hooks.test.ts:59-73`）：

| 平台 | check agent 定义 | 是否自足 | 移除注入后 |
|---|---|---|---|
| claude | `claude/agents/trellis-check.md`（116 行，委托 Codex GPT-5.5） | 是 | **消除真冲突** |
| cursor | `cursor/agents/trellis-check.md`（`:50-81` 完整 Step 1-4） | 是 | 消除纯重复 |
| codebuddy | `codebuddy/agents/trellis-check.md`（`:51-80` 完整 Step 1-4） | 是 | 消除纯重复 |
| droid | `droid/droids/trellis-check.md`（`:43-72` 完整 Step 1-4） | 是 | 消除纯重复 |
| kiro | `kiro/agents/trellis-check.json`（workflow 内嵌于 `prompt` 字段） | 是 | 消除纯重复 |

codex / gemini / qoder / copilot / trae 是 pull-based，**不装此 hook**，不受影响。

**无任何测试锁定被删文本** —— 已 grep `packages/cli/test`，`impact radius` /
`Check item by item` / `Must execute complete checklist` / `L1-L5` 零命中。
仅 `<!-- trellis-hook-injected -->` 标记被断言，而该标记由独立行发出，不在删除范围内。

`impact radius analysis (L1-L5)` 自本仓首次提交（`1c616225 init project`）起即存在，
从未有过定义。属历史遗留噪音，直接删除，不需要替代物。

### 决策

**`build_check_prompt()` 删除 `## Workflow` 与 `## Important Constraints` 两节，
只保留上下文注入与任务转述。**

职责边界确立为：**hook 管上下文注入，agent 定义独占流程。**

依据：该 hook 位于 `shared-hooks/`，跨 5 个平台共用；而流程是平台相关的
（claude 委托 Codex，其余 4 家原生自查）。在共用 hook 里写死一套流程，
等于把某一平台的流程强加给全部平台 —— 这正是当前 claude 冲突的成因。
5 个消费方全部自足，删除无缺口。

保留 `<!-- trellis-hook-injected -->` 标记（被测试断言，且 agent 定义靠它判断
hook 是否生效 —— 见 `claude/agents/trellis-check.md:22-25`）。

### 范围附加：opencode 的 JS 孪生实现

`opencode/plugins/inject-subagent-context.js:246-256` 是同一 hook 的独立 JS 复刻，
带有同样的硬编码 workflow（无 L1-L5，程度较轻）。opencode 的 agent
（`opencode/agents/trellis-check.md:58-93`，完整 Step 1-4）同样自足。

**决定一并修改**。理由：两份实现是孪生关系，只改一份会制造分歧，
而分歧本身就是下一个人要付的成本。这是有意的范围扩大，已在此记录。

### 不动的部分

- `build_implement_prompt()`（`:351-383`）：与 `trellis-implement.md` 无冲突，
  仅为无害重复（同样 4 步同序）。重复属"减重"范畴，归子任务 3，此处不动。
- `build_finish_prompt()`（`:421-460`）：其 `[finish]` 触发词疑似死代码
  （`workflow.md` 与各命令均未指示 dispatch prompt 含字面量 `[finish]`）。
  **仅记录，不处理** —— 判定死代码需要独立确认，不在本任务范围。已记入父任务 PRD 待办。

## 缺陷 2：`task.py create-pr`

### 契约

```
task.py create-pr [name] [--dry-run]
```

- `name` 省略时取当前活跃任务（`cmd_current` 的既有解析逻辑）。
- 从 `task.json` 读 `branch` 与 `base_branch`。`base_branch` 已由
  `git_branch.py:215-217` 在 `after_create` 时自动设为 `dev`。
- 行为：`git push -u origin <branch>` → `gh pr create --base <base_branch> --head <branch>
  --title <任务标题> --body <取自 prd.md 的 Goal 段>`。
- `--dry-run`：打印上述两条命令，**不执行任何副作用**，退出码 0。

### 降级矩阵（全部退出码非 0，输出可执行提示，无栈回溯）

| 情形 | 检测 | 输出 |
|---|---|---|
| 非 git 仓库 | `git rev-parse --git-dir` 失败 | 说明本命令仅适用于 git 仓库 |
| `branch` 未设置 | `task.json` 无 `branch` | 提示 `task.py set-branch <task> <branch>` |
| 当前分支 ≠ 任务分支 | `git rev-parse --abbrev-ref HEAD` 比对 | 提示切分支，或用 `--head` 覆盖 |
| 无 `gh` | `shutil.which("gh")` 为空 | **打印等价手工命令**（push + `gh pr create` 全文），让用户可复制执行 |
| `gh` 未登录 | `gh auth status` 非 0 | 提示 `gh auth login`，并打印等价手工命令 |
| PR 已存在 | `gh pr view --json url` 成功 | 打印既有 PR 链接，退出码 0（幂等，非错误）|

**无 `gh` 时必须给出可复制的手工命令**，而不是失败退出 —— 否则只是把撞墙换个位置。
参照 `git_branch.py` 既有的 safe-skip 输出风格。

### 文档同步

`create-pr` 落地后，以下三处从"指向不存在的命令"变为真实可执行，无需改动措辞：
`workflow.md:71`、`workflow.md:667`、`git-workflow.md:94`。

需**新增**的是 push 的归属说明 —— 当前 `workflow.md:655` 说 "Never push to remote"
（3.4 提交步骤），3.5 却要求开 PR，中间的 push 无人认领。
修法：在 3.5 明确 "`create-pr` 承担 push"，消除 3.4 禁令与 3.5 需求之间的空隙。

## 风险

- `create-pr` 是新增子命令，不改动既有命令行为 → 回归面小。
- 删除 hook 注入文本会改变 5 个平台的 prompt 内容。无测试锁定该文本，
  但需跑一次 `trellis init` 冒烟确认生成产物完好。
- 模板双路径一致性：本任务改的是 `shared-hooks/*.py` 与 `scripts/task.py`，
  均为整文件复制而非 configurator 逐段渲染，双路径风险低。仍需 `test` 全绿确认。
