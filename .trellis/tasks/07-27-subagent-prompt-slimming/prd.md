# 子代理：修复失效的跨模型审查通路，并顺势减重

父任务：`07-27-workflow-friction-reduction`（子任务 3）

> **本 PRD 已于 2026-07-27 重写。** 原版基于纯静态审计，把重点放在「提示词样板占 47–57%」。
> 子任务 0 执行期间的实测推翻了这个优先级：**跨模型审查通路本身是失效的**。
> 样板冗余只是浪费 token；通路失效是**说好的能力根本没发生**。前者是减重，后者是缺陷。

## 【开工前必读】

**`MCP-PROBE-PROTOCOL.md`（同目录）里有一个必须在全新会话中完成的实验。**
它的结论决定本任务的一部分修法。先做实验、回填结论，再动手改代码。

## Goal

让 `trellis-check` 的跨模型审查真正发生；在此过程中删除因通路变更而变得多余的样板。
修复优先于减重：任何减重改动不得以牺牲审查强度为代价。

## 缺陷（实测，非推断）

### D1 — 跨模型审查从未真正发生【核心】

`trellis-check.md:51-71` 设计为把审查委托给 Codex GPT-5.5（effort `xhigh`, read-only）。
实测：子代理内**拿不到任何 MCP 工具**，因此一直在走 `:84-86` 的 fallback（Claude 原生自查）。

实测记录（子任务 0 期间，派发真实 `trellis-check` 探测）：

| 探测项 | 结果 |
|---|---|
| `mcp__codex__codex` 在子代理工具表中可见 | ❌ 否 |
| 子代理拥有 `ToolSearch`（可按需载入 MCP schema） | ❌ **完全没有此工具** |
| 子代理内 `Bash` 可用 | ✅ 是 |
| 子代理内 `codex` CLI 可达 | ✅ `/opt/homebrew/bin/codex`，`codex-cli 0.145.0` |
| 用户级 `~/.claude.json` 配置了 `codex` MCP server | ✅ 存在（所以不是「没配」）|

**后果的严重性**：`trellis-check` 对外宣称「不同模型能抓住写代码那个模型抓不住的 bug」——
这是它存在的全部理由（`trellis-check.md:10`）。该理由目前不成立。
使用者以为拿到了双模型交叉验证，实际拿到的是同一个模型自查自。

### D2 — `mcp__*` 通配符写法可疑（7 处）

`grep '^tools:.*mcp__'` 命中 7 个文件，全部写作 `mcp__*`：
`claude/agents/trellis-check.md:5`、以及 6 个平台的 `trellis-research.md`
（claude / cursor / qoder / codebuddy / droid / trae）。

官方文档明载的服务器级模式是 `mcp__<server>` 与 `mcp__<server>__*`；
**`mcp__*` 这种跨服务器裸通配符不在列举形式中**（文档未明说其非法，但也未列为合法）。

判定实验见 `MCP-PROBE-PROTOCOL.md`。**未取得实验结论前不得改动模板中的这 7 处。**

### D3 — 提示词样板（减重项，优先级低于 D1/D2）

- 三个 agent 样板占 47–57%（111 / 148 / 116 行）。
  对照 `pi/agents/trellis-check.md` 仅 36 行且职责完整。
- `trellis-research.md` 中「必须写文件、别贴回对话」重复 **7 次**
  （`:16, :24, :26, :59, :65, :139, :147`）。
- `trellis-check.md:90-116` 的 Report Format 占 27 行（全文 23%），
  其中 Files Checked 列表与 Verification Results 三行价值极低。
- 各 agent 的 Core Responsibilities 段落与其下方 Workflow 段落一一对应，是同一件事写两遍。

### D4 — check 无轻量档

`trellis-check.md:49` 唯一的提前退出是**空 diff**。改一行注释、只改 README，
同样要走完整 diff → 粘 spec 全文 → xhigh 推理 → 逐条复核 → lint+typecheck+tests。

### D5 — 无超时 / 重试 / 体积预算

`:84-86` 只处理 "failed or unreachable"；若 Codex 挂起而非报错，条件不成立会一直等。
`:82` 的 "until green" 无迭代上限。`:66` 的 "for large diffs" 无阈值定义。

### D6 — `trellis-check` 同时以 agent 与 skill 两种形态存在

agent（`claude/agents/trellis-check.md`，116 行，Codex 委托流）
与 skill（`common/skills/check.md`，93 行，原生 6 步）内容不同，且都可被自动触发。
`workflow.md:226` 只说 "prefer the Agent form"，未排除 skill 被触发。

## 修法方向

### 主路径：`trellis-check` 改走 `codex exec review`（Bash）

**不依赖 MCP、不依赖插件安装。** 依据（均为子任务 0 实测）：

- `codex exec review --uncommitted` 有效：在临时仓库放入 `int(s[0])` 的 bug，它准确报出
  *"[P2] Parse the entire numeric string — returns `4` instead of `42`；signed values such as
  `-3` also fail"*，定位到 `file:line`，严重度分级。
- 子代理内 Bash 可用、`codex` CLI 可达。
- **可移植性是决定因素**：MCP 方案要求使用者额外配置 codex MCP server；
  Bash 方案只要求 `codex` 在 PATH。`trellis init` 生成到别人项目里时，后者是唯一现实假设。
- `codex exec review` 自己取 diff、自带评审提示词 → 可删掉 `:65-71` 的 REVIEW PACKAGE 样板。
  **D1 的修复顺带完成了 D3 的一部分减重 —— 二者是同一处改动。**

### 次路径：MCP 通配符按实验结论处置（D2）

实验若判定 `mcp__codex__*` 有效，作为第二道保险保留 MCP 通路。

## 约束

- **不牺牲审查强度**：D4 的轻量档必须给出可机器判定的适用边界，不能是「AI 觉得小就跳过」。
- **`codex` 是软依赖**：无 `codex` 时必须降级为 Claude 原生自查并在报告中显式声明
  「跨模型审查未发生及原因」——**当前 fallback 静默发生，是使用者被误导的根因**。
- **模板双路径一致**：见 `.trellis/spec/cli/backend/configurator-shared.md`。
- **平台边界**：`shared-hooks` 只注入上下文，workflow 归 agent 定义
  （见 `.trellis/spec/cli/backend/platform-integration.md`，子任务 0 已确立）。
- 探针文件 `.claude/agents/probe-mcp-*.md` 是一次性的，**不得进入模板**，实验后删除。

## Acceptance Criteria

- [ ] `MCP-PROBE-PROTOCOL.md` 的实验已在新会话完成，结论已回填。
- [ ] `trellis-check` 的跨模型审查**可被验证真实发生**：给定一个含已知 bug 的 diff，
      能拿到 Codex 的具体 findings（而非 Claude 自查结果）。需实跑证明，不接受「代码看起来对」。
- [ ] 无 `codex` 时降级为原生自查，且报告中**显式声明**跨模型审查未发生及原因（不再静默）。
- [ ] 7 处 `mcp__*` 按实验结论处置完毕；research agent 的「任意 MCP」语义有明确决定。
- [ ] 轻量档有可机器判定的边界，并有测试覆盖其判定逻辑。
- [ ] 三个 agent 模板行数明显下降（记录改动前后数值）；`trellis-research.md` 的
      「必须写文件」不再重复 7 次。
- [ ] `pnpm typecheck` 与 `test` 全绿（基线：54 文件 / 1306 passed / 1 skipped / 0 failed）。
- [ ] scratch 目录 `trellis init --claude -y` 冒烟通过。
- [ ] `.claude/agents/probe-mcp-*.md` 已删除。

## Notes

- D6（agent/skill 双形态）与子任务 1 的 workflow.md 改动有交集，需协调，避免互相覆盖。
- 上一会话的完整实测证据在父任务 `07-27-workflow-friction-reduction/prd.md`
  及归档的 `archive/2026-07/07-27-broken-step-repair/`。
