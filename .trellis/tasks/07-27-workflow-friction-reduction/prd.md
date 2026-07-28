# 工作流摩擦精简：四条流程逐条瘦身

## 背景

trellis-enhance 的四条自有流程在 dogfood 使用中主诉为**步骤太重 / 摩擦大**。
本次对四条流程做了只读审计（2026-07-27），结论是摩擦有三类来源，其中两类不是"设计得重"，
而是缺陷：

1. **真·冗余** —— 同一指令重复多遍、同一判断做两次、同一命令跑三遍。
2. **虚设门禁** —— 散文强制、运行时不校验的"必须"，或要求核对但本地无工具可核对的项。
3. **断裂步骤** —— 文档要求执行的命令不存在；文档承诺的自动行为在默认配置下必然失效。

第 3 类是 bug，不是重量问题，但它们同样表现为"卡住"，因此纳入同一批处理。

## 需求全集（审计发现，按子任务归属）

### 子任务 1 — `07-27-phase-flow-slimming`（Trellis 三阶段流程）
- `workflow.md:400-445` 的 1.3 Configure context 是 `[required · once]` 且设了 ready gate，
  但 `workflow.md:463` 自述运行时 tolerate 缺失/seed-only manifest → **虚设门禁**。
- `workflow.md:154-156` 的 triage 是二元的（建/不建 task）。`:164` 区分了 lightweight/complex，
  但 1.3、3.3、3.4 全是 `[required]`，**没有任何一步真的因"轻"而跳过** → 缺中间档。
- `workflow.md:605`（3.3 强制 spec update，"即使结论是无需更新也要走一遍"）与 `:609`
  （3.4 preamble 的 spec-sync 提问）**同一判断做两次**。
- `workflow.md:276-278` `[workflow-state:completed]` 块自述 DEAD；`:266` 3.1 已折叠但编号保留 → 死代码。
- 文件 746 行，占模板总量 40%，其中 `:292-308`、`:375-389`、`:494-544` 等为 14 平台变体块重复。

### 子任务 0 — `07-27-broken-step-repair`（断裂步骤，先行）
与"减重"无关的独立缺陷，当前正在持续造成损耗，优先于所有减重改动处理：

- **矛盾注入**：`inject-subagent-context.py:404-418` 给 check agent 注入原生逐条自查流程
  （"Check item by item" / "Must execute complete checklist" / "Run project's lint and typecheck"），
  而 `trellis-check.md:51-71` 说的是委托 Codex GPT-5.5。两套互斥流程进同一 prompt，
  agent 可能两套都跑 = 全量原生自查 + Codex xhigh 全量审查。
- **悬空引用**：同处 `:418` 的 `impact radius analysis (L1-L5)` 全仓仅此一处命中（已 grep 验证），
  L1–L5 从未定义 —— 让模型"特别注意"一个不存在的概念。
- **`task.py create-pr` 不存在**（已验证：子命令表无此项，`grep create_pr` 零命中），
  但 `workflow.md:71`、`workflow.md:667`（Phase 3.5，`[required · once]`）、
  `spec/git-workflow.md:94` 三处要求执行 → **必做步骤指向不存在的命令**。
- **`git push` 无人认领**：`workflow.md:655` 明确 "Never push to remote"，下一步 3.5 就要求开 PR。

### 子任务 2 — `07-27-git-workflow-repair`（Git/CI 标准）

> **2026-07-27 实测更新（PR #3 / #4 实弹跑出来的证据，优先级高于下方基于模板的审计）**
>
> **(a) 本仓有三份互相分歧的 CI 定义，且旗舰门禁自己不用：**
>
> | 文件 | 触发 | job | diff-cover |
> |---|---|---|---|
> | `.github/workflows/ci.yml` | `main` | `build` | 0 处（另有 Lint + Verify build output）|
> | `.github/workflows/ci-dev.yml` | `dev` | `verify` | **0 处** |
> | `templates/git-workflow/workflows/ci.yml`（发布给用户）| — | `verify` | 6 处 |
>
> 即 **diff-coverage ≥80% 硬门禁只存在于发给用户的模板里，trellis-enhance 自己不执行**。
> 该门禁在文档中被写了 5 处并作为 Definition of Done 的核心。
> 实证后果：一个新增 ~150 行、**零测试**的 PR（#3）一路绿灯合入 `dev`。
> 附带：`pnpm lint` 只在 `main` 路径的 `ci.yml` 里，feature→dev 这条日常路径上从不运行。
>
> **(b) 合并后远端分支未被删除**（与 `git-workflow.md:45-47` 的承诺矛盾）：
> `delete_branch_on_merge=true` 已开启、分支无保护、无 ruleset，但 PR #3 合并后
> `origin/feature/broken-step-repair` 仍存在（API 直查确认）。
> **假设（未验证）**：`ci-dev.yml:66` 的 `gh pr merge --auto --squash` 未带 `--delete-branch`，
> auto-merge 请求自带的 `delete_branch` 默认 false 并覆盖仓库级设置。加一个 flag 即可验证。
> 叠加已知的本地清理失效（squash 场景下 ancestry 检测必然失败），**远端与本地清理双双不生效**。

- **【2026-07-27 实测新增】`base_branch` 记录成当前分支，在 feature 分支上建任务必然出错。**
  `task_store.py:294,313` 的 `cmd_create` 把**当前分支**写进 `base_branch`
  （注释自述 "Record current branch as base_branch (PR target)"）。
  而 `git_branch.py:216-217` 只在该值为空或等于 `main` 时才纠正为 `dev` ——
  值是 `feature/xxx` 时两个条件都不满足，错误值被保留。
  本次连建 5 个子任务复现：每个任务的 base 都变成了**上一个任务的 feature 分支**
  （只有在 `dev` 上创建的第一个是对的）。在三分支模型里 PR 目标恒为 `dev`，
  所以只要不在 `dev` 上建任务，base 就是错的。
  由 `create-pr` 在实跑中暴露（gh 报 "No commits between feature/git-workflow-repair
  and feature/subtask3-mcp-probe"）。已手工修正 4 个任务的数据。
  **修法待定**：让 `cmd_create` 直接写 `dev`，或让 `git_branch.py` 无条件纠正。
  附带可考虑：`create-pr` 在调 gh 前预检 `base_branch` 是否存在于 origin。

- **本地分支清理必然失效**：`git_branch.py:152-159` 注释自述 ancestry 检查测不到 squash merge，
  而 `ci.yml:98` 用的正是 `--squash` → `spec/git-workflow.md:45-47` 承诺的自动清理 100% 不发生。
- **`ci.yml` 零逃生舱**：无 `paths-ignore`（改 README 也跑全量 npm ci+build+test+diff-cover）、
  无 skip 标签、草稿 PR 无守卫（draft 判断只在 auto-merge job 上，`:88`）、
  阈值 `--fail-under=80` 硬编码在 run 脚本（`:81`）、无 `workflow_dispatch`。
  对照 `release.yml:10` / `prune-branches.yml:13` 都有 dispatch，`deploy.yml:36` 有 opt-in 开关。
- **要求核对但不可核对**：`spec:89` 要求本地确认 diff coverage ≥80%，但仓库未提供任何本地
  diff-cover 工具，`ci.yml:78` 是在 runner 上临时 `pip install` → 开发者只能靠 CI 试错。
- **优先级倒挂**：唯一硬门禁（diff-coverage）本地无工具支持；而 `spec:61-62` 明说不阻塞合并的
  lint/type-check 被要求本地跑 ≥3 遍。
- `set-base-branch <task> dev` 冗余：`git_branch.py:215-217` 已在 after_create 自动设好。
- 记账提交孤儿化：archive/journal 提交落在已被 squash-merge、远端已删的 feature 分支上，
  无路径进入 `dev`。
- 阈值 80% 写死 5 处；`ci.yml` 无条件写入（非 Node 项目首个 PR 必红）。

### 子任务 3 — `07-27-subagent-prompt-slimming`（子代理与模型路由）
> 前置：矛盾注入与悬空引用已移至子任务 0。本子任务假定注入路径已修好，只做减重。

- 提示词样板占 47–57%（111/148/116 行）。对照 `pi/agents/trellis-check.md` 仅 36 行且职责完整。
- `trellis-research.md` 中"必须写文件、别贴回对话"重复 7 次（`:16,:24,:26,:59,:65,:139,:147`）。
- **check 无轻量档**：`trellis-check.md:49` 唯一提前退出是空 diff；改一行注释同样走完整
  diff → 粘 spec 全文 → xhigh 推理 → 逐条复核 → lint+typecheck+tests。
- **无超时/重试/体积预算**：`:84-86` 只处理 "failed or unreachable"，Codex 挂起时条件不成立会一直等；
  `:82` 的 "until green" 无迭代上限。
- lint/typecheck 跨 agent 重复 2–3 遍。
- `trellis-check` 同时以 agent（116 行，Codex 委托）和 skill（`check.md` 93 行，原生 6 步）存在，
  内容不同且都可被自动触发。

### 子任务 4 — `07-27-adversarial-review-tiering`（对抗性审查）
- **成本不可预测**：worst case 11 次模型调用（5 Opus role pass + 5 Codex 会话 + 1 综合）。
  `adversarial-review.md:23` 的 "or once with all roles" 是可选措辞而非规则 → 同一个
  `/trellis:question` 可能花 2 次也可能花 11 次。
- **无用户可选档位**：`:35` 的 Codex 不可达降级是故障降级，不是档位。
- **触发词过宽**：`shared.ts:257` 含 "a second independent opinion" / "找出方案的缺陷"，
  日常措辞即可命中。消歧说明写在 skill 正文 `:71`，但 matcher 只看 description → 匹配阶段不可见。
- **无条件落盘**：`:44-48` 强制写报告文件，`:65` 禁止贴回对话 —— 30 秒能答的问题也要走文件 + 二次跳转。
- 同一能力有 5 处入口声明（`shared.ts:257,:259`、`question.md:13`、`workflow.md:297,:306`）。

## 约束

- **不牺牲既有把关强度**：目标是去掉不产生价值的开销，不是降低质量门槛。
  凡涉及"跳过检查"的改动，必须明确其适用边界（何种 diff 规模/风险下适用）。
- **模板双路径一致**：改动 configurator 渲染的模板时，init 写入路径与 update 收集路径必须逐字节一致，
  否则 `trellis update` 的 hash 追踪与测试会断（见 `.trellis/spec/cli/backend/configurator-shared.md`）。
- **breadcrumb 不变量**：`test/regression.test.ts` 校验每个 `[required · once]` 步骤都必须在其
  phase 的 `[workflow-state:*]` 块中有对应强制行。改动 required 标记或 breadcrumb 时必须同步。
- **逐个来改**：四个子任务依次规划、实现、检查、归档，不并行。

## 跨子任务验收标准

1. 四个子任务各自独立通过 `pnpm --filter trellis-enhance typecheck` 与 `test`。
   ~~已知 2 个既有失败~~ —— **该说法自始就是错的**：2026-07-27 实测基线为
   53 文件全绿 / 1299 passed / 0 failed。CLAUDE.md 沿用的这句描述已过期，
   本 PRD 原样抄了下来。基线干净，因此本批次出现的任何失败都是本批次引入的。
2. 每个子任务完成后，在 scratch 目录跑一次 `trellis init --claude -y` 冒烟，
   确认生成产物无缺失、无语法错误。
3. **可度量的减重**：记录改动前后 `workflow.md` 与三个 agent 模板的行数，
   以及一次典型 check 的模型调用跳数。目标是有明确下降，具体幅度在各子任务 PRD 中定。
4. **断裂步骤全部可执行**：Phase 3.5 的每条命令都能真实跑通（或被替换为可跑通的等价物）。
5. 四个子任务全部归档后，父任务做一次集成回顾：确认四条流程的改动之间没有互相抵消
   （例如子任务 1 放宽的门禁没有被子任务 3 的 agent 提示词重新收紧）。

## 任务映射

执行顺序：**0 → 1 → 2 → 3 → 4**（子任务 0 先行已确认）。

| 子任务 | 目录 | 主要文件 |
|---|---|---|
| 0 断裂步骤 | `07-27-broken-step-repair` | `shared-hooks/inject-subagent-context.py`、`scripts/task.py`、`templates/git-workflow/spec/git-workflow.md` |
| 1 三阶段流程 | `07-27-phase-flow-slimming` | `templates/trellis/workflow.md`、`scripts/task.py` |
| 2 Git/CI | `07-27-git-workflow-repair` | `templates/git-workflow/**`、`hooks/git_branch.py`、`scripts/task.py` |
| 3 子代理 | `07-27-subagent-prompt-slimming` | `templates/claude/agents/trellis-*.md`、`shared-hooks/inject-subagent-context.py` |
| 4 对抗审查 | `07-27-adversarial-review-tiering` | `templates/common/skills/adversarial-review.md`、`configurators/shared.ts` |

## 已定决策

- **执行顺序**：子任务 0（断裂步骤）先行，然后 1 → 2 → 3 → 4。（2026-07-27 确认）
- **轻量档判定方式**：**客观规则先判 + AI 在灰区裁量**。不采用"每次询问用户"——那会新增
  一次确认停顿，与减摩擦初衷冲突。规则的具体维度（改动文件数 / 是否跨包 / 是否触及 `src` 等）
  在子任务 1 的规划阶段确定，规则必须可机器判定；AI 只对规则未覆盖的情形裁量，
  且裁量结果需在产物中留痕以便复盘。（2026-07-27 确认）

## 遗留待办（本批次发现，未在子任务 0 处理）

- `CLAUDE.md` 声称测试有 2 个既有失败 —— **已过期**，实测 53 文件全绿。需修正。
- `build_finish_prompt()` 的 `[finish]` 触发词疑似死代码：`workflow.md` 与各命令均未指示
  dispatch prompt 含该字面量。判定需独立确认。
- `git-workflow.md:40` 与 Pre-Dev Checklist 第 2 项仍要求手工 `set-base-branch dev`，
  但 `git_branch.py:215-217` 已在 `after_create` 自动设好（实测确认）。归子任务 2。
- `_print_manual_pr_commands` 用 `subprocess.list2cmdline()` 渲染回退命令，
  该函数恒用 Windows 风格引号。当前输入（任务标题/分支名）不含 shell 元字符，风险低；
  若日后标题可能含 `"` / 反引号 / `$`，需换 POSIX 引号。仅登记，不急。

## 待定（需在各子任务规划阶段确认）

- 是否收缩 14 平台变体块的维护范围（这是产品决策，不是摩擦修复，本次审计不预设立场）。

---

## 集成回顾（验收标准第 5 条 · 2026-07-28）

四条流程的改动落在若干重叠文件上（`workflow.md` 被子任务 0/1/4 各改一次，
`shared.ts` 被 3/4 各改一次），逐处核对是否互相抵消。

### 查了三处交叉点，两处发现真问题

| 交叉点 | 结论 |
|---|---|
| 2.2「最后一次必须全量」 vs check 的 docs-only 档 | **不冲突**。前者管范围（所有受影响的包），后者管深度（不动执行代码就不跨模型审），二者正交。 |
| `question` 命令 vs `adversarial-review` skill 的适用范围 | **冲突**。子任务 4 把 skill 收窄为「plan / design / doc / question」并明写审代码 diff 归 `trellis-check`，但加载它的 `question` 命令描述仍写着 code。同一能力两个入口说法不一致。**已修。** |
| 轻量档豁免 vs 步骤 1.3 自身的措辞 | **冲突，且抵消了子任务 1 的修复**。ready gate 已限定 complex，但 1.3 仍标 `[required · once]`，开场白写「your job here is to fill in real entries」，限定词在 40 行之后。读到这一步的人会照做，根本走不到限定。**已修**：标记改为 `[required · once · complex tasks]`，开场白首句即声明轻量任务跳过。 |

agent 提示词的 fallback 会读 seed-only jsonl，但消费方跳过 seed 行，是空转而非矛盾，不算冲突。

### 可度量的变化（验收标准第 3 条）

| 文件 | 改前 | 改后 |
|---|---|---|
| `trellis-implement.md` | 111 | **51**（-54%）|
| `trellis-research.md` | 148 | **90**（-39%）|
| `trellis-check.md` | 116 | 126（**+9%**）|
| 三个 agent 合计 | 375 | **267**（-29%）|
| `workflow.md` | 746 | 749（+3）|
| `adversarial-review.md` | 73 | 76（+3）|

**行数不是这轮的成果，如实记录。** `check` 与 `adversarial-review` 都变长了——
前者换来 docs-only 分档、失败预算与显式降级声明，后者换来「为何只调一次」的理由
（防止被好心改回去）。`workflow.md` 基本持平：删掉的重复被补回的限定词抵消了。

真正的变化在**人的动作数与调用成本的确定性**：

| 项 | 改前 | 改后 |
|---|---|---|
| 轻量任务的规划 | 手工整理 2 个 JSONL manifest | 跳过 |
| Pre-Dev 清单 | 4 项手工核对 | 2 项 |
| Quality Check | 6 项（含本地无法验证的 diff coverage）| 3 项 |
| Phase 3 的 spec 判断 | 3.3 与 3.4 各一次 | 一次 |
| 开 PR | 手工 push + 手工设 base + 一条不存在的命令 | `create-pr` 一条 |
| 对抗审查的 Codex 调用 | **1–5 次不可预测** | **恒定 1 次** |
| check 的 Codex 失败重试 | 无上限 | 1 次 |
| check 的验证循环 | 「until green」无上限 | 3 轮 |

**「一次典型 check 的模型调用跳数」无法给出改前的可信数字** —— 因为改前 hook 注入的
workflow 与 agent 定义互相矛盾，agent 可能只跑一套也可能两套都跑，行为本身不确定。
不确定性正是被修掉的东西；给一个精确的改前数字反而是编造。

### 结论

四条流程的改动**没有实质互相抵消**。发现的两处不一致都是「收窄了一处、漏了另一处」，
而非方向冲突，均已修复。这两处都无法通过单个子任务内部的检查发现——
它们只在把四轮改动放在一起看时才显形，集成回顾这一条验收标准是有价值的，不是走过场。
