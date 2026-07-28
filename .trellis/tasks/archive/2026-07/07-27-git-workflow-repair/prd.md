# Git/CI：修实测出来的缺陷，并让 diff-coverage 门禁真正自用

父任务：`07-27-workflow-friction-reduction`（子任务 2）

## Goal

把本仓 CI 与它自己发布的标准对齐，并修掉三个实跑验证过的缺陷。

## 缺陷（全部为实测，非推断）

1. **三份分歧的 CI 定义**：`.github/workflows/ci.yml`（只在 `main` 触发，有 lint）、
   `ci-dev.yml`（只在 `dev` 触发，无 lint）、`templates/git-workflow/workflows/ci.yml`
   （发给用户，含 diff-coverage）。后果：`pnpm lint` 在 feature→dev 这条日常路径上
   **从不运行**；diff-coverage 硬门禁**只存在于发给别人的模板里**。
   实证：一个新增 ~150 行、零测试的 PR（#3）一路绿灯合入 `dev`。

2. **`base_branch` 记成当前分支**：`task_store.py:294,313` 的 `cmd_create` 写入当前分支，
   `git_branch.py:216-217` 只在空值或 `main` 时纠正。连建 5 个子任务时每个的 base 都变成
   上一个的 feature 分支；本轮又复发一次。三分支模型下 PR 目标恒为 `dev`。

3. **合并后远端分支不删**：`delete_branch_on_merge=true` 已开、分支无保护、无 ruleset，
   但 PR #3 合并后 `origin/feature/broken-step-repair` 仍在（API 直查确认）。
   假设：`ci-dev.yml:66` 的 `gh pr merge --auto --squash` 缺 `--delete-branch`，
   auto-merge 请求自带的 `delete_branch` 默认 false 并覆盖仓库级设置。

## 决定（用户 2026-07-27 确认）

- **本仓启用 diff-coverage**（吃自己的狗粮）。
- **两份 CI 合并成一份**，同时监听 `main` 与 `dev` 的 PR，auto-merge 仅对 `dev` 启用。

## 约束

- **门禁不得有盲区**：`core`（51 源文件 / 17 测试）目前无 coverage 配置。只测 `cli`
  会让三分之一代码静默通过 —— 有盲区的门禁给的是虚假保证，比没有更糟。两个包都要出报告。
- **不加 `paths-ignore`**：`verify` 是 `dev` 的必需检查，用 `paths-ignore` 跳过会让检查
  永不上报，auto-merge 永久阻塞。文档改动的快速通道需另想办法，本轮不做。
- 阈值 80 收敛到一处定义，不再散落 5 处。

## Acceptance Criteria

- [ ] 单一 CI workflow：typecheck + lint + test(coverage) + build + verify output + diff-coverage。
- [ ] `cli` 与 `core` 均产出 cobertura 报告，diff-cover 同时读取两者。
- [ ] `pnpm lint` 在 feature→dev 路径上确实运行（看 CI 日志确认）。
- [ ] 新建任务的 `base_branch` 恒为 `dev`，在 feature 分支上创建也不例外（有测试覆盖）。
- [ ] 合并后远端 feature 分支被自动删除（下一个 PR 实地验证）。
- [ ] `pnpm typecheck` 与 `test` 全绿（基线：54 文件 / 1306 passed / 1 skipped）。

## Notes

- 记账提交孤儿化（archive/journal 落在已 squash-merge 的分支上）与 `set-base-branch`
  文档冗余留待后续，本轮不做，避免范围膨胀。
