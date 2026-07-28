# 默认 marketplace 指向自有仓库

## Goal

`trellis-enhance` 是 self-owned 产品,不应默认 phone upstream `mindfold-ai`。
`trellis init` 交互模式在选择起步 spec 模板时仍会拉取 upstream marketplace
(`template-fetcher.ts` 硬编码常量),这是 self-owned 化时的漏网点。将默认
marketplace 源换成自有仓库 **`SuooL/trellis-marketplace`**(分支 `main`)。

## Background / 现状

- `template-fetcher.ts:18-21` 硬编码:
  - `TEMPLATE_INDEX_URL = "https://raw.githubusercontent.com/mindfold-ai/marketplace/main/index.json"`
  - `TEMPLATE_REPO = "gh:mindfold-ai/marketplace"`
- 消费方(自动跟随常量,无需单独改):`init.ts`(模板选择)、`workflow-resolver.ts`(workflow 模板)。
- 顶部 doc 注释(`:4-5`)也指向 upstream。
- `--registry <source>` 参数已支持按次覆盖默认源;本任务只改**默认值**。
- 测试:`test/templates/trellis.test.ts` 只引用本地 `marketplace/` 子目录,不断言 URL,无回归。

## Requirements

1. 将 `TEMPLATE_INDEX_URL`、`TEMPLATE_REPO` 默认值改为 `SuooL/trellis-marketplace`(`main`)。
2. 同步更新 `template-fetcher.ts` 顶部 doc 注释里的 upstream 链接。
3. 不改变消费方逻辑、不改变 `--registry` 覆盖行为、不改变离线回退(拉不到 → blank templates)语义。
4. 迁移 manifests(`migrations/manifests/*.json`)属历史记录,**不改**。

## 范围外 / 已知前提

- 本任务只改 CLI 默认指向。**真实 GitHub 仓库 `SuooL/trellis-marketplace` 的创建与内容
  (`index.json` + 模板目录)不在本任务内**;仓库不存在时 init 仍走"拉不到 → blank
  templates"的既有无害回退,不构成回归(与当前离线行为一致)。

## Acceptance Criteria

- [ ] `grep -rn "mindfold-ai/marketplace" packages/cli/src`(排除 migrations/manifests)无残留。
- [ ] 两个常量值指向 `SuooL/trellis-marketplace` / `main`。
- [ ] `pnpm --filter trellis-enhance typecheck` 通过。
- [ ] `pnpm --filter trellis-enhance test` 相对基线无新增失败(基线:trellis.test.ts 2 个已知 env 失败)。
- [ ] `pnpm --filter trellis-enhance build` 成功;scratch 目录 `trellis init` 冒烟:离线时回退 blank,提示语中的源标签显示为新仓库 URL。
