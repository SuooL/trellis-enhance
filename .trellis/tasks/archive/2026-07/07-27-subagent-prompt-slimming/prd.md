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

## 完成状态（2026-07-27）

| 项 | 状态 | 交付 |
|---|---|---|
| D1 跨模型审查失效 | ✅ 根因定位并修复 | 根因是 D2 的通配符（PR #7）|
| D2 `mcp__*` 通配符 | ✅ 7 处改精确枚举 | PR #7；#302 断言经实验推翻 |
| D3 提示词减重 | ✅ 375 → 267 行（-29%）| PR #8 |
| D4 check 轻量档 | ✅ docs-only 档，按文件类型判定 | PR #8 |
| D5 超时/重试/体积预算 | ✅ 重试 1 次 / 1500 行阈值 / 循环上限 3 | PR #8 |
| D6 agent/skill 双形态 | ⏸ **移交子任务 1** | 见下 |

**D6 移交理由**：修它要同时改 `workflow.md:226` 与 `configurators/shared.ts` 的
`SKILL_DESCRIPTIONS`，与子任务 1 的 workflow.md 改动直接冲突，并行做会互相覆盖。
已在子任务 1 的范围内登记。

**阻塞已解除（2026-07-28）——「Trellis 侧无可修之处」的判断是对的，且不需要任何修法。**

原判断：MCP 调用 401，根因是 CC switch 向进程注入第三方 `OPENAI_API_KEY`，而
`~/.codex/config.toml` 无对应 `[model_providers]` base URL。属用户环境问题。

实测结论：**当前会话环境里根本没有 `OPENAI_API_KEY`**，ChatGPT 登录凭据在位，
裸调 `mcp__codex__codex` 直接返回结果；`model=gpt-5.5` + `xhigh` + `read-only`
（`trellis-check` 用的完全相同的调用形状）同样通过。401 是**环境态**，随注入方消失而消失，
不是需要配置去绕开的常态。

期间为「让它在有注入时也能跑」探索的项目内 endpoint 配置（`.trellis/config.yaml` 的
`codex.review_config` + 模板文档）**已撤回**，理由是定位错误：Codex 走哪个中转端点、
密钥放哪，是开发者机器的环境配置，不是每个 `trellis init` 出来的项目都需要的产品能力。
把它做进模板等于把一个人的代理端点问题固化进发给所有人的 CLI。改动存于
`git stash`（"codex review_config endpoint override"），**不建议 pop**——其中
「`api_key = "sk-..."`」一句已被实测证伪。

顺带测出的 codex-cli 0.145.0 事实（若日后确有此需求，直接可用，不必重测）：
provider 的凭据字段**只有 `env_key` 可用**；`api_key` 字面量与 `http_headers`
均 401。且 provider 可完全由 `-c model_providers.<name>.*` 逐次传入，
`~/.codex/config.toml` 里不需要有这个 provider。

验证证据：植入 `isNewerVersion` 的 `>=` vs `>` 边界 bug 后实跑 `trellis-check`，
报告首行为 `Reviewer: Codex GPT-5.5 (xhigh)`，首次调用即成功，精确命中该 bug
（另报出无调用方、无测试两项）。夹具已还原。

未动：其余 5 个平台的 agent 变体（内容本就各异，不在本次范围）。

## Acceptance Criteria

全部于 2026-07-28 逐条实测核实（不接受「代码看起来对」）：

- [x] `MCP-PROBE-PROTOCOL.md` 的实验已在新会话完成，结论已回填。
      最后一处「待定」（research 的「任意 MCP」语义）已于本日回填为已决。
- [x] `trellis-check` 的跨模型审查**可被验证真实发生**：给定一个含已知 bug 的 diff，
      能拿到 Codex 的具体 findings（而非 Claude 自查结果）。需实跑证明，不接受「代码看起来对」。
      → 植入 `isNewerVersion` 的 `>=` vs `>` 边界 bug，实跑报告首行
      `Reviewer: Codex GPT-5.5 (xhigh)`，首次调用即成功并精确命中。夹具已还原。
- [x] 无 `codex` 时降级为原生自查，且报告中**显式声明**跨模型审查未发生及原因（不再静默）。
      → 模板已写入，并由新增回归测试钉死（断言 `**Reviewer**` 与 `native self-review` 均在位）。
      **限度**：本次 Codex 可用，故降级路径本身未被运行时触发，验证止于「契约在位且不可被静默删除」。
- [x] 7 处 `mcp__*` 按实验结论处置完毕；research agent 的「任意 MCP」语义有明确决定。
      → 全仓裸 `mcp__*` 零残留；决定为「枚举 server + server-scoped 通配符」，理由见 PROBE 文档。
- [x] 轻量档有可机器判定的边界，并有测试覆盖其判定逻辑。
      → **本条此前不成立**：分档只存在于提示词散文，`src/` 下无任何代码，故无从测试。
      已补 `regression.test.ts` 回归测试锁定判定边界（扩展名集合、「never by how many lines」、
      灰区 fail-closed、重试与循环上限）。**已变异验证 4/4 均被捕获**，非空过测试。
- [x] 三个 agent 模板行数明显下降（记录改动前后数值）；`trellis-research.md` 的
      「必须写文件」不再重复 7 次。
      → 375 → 267（-29%）：implement 111→51、research 148→90、check 116→126。
      research 的「写文件/别贴回对话」由 7 次降至 2 次。
      check 变长是有意的，换来 docs-only 分档、失败预算与显式降级声明。
- [x] `pnpm typecheck` 与 `test` 全绿。
      → 实测 55 文件 / 1309 passed / 1 skipped / 0 failed；`pnpm lint` 亦干净。
      （原文记的基线 54/1306 已过期，差额为本批次新增测试。）
- [x] scratch 目录 `trellis init --claude -y` 冒烟通过。
      → 生成 93 个模板文件，`.trellis/` 与 `.claude/agents/` 产物齐备，无报错。
- [x] `.claude/agents/probe-mcp-*.md` 已删除。→ glob 零命中。

## Notes

- D6（agent/skill 双形态）与子任务 1 的 workflow.md 改动有交集，需协调，避免互相覆盖。
- 上一会话的完整实测证据在父任务 `07-27-workflow-friction-reduction/prd.md`
  及归档的 `archive/2026-07/07-27-broken-step-repair/`。
