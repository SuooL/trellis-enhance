# 解决记录 2026-07-28

两个 bug 均已修复,任务可归档。承接同目录 `VERIFICATION-2026-07-28.md` 的复核结论。

## Bug 1:`dispatch_mode` 未与 workflow 切换联动 —— 已修

复核时发现它比原 PRD 描述的更实质:非 native workflow 通常要求派发子代理,而 Codex 的
`codex.dispatch_mode` 默认 `inline`,其每轮 banner 的字面含义是
**"do not dispatch implement/check sub-agents"**(`inject-workflow-state.py:249-252`)。
内置 native workflow 用平行的 `<status>-inline` breadcrumb 变体化解了这个矛盾
(`inject-workflow-state.py:271-279`),marketplace workflow 没有这套变体,于是默认值
直接和用户刚选的 workflow 相冲突。

**实现**:`commands/workflow.ts` 新增 `warnAboutCodexDispatchMode()`,在写入非 native
workflow 后、且项目配置了 Codex、且 `config.yaml` 里没有未注释的 `dispatch_mode:` 时,
向 stderr 打印非阻塞警告。三条静默路径(native / 已显式设置 / 未配置 Codex)都有测试。

未做「自动改写 config.yaml」:`dispatch_mode` 是用户的策略选择,不该由切换 workflow 的
命令替用户决定。

## Bug 2:`trellis update` 每次重问 `workflow.md` —— 已修

**原 PRD 猜的根因是错的**(hash 移除确实发生了)。真实根因见
`VERIFICATION-2026-07-28.md`:`update.ts` 无条件用 native 正文播种更新集,而
`workflow.md` 的 hash 条目是被**故意**移除的,于是 `analyzeChanges()` 把它判成
「用户已修改」,每次运行都问 overwrite/skip/create-new。

**实现**:新增 `.trellis/.workflow-template` 标记文件记录当前 workflow id
(缺失 = native),并:

- `utils/workflow-resolver.ts` — `writeActiveWorkflowId` / `readActiveWorkflowId` / `hasNonNativeWorkflow`
- `commands/workflow.ts` + `commands/init.ts` — 切换/初始化时写入(native 则清除)
- `commands/update.ts` — 加入 `PROTECTED_PATHS`;`collectTemplateFiles` 在标记为非 native 时
  **完全不播种** `workflow.md`

**为什么用显式标记而不是复用「hash 条目缺失」这个信号**:缺失是歧义的 —— 既可能是
「用户选了非 native workflow」,也可能是「该项目早于 workflow.md 被 hash 跟踪的年代」。
在歧义上跳过更新,会让老项目的 workflow.md 静默冻结,这比它取代的那个提示更糟。

## 验证

- `pnpm typecheck` / `pnpm lint` 通过
- `pnpm test` 55 files / 1320 tests 全绿(本任务新增 11 例)
- diff-coverage **96%**(门禁 80%)
- 用真实构建产物做 A/B 实测:
  - 无标记(修复前行为)→ `Modified by you (need your decision): ? .trellis/workflow.md`
  - 有标记(修复后)→ 连续两次 update 均 `✓ Already up to date!`,内容保住,标记未被改写

## 顺带修正

- `update.ts` 的 "User data (preserved)" 列表原先给每个 protected path 硬加 `/`,
  把 `.developer`、`.workflow-template` 这类单值文件显示成目录。改为仅目录加斜杠。
- spec `commands-workflow.md`:原「Required built-ins」把 `tdd` /
  `channel-driven-subagent-dispatch` 列为内置(实际只有 `native`);并补上
  `.workflow-template` 的所有权契约 —— 说明它与既有「不要让 update 追逐所选变体」
  条款不冲突(它的作用是让 update **排除**该文件,而非追逐)。
