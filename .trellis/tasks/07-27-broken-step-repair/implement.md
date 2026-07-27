# Implement — 修复断裂步骤

分支：`feature/broken-step-repair`（已由 `after_create` 钩子创建）

## 基线记录（改动前先跑一次，留底以便对比）

```bash
pnpm --filter trellis-enhance typecheck
pnpm --filter trellis-enhance test 2>&1 | tail -20   # 记录既有失败：test/templates/trellis.test.ts 2 项
```

> **实测基线（2026-07-27）：53 文件全绿，1299 passed / 1 skipped / 0 failed。**
> CLAUDE.md 与本任务 prd.md originally 声称"有 2 个既有失败（test/templates/trellis.test.ts
> 缺 marketplace/workflows/{native,tdd}/workflow.md）"—— **该说法已过期，实测不成立**。
> 基线干净，因此之后出现的任何失败都是本任务引入的，不得以"既有失败"解释。
> （CLAUDE.md 的这处过期描述记入父任务待办，本任务不改。）

---

## 阶段 A：缺陷 1 — 移除 hook 中的硬编码 workflow

### A1. 改 `templates/shared-hooks/inject-subagent-context.py`
`build_check_prompt()`（`:386-418`）删除 `## Workflow` 与 `## Important Constraints` 两节，
保留 `<!-- trellis-hook-injected -->` 标记、`## Your Context`、`## Your Task`。

- 验证：`grep -rn "L1-L5\|impact radius" packages/cli/src` → **零命中**
- 验证：`grep -n "trellis-hook-injected" packages/cli/src/templates/shared-hooks/inject-subagent-context.py` → 仍在

### A2. 改 `templates/opencode/plugins/inject-subagent-context.js`
`:246-256` 的 check 分支同样移除 `## Workflow` 与 `## Important Constraints`。
保持与 A1 的结构一致（孪生实现不得分歧）。

- 验证：`node --check packages/cli/src/templates/opencode/plugins/inject-subagent-context.js`

### A3. 阶段验证
```bash
pnpm --filter trellis-enhance typecheck
pnpm --filter trellis-enhance test 2>&1 | tail -20   # 与基线逐项比对，不得有新增失败
```

**回滚点 1**：A 阶段仅删文本、不加逻辑。异常则 `git checkout -- <两个文件>`。

---

## 阶段 B：缺陷 2 — 实现 `task.py create-pr`

### B1. 实现 `cmd_create_pr`
位置：`templates/trellis/scripts/task.py`。按 `design.md` 的契约与降级矩阵实现。

按既有代码风格（参考 `cmd_set_base_branch` / `git_branch.py` 的 safe-skip 输出）。
**先读周边函数再动手** —— 匹配现有的错误输出格式与退出码约定，不要另起一套。

### B2. 注册子命令
- argparse：在 `task.py:387-472` 区域加 `p_create_pr`，参数 `name`（可选位置参数）+ `--dry-run`
- dispatch 表：`:480-497` 的 `commands` 字典加 `"create-pr": cmd_create_pr`
- `show_usage()` 的命令清单同步（对照 `:314-322`）

- 验证：`python3 packages/cli/src/templates/trellis/scripts/task.py --help | grep create-pr`

### B3. 降级矩阵逐项实测
在本仓库真实执行，逐条确认输出可读、退出码正确、无栈回溯：

```bash
cd /Users/suool/git/Trellis
python3 .trellis/scripts/task.py create-pr --dry-run          # 打印两条命令，无副作用
PATH=/usr/bin:/bin python3 .trellis/scripts/task.py create-pr --dry-run   # 模拟无 gh
(cd /tmp && mkdir -p nogit-$$ && cd nogit-$$ && python3 /Users/suool/git/Trellis/.trellis/scripts/task.py create-pr)  # 非 git 仓库
```

> 注意：`.trellis/scripts/task.py` 是本仓库 dogfood 的副本，`packages/cli/src/templates/...`
> 才是模板源。**两者都要更新**，否则本仓库用的和发出去的不一致。改完确认两份一致。

### B4. 阶段验证
```bash
pnpm --filter trellis-enhance typecheck
pnpm --filter trellis-enhance test 2>&1 | tail -20
```

**回滚点 2**：B 阶段是纯新增（新函数 + 新注册），不改既有命令。
异常则移除新增部分，A 阶段成果不受影响。

---

## 阶段 C：文档同步

### C1. push 归属
`templates/trellis/workflow.md` Phase 3.5（`:659-676`）明确写出 `create-pr` 承担 `git push`，
消除 `:655`「Never push to remote」与 3.5「开 PR」之间的空隙。

### C2. 一致性检查
确认 `workflow.md:71`、`workflow.md:667`、`git-workflow.md:94` 三处对 `create-pr` 的
描述与 B1 实现的实际契约相符（尤其 `--dry-run` 的存在与语义）。

---

## 阶段 D：全量验证

```bash
pnpm --filter trellis-enhance build
pnpm --filter trellis-enhance typecheck
pnpm --filter trellis-enhance test 2>&1 | tail -20     # 与基线比对

# 冒烟：生成产物完好，且含 create-pr
d=$(mktemp -d); (cd "$d" && git init -q && \
  node /Users/suool/git/Trellis/packages/cli/dist/cli/index.js init --claude -y -u tester && \
  python3 .trellis/scripts/task.py --help | grep create-pr && \
  grep -c "L1-L5" .trellis/../ -r 2>/dev/null; echo "smoke dir: $d")
```

冒烟必须确认：
- 生成的 `.trellis/scripts/task.py` 含 `create-pr`
- 生成的 hook 文件中 `L1-L5` 零命中
- init 无报错

---

## 审查门

- 阶段 A 与 B 各自独立完成后即可送 `trellis-check`，不必等到 D。
- **本任务不做减重** —— 若在改动过程中发现提示词冗余、CI 问题、required 标记问题，
  记入父任务 PRD 的对应子任务段落，**不在此处顺手改**。

## 完成标准

见 `prd.md` 的 Acceptance Criteria，逐条勾选后方可进入 Phase 3。
