# 【新会话请先做这个】子代理 MCP 工具可用性探测协议

> 写于 2026-07-27 的上一个会话。**这个实验必须在全新会话中做** —— 原因见下。
> 做完后请把结论回填到本文件末尾的「结论」一节，然后删除探针文件。

## 为什么需要重启会话

上一个会话已确认：**子代理定义在会话启动时加载，会话中途新建或修改 `.claude/agents/*.md` 不会生效。**

证据：中途新建 `probe-tools` 代理后派发，得到
`Agent type 'probe-tools' not found. Available agents: claude, claude-code-guide,
codex:codex-rescue, Explore, general-purpose, Plan, statusline-setup, trellis-check,
trellis-implement, trellis-research`。

因此上一会话中「把 `mcp__*` 改成 `mcp__codex__codex` 后再探测」的两次实验**从构造上无效** ——
它们测的始终是旧定义。结论必须在新会话中重新取得。

## 待回答的问题

`trellis-check` 与 `trellis-research` 的 frontmatter 写的是 `tools: ..., mcp__*`。
实测：子代理拿到**零个** MCP 工具（连 `ToolSearch` 都没有，因此也无法按需载入）。
后果：`trellis-check.md:51-71` 设计的「委托 Codex GPT-5.5 做跨模型审查」**从未真正发生**，
一直在走 `:84-86` 的 fallback（Claude 原生自查）。

官方文档明载：
- 子代理**确实继承**主会话的 MCP 工具；
- 合法的服务器级模式是 `mcp__<server>` 与 `mcp__<server>__*`；
- **`mcp__*` 这种跨服务器裸通配符不在文档列举的形式中**；
- 主会话有 `ENABLE_TOOL_SEARCH` 环境变量（`true` 默认全部延迟 / `false` 全部预加载 / `auto` 阈值），
  但对子代理的效果文档未说明；
- 子代理 frontmatter 支持 `mcpServers:` 字段可显式挂载服务器。

**要判定的是：哪种写法能让子代理真正拿到 MCP 工具？**

## 前置条件

```bash
# 1. codex MCP server 已在用户级配置中（上一会话确认存在）
python3 -c "
import json,os
d=json.load(open(os.path.expanduser('~/.claude.json')))
print('user mcpServers:', list(d.get('mcpServers',{}).keys()))"
# 期望输出包含 'codex'

# 2. 四个探针文件存在
ls .claude/agents/probe-mcp-*.md
# 期望：probe-mcp-bare.md  probe-mcp-exact.md  probe-mcp-none.md  probe-mcp-server.md
```

## 实验

四个探针除 `tools:` 行外完全相同：

| 探针 | `tools:` | 检验什么 |
|---|---|---|
| `probe-mcp-bare` | `Read, Bash, mcp__*` | 现状写法（对照组，预期失败）|
| `probe-mcp-server` | `Read, Bash, mcp__codex__*` | **文档推荐的服务器级模式** |
| `probe-mcp-exact` | `Read, Bash, mcp__codex__codex` | 精确工具名 |
| `probe-mcp-none` | `Read, Bash` | 阴性对照（确认探针本身无误报）|

逐个派发（四个可并发），每个的 prompt 用：

```
列出你当前实际可用的全部工具名称，一个不漏。
明确回答：是否存在任何以 mcp__ 开头的工具？
如果存在 mcp__codex__* 类工具，调用它一次，prompt 设为 `Reply with exactly: PROBE_OK`，
报告原始返回或完整错误文本。
```

> **注意**：不要用 `trellis-check` 做探测。上一会话试过，它的反注入规则会把
> 「列出你的工具」判定为可疑注入并拒绝执行（这是它的正确行为）。

## 判读

- **`probe-mcp-none` 若报告有 MCP 工具** → 探针失效，实验作废，先排查。
- **`probe-mcp-server` 成功** → 修法确认：把 7 处 `mcp__*` 按需换成 `mcp__<server>__*`。
- **`probe-mcp-exact` 成功而 `server` 失败** → 只能枚举精确工具名。
- **三者全失败** → 子代理在本配置下拿不到 MCP，需改用 `mcpServers:` frontmatter 字段，
  或直接放弃 MCP 通路（见下）。
- 若 MCP 通路可用，仍需追问：`ENABLE_TOOL_SEARCH` 默认值下是否稳定？换机器/换配置会不会又失效？

## 无论结果如何都要做的事

`trellis-check` **改走 `codex exec review` 的 Bash 通路**，不依赖 MCP。理由：

- 已在上一会话实测通过。在临时仓库放入 `int(s[0])` 的 bug，
  `codex exec review --uncommitted` 准确报出：
  *"[P2] Parse the entire numeric string — returns `4` instead of `42`; signed values such as `-3` also fail"*。
- 子代理内 `Bash` 可用且 `codex` CLI 可达（实测：`/opt/homebrew/bin/codex`，`codex-cli 0.145.0`）。
- **可移植性**：MCP 方案要求使用者额外配置一个 codex MCP server；Bash 方案只要求
  `codex` 在 PATH 上。`trellis init` 生成到别人项目里时，后者是唯一现实的假设。
- `codex exec review` 自己取 diff、自带评审提示词 → 可以删掉 `trellis-check.md:65-71`
  那套「把 spec 全文粘进 prompt」的 REVIEW PACKAGE 样板。**修复与减重在这里是同一件事。**

MCP 通路若可用，作为第二道保险保留；不可用则纯走 Bash。

## 尚未决定的设计问题（需要用户拍板）

`mcp__*` 出现在 **7 个文件**，但两类 agent 意图不同：

- **`trellis-check`（1 处）** —— 只需要 codex 一家，换 `mcp__codex__*` 语义无损。
- **`trellis-research`（6 处）** —— 写 `mcp__*` 是**故意的**：research 要能用上用户装的任何 MCP
  （context7 查文档、web 搜索、zotero 等）。收窄成 `mcp__codex__*` 是**能力倒退**。
  但若 `mcp__*` 本来就一个都拿不到，那它今天已经是坏的，收窄反而是净改善。

**已决（2026-07-28 回填）**：**枚举 server + server-scoped 通配符**。裸 `mcp__*` 全部去掉，
`trellis-research` 的 `tools:` 改为逐个点名 server 并在 server 内用通配符
（`mcp__codex__codex`、`mcp__plugin_context7_context7__*`、`mcp__zotero-mcp__*`、
`mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`）。

理由：上方追加实验已证明**命名不存在的 server 是无害的**（条目被丢弃，agent 照常注册），
所以枚举不会因为用户没装某个 server 而炸掉 —— 这正是原先不敢枚举的顾虑。于是
「任意 MCP」的能力损失被限制在「用户装了我们没列的 server」这一种情况，
代价远小于裸 `mcp__*` 导致的**零工具**。7 处已全部落地，现仓内裸 `mcp__*` 零残留。

## 收尾（实验做完后）

```bash
rm .claude/agents/probe-mcp-*.md
```

探针是一次性的，**不要提交进模板**，也不要留在 `.claude/agents/` 下污染平时的 agent 列表。

---

## 结论（2026-07-27 已完成）

### 关于「必须重启会话」——**该前提是错的**

实验**未经重启即完成**。四个探针文件写入后，harness 在同一会话内刷新了 agent 注册表
（收到 "New agent types are now available" 通知）。
上一会话 `probe-tools` 报 `Agent type not found` 只是**刷新尚未发生**，不是「启动时锁死」。

**修正结论**：子代理定义是**延迟刷新**，不是会话启动时锁死。本文件开头「为什么需要重启会话」
一节的推论作废，保留仅为记录当时的判断依据。

### 探测结果

| 探针 | `tools:` | 拿到的 MCP 工具 | 调用结果 |
|---|---|---|---|
| `probe-mcp-none` | `Read, Bash` | 0 | —（对照组干净，无误报）|
| `probe-mcp-bare` | `+ mcp__*` | **0** | 拿不到 |
| `probe-mcp-server` | `+ mcp__codex__*` | **2** ✅ | 可调用 → 401 |
| `probe-mcp-exact` | `+ mcp__codex__codex` | **有** ✅ | 可调用 → 401 |

### 判定：发现两个**互相独立**的缺陷

**缺陷 A — `mcp__*` 裸通配符匹配不到任何工具。**
两种文档形式（`mcp__<server>__*` 与精确工具名）**都有效**，裸通配符**零命中**。
同一会话、同一环境、同一时刻的对照，因此与环境无关，是纯粹的写法错误。
**`trellis-check` 一直卡在这一层** —— 工具不可见，连发请求的机会都没有。

**缺陷 B — 即使工具可达，调用也会 401。**
根因：Claude Code 进程环境被 **CC switch** 注入了第三方 `OPENAI_API_KEY`；
`codex mcp-server` 由 Claude Code spawn，继承该环境后从 `chatgpt` 认证切成 key 认证，
而 `~/.codex/config.toml` **没有为 OpenAI 配任何自定义 `base_url`**，
于是第三方 key 被发往 `api.openai.com` → key 与地址不匹配 → 401。

对比证据：
- Bash 工具 → `codex exec`：环境从 shell profile 起，**无** `OPENAI_API_KEY`，
  走 `~/.codex/auth.json` 的 `auth_mode: chatgpt` → **正常**
  （在本项目目录实测返回 `PROBE_OK`，排除了 cwd / 项目配置的干扰）。
- 用户 `.zshenv` 里的自定义 base URL 是给 GEMINI / DOUBAO（`windhub.cc`）的，**不作用于 codex**。

**两个缺陷必须都修，或绕开两者走 CLI**：只修 A → 从「看不见」变成「401」；只修 B → 工具仍不可见。

### 追加实验：#302「显式命名会导致 agent 静默不注册」——**推翻**

`configurators/shared.ts:684-689` 原注释断言：列出不存在的 MCP server 会让 agent
被静默跳过注册（引用 issue #302），因此才用 `mcp__*`。该断言**当前不成立**：

| 探针 | `tools:` | 是否注册 | 实际拿到 |
|---|---|---|---|
| `probe-absent` | `Read, Bash, mcp__nosuchserver__*` | ✅ 是 | `Read, Bash`（假 server 被静默忽略）|
| `probe-mixed` | `+ mcp__codex__codex, mcp__nosuchserver__*` | ✅ 是 | `Read, Bash, mcp__codex__codex`（真的进来，假的丢掉）|

**结论：命名不存在的 server 是无害的** —— 条目被丢弃，agent 照常注册。
因此显式枚举安全，`mcp__*` 没有任何优势（它反而一个工具都拿不到）。

> 实验过程提示：agent 注册表刷新是**偶发且有较长延迟**的（本次等待约 10 分钟才生效），
> 不是「会话启动锁死」，也不是「立即生效」。测这类改动要有耐心，
> 并且**必须带一个同批创建的对照 agent**，否则无法区分「行为如此」与「尚未刷新」。

### MCP vs `codex exec`（Bash）—— 二者不等价

| 维度 | `mcp__codex__codex` | `codex exec` |
|---|---|---|
| 输出 | 结构化返回 | 裸 stdout，混有 `hook: SessionStart` 等噪音 |
| 超时 | 不受 Bash 工具约束 | **受 Bash 工具 600 秒上限**——`xhigh` 长审查有被砍风险 |
| 多轮续接 | `codex-reply` 专门设计 | `exec resume --last`，可行但更笨拙 |
| 环境 | 继承 Claude Code 进程环境 → **受 CC switch 注入影响（缺陷 B）** | 从 shell profile 起，不受影响 |
| 可移植性 | 需使用者配置 codex MCP server | 只需 `codex` 在 PATH |

**决定：MCP 为主路径**（超时上限与输出洁净度是硬优势），`codex exec` 作为 MCP
不可用/调用失败时的降级。

### 处置决定

- **主路径**：MCP（`mcp__codex__codex`）。`codex exec` 作为降级。
  理由见上表 —— 二者不等价，MCP 在超时上限与输出洁净度上有硬优势。
- **缺陷 A**：7 处 `mcp__*` 换成精确枚举（用户决定：不用通配符，列出当前实际可用的 server）。
  已完成；`configurators/shared.ts` 的 Copilot 映射同步更新，并更正了引用 #302 的过时注释。
- **缺陷 B**：属用户环境问题，非 Trellis 代码缺陷。需给 codex 配 `[model_providers]`
  说明该 key 对应的 base URL，或阻止 codex MCP 继承该 key。**已告知用户，Trellis 侧不处理。**
- MCP 通路在 A 修好后作为第二道保险保留（B 修好后才真正可用）。
