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

1. 四个子任务各自独立通过 `pnpm --filter trellis-enhance typecheck` 与 `test`
   （已知 2 个既有失败在 `test/templates/trellis.test.ts`，属环境问题，不计入回归）。
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

## 待定（需在各子任务规划阶段确认）

- 是否收缩 14 平台变体块的维护范围（这是产品决策，不是摩擦修复，本次审计不预设立场）。
