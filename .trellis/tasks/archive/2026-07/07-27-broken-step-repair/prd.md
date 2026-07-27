# 修复断裂步骤：矛盾注入与 create-pr 缺失

父任务：`07-27-workflow-friction-reduction`（子任务 0，先行）

## Goal

修复两个**独立缺陷**。它们与"流程减重"无关，但同样表现为卡顿/空转，且当前每次使用都在付出代价。
本任务只做修复，不做减重 —— 减重由子任务 1–4 承担。

## 缺陷 1：check agent 收到两套互斥的 workflow

### 现状（已验证）

`packages/cli/src/templates/shared-hooks/inject-subagent-context.py:386-418` 的
`build_check_prompt()` 在注入上下文的同时，**硬编码了一套原生自查 workflow**：

```
## Workflow
1. Get changes - Run `git diff --name-only` and `git diff`
2. Check against specs - Check item by item against specs above
3. Self-fix - Fix issues directly, don't just report
4. Run verification - Run project's lint and typecheck commands

## Important Constraints
- Must execute complete checklist in check specs
- Pay special attention to impact radius analysis (L1-L5)
```

而 Claude 平台的 agent 定义 `templates/claude/agents/trellis-check.md:51-71` 规定的是
**把审查委托给 Codex GPT-5.5（effort xhigh, read-only）**，Claude 只做编排与修复。

两段文本进入同一个 prompt：hook 注入的部分在前（`# Check Agent Task`），
agent 定义在系统提示里。agent 面对"逐条自查"与"委托 Codex"两条指令，
可能两条都执行 = 全量原生自查 + 一次 Codex xhigh 全量审查。

### 附带问题：悬空引用

`:418` 的 `impact radius analysis (L1-L5)` —— 全仓 grep `impact radius|L1-L5` **仅此一处命中**
（已验证）。L1–L5 从未定义。这是在要求模型"特别注意"一个不存在的概念，
只会诱发无根据的臆测。

### 修复方向（待研究结论确认）

倾向：**`build_check_prompt()` 只负责注入上下文，不规定 workflow**。
理由：该 hook 位于 `shared-hooks/`，被多个平台共用；而 workflow 是**平台相关**的
（Claude 版委托 Codex，pi 版 36 行原生自查）。在共用 hook 里写死一套 workflow，
等于把某一个平台的流程强加给所有平台。职责应当是：**hook 管上下文，agent 定义管流程。**

阻断条件：若某个运行此 hook 的平台其 check agent 定义过薄、本身不含 workflow，
则移除注入会让它失去必要指令。此点由 `research/` 下的调研结论裁决 —— 若存在这类平台，
改为「保留平台中立的**结果性**要求（自修而非仅报告、跑验证），删除步骤序列与 L1-L5」。

同时需确认 `build_implement_prompt()`(:351-383) 与 `build_finish_prompt()`(:421-460)
是否有同类矛盾；有则一并修，无则不动。

## 缺陷 2：Phase 3.5 的必做命令不存在，且 push 无人认领

### 现状（已验证）

`task.py` 的子命令表为：
`create, add-context, validate, list-context, start, current, finish, set-branch,
set-base-branch, set-scope, set-status, archive, add-subtask, remove-subtask, list, list-archive`
—— **没有 `create-pr`**，`grep create_pr` 在整个 `scripts/` 下零命中，
落到 `task.py:499-501` 的 `show_usage(); return 1`。

但三处文档要求执行它：
- `templates/trellis/workflow.md:71`（命令清单）
- `templates/trellis/workflow.md:667`（Phase 3.5，标 `[required · once]`）
- `templates/git-workflow/spec/git-workflow.md:94`（"When all pass, open the PR (`task.py create-pr`)"）

**连带缺口**：`workflow.md:655` 明确 "Never push to remote in this step"（3.4 提交步骤），
紧接着 3.5 就要求开 PR。而 `git push` 这个动作在 `workflow.md` 与 `git-workflow.md` 中
**从未被任何步骤认领** —— 开发者必须自己想到要先 push。

### 修复方向

实现 `task.py create-pr`，使其成为 push + 建 PR 的唯一入口，从而同时补上 push 缺口。
契约要点（细节在 design 阶段定）：

- 解析当前任务 → 取 `branch` 与 `base_branch`（`base_branch` 由 `git_branch.py:215-217`
  在 `after_create` 时已自动设为 `dev`）。
- push 当前 feature 分支到 origin（含 `-u` 建立追踪）。
- 调 `gh pr create --base <base_branch> --head <branch>`，标题取任务标题，
  正文可引用 `prd.md` 的 Goal / 验收标准。
- **安全降级**：非 git 仓库、无 `gh`、未登录、分支未设置、PR 已存在 —— 逐项给出可执行的
  提示而非栈回溯。参照 `git_branch.py` 既有的 safe-skip 风格。
- 支持 `--dry-run`（`workflow.md:71` 已声明该 flag，需真实实现）。

## 约束

- **模板双路径一致**：改动 configurator 渲染的模板时，init 写入路径与 update 收集路径
  必须逐字节一致，否则 `trellis update` 的 hash 追踪与测试会断
  （见 `.trellis/spec/cli/backend/configurator-shared.md`）。
- **不扩大范围**：本任务不做提示词减重、不动 CI、不改 required 标记、不碰 breadcrumb 不变量。
  发现的其他问题记入父任务 PRD，不在此处顺手改。
- `create-pr` 不得引入对 `gh` 的硬依赖 —— 无 `gh` 时必须给出等价的手工命令而不是失败退出。

## Acceptance Criteria

- [ ] `build_check_prompt()` 不再注入与平台 agent 定义冲突的 workflow；`L1-L5` 悬空引用消失
      （`grep -r "L1-L5" packages/cli/src` 零命中）。
- [ ] 调研结论已落盘于 `research/`，且所选方案与结论一致；若存在薄 agent 平台，
      已按替代方案（保留结果性要求）处理。
- [ ] `python3 task.py create-pr --dry-run` 能在本仓库跑通，打印将要执行的 push 与 gh 命令，
      且不产生任何副作用。
- [ ] `python3 task.py --help` 的子命令列表包含 `create-pr`。
- [ ] 无 `gh` / 未登录 / 非 git 仓库三种情形各自给出可执行提示，退出码明确，无栈回溯。
- [ ] `git push` 在 `workflow.md` Phase 3.5 与 `git-workflow.md` 中有明确归属
      （由 `create-pr` 承担，或显式写出手工步骤）。
- [ ] `pnpm --filter trellis-enhance typecheck` 通过；`test` 无新增失败
      （已知 2 个既有失败在 `test/templates/trellis.test.ts`，属环境问题，不计入回归）。
- [ ] scratch 目录 `trellis init --claude -y` 冒烟通过，生成的 `task.py` 含 `create-pr`。

## Notes

- 本任务完成后，子任务 3（子代理减重）才开始 —— 它假定注入路径已修好。
- 缺陷 2 的修复会改动 `git-workflow.md`，与子任务 2 有文件重叠；子任务 2 的 PRD
  需在本任务归档后复核，避免改动互相覆盖。
