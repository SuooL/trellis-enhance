# Journal - suool (Part 1)

> AI development session journal
> Started: 2026-07-08

---



## Session 1: 子任务 0：修复断裂步骤(矛盾注入 + create-pr 缺失)

**Date**: 2026-07-27
**Task**: 子任务 0：修复断裂步骤(矛盾注入 + create-pr 缺失)
**Branch**: `feature/subtask3-mcp-probe`

### Summary

移除 shared-hooks 里与 agent 定义冲突的 check workflow 硬编码及 L1-L5 悬空引用(5 平台自足性已逐个验证);实现 task.py create-pr 并让它承接此前无人认领的 git push,补 7 例集成测试(含变异验证)。实测发现:trellis-check 的 Codex 跨模型审查在子代理内失效(mcp__* 通配符下拿不到任何 MCP 工具),本仓 CI 无 diff-coverage 门禁且合并后远端分支未删。子代理定义在会话启动时加载,frontmatter 修法需重启会话验证。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `822072c9` | (see git log) |
| `6e14f43f` | (see git log) |
| `03042e73` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: 子任务 1：让已有的轻量/复杂之分真正生效

**Date**: 2026-07-27
**Task**: 子任务 1：让已有的轻量/复杂之分真正生效
**Branch**: `feature/subtask1-wrapup`

### Summary

workflow.md 的 JSONL ready gate 三处丢了 #292 原本的 complex 限定,导致轻量任务也被拦,与同文件'Lightweight tasks may be PRD-only'冲突。补回限定即消除摩擦,未新增任何分档机制。[#292] 测试保留并同时锁住收紧与豁免两半。顺带:3.3/3.4 去除重复的 spec 判断;D6 用收窄 skill 描述解决(有 agent 的平台不再双触发)。两处原审计判断被推翻并记录:JSONL 门禁非'虚设'而是刻意收紧后丢了限定词;[workflow-state:completed] 非死代码而是有测试保护的有意保留。归档上游遗留任务 06-24-issue-292-jsonl-gate。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `ca1f70b8` | (see git log) |
| `886e62a1` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: 子任务 2：Git/CI 修缺陷 + 让 diff-coverage 真正自用

**Date**: 2026-07-27
**Task**: 子任务 2：Git/CI 修缺陷 + 让 diff-coverage 真正自用
**Branch**: `feature/subtask2-wrapup`

### Summary

两份分歧的 CI 合并为一份:lint 此前只在 main 路径运行、feature→dev 从不执行(启用后第一个 PR 就抓到真错误);diff-coverage 硬门禁此前只存在于发给用户的模板里,现本仓启用,core 与 cli 均出 cobertura 报告(core 占三分之一源码,只测 cli 会留静默盲区)。门禁已实地验证会咬人:临时加入未测试函数后精确报出 0% 覆盖并判失败。修 base_branch 串台(钩子从 dev 切出即无条件记 dev,补 3 例测试并变异验证)。修 --delete-branch(auto-merge 自带的 delete_branch 默认 false 会覆盖仓库设置),模板同步该修复,两次 PR 验证分支确被自动删除。按用户要求收敛手工步骤 10 项→5 项,砍掉本地无法验证的 diff coverage 核对等纯仪式项。刻意不加 paths-ignore(必需检查被跳过会永久阻塞 auto-merge)。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `7e49dc63` | (see git log) |
| `42e6471b` | (see git log) |
| `3f053e33` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: 子任务 4：对抗性审查降本与收窄触发

**Date**: 2026-07-28
**Task**: 子任务 4：对抗性审查降本与收窄触发
**Branch**: `feature/subtask4-wrapup`

### Summary

Codex 调用由 1-5 次不可预测钉死为恒定 1 次(所有角色进同一 prompt);默认角色数 2-5 → 2-3;输出改为按需落盘(短问题直接答完,不再强制写文件+二次跳转);触发词删掉 'a second independent opinion' 与 '找出方案的缺陷',并显式声明日常措辞不触发、审代码 diff 归 trellis-check。更正此前审计的「最多 11 次调用」——Panel A 是同会话推理而非 N 次模型调用。过程中撞到自己造的 bug:create-pr 省略 --body 导致 gh 非交互模式失败,原有 7 例测试只验 --dry-run 文本从未真正调用 gh,已修并补真实失败路径断言。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `4c85cff8` | (see git log) |
| `5941cc96` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete
