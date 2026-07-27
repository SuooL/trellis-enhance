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

**待定**：research agent 要放弃「任意 MCP」的设计、枚举常见 server、还是保持 `mcp__*` 等平台支持？

## 收尾（实验做完后）

```bash
rm .claude/agents/probe-mcp-*.md
```

探针是一次性的，**不要提交进模板**，也不要留在 `.claude/agents/` 下污染平时的 agent 列表。

---

## 结论（实验后回填）

- 实验日期：
- `probe-mcp-none`（阴性对照）：
- `probe-mcp-bare`（`mcp__*`）：
- `probe-mcp-server`（`mcp__codex__*`）：
- `probe-mcp-exact`（`mcp__codex__codex`）：
- 判定：
- 对 7 处 `mcp__*` 的处置决定：
