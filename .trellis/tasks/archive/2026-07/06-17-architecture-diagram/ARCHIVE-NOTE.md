# 归档说明

**判定:NOT_APPLICABLE(上游专属,非本 fork 需求)。归档于 2026-07-28。**

> ⚠️ `task.json` 里的 `status: completed` 是 `task.py archive` 强制写入的,**不代表本任务已交付**。
> 本任务从未在 trellis-enhance 中开工,是被判定为不适用而关闭。

## 依据

- 所有产出物都落在 gitignore 掉的 `tmp/architecture/`(`prd.md:3,15,46`;`.gitignore:186`)。该目录在本仓库不存在 —— fork 时没有任何工作产物留下。
- 任务动机是给上游的 `community-governance` 任务和贡献者 onboarding 漏斗做词汇交接(`prd.md:11,50,64`)。该上游任务已于 2026-06-18 完成,其消费方 `.github/PULL_REQUEST_TEMPLATE.md` 在本仓库并不存在。
- 推广目标是 `docs/architecture.md` + docs-site(`prd.md:31,34`),而本仓库没有 `docs/` 目录 —— 文档站是独立的上游仓库。
- owner 硬编码为 `@taosu`(`prd.md:27,48`),属于上游团队流程产物。

## 本 fork 的等价物

单人维护、无公开文档面,对应的架构导览已存在于 `CLAUDE.md`(定制项表格)+ `FORK.md`(设计决策与 provenance)。
