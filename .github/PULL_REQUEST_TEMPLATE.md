<!-- PR 模板 — 创建 PR 时自动加载。按规范填写，不要删除区块结构。 -->
<!-- 详见 CONTRIBUTING.md「提 PR」章节 -->

## Summary

<!-- 2-5 条要点，说清"做了什么"和"为什么这么做"。
     - 每条一个变更维度，不要罗列文件清单
     - 侧重 why 而非 what（what 看 diff 就知道）
     - 如果是修 bug，写清根因和触发条件
     - 如果有设计决策，简述选型理由 -->

-

## Changes

<!-- 列出关键文件改动，按层分组。只列有架构意义的改动，不列琐碎改动。 -->

-

## Verification

<!-- 必须至少跑 typecheck + tests。手动验证项按实际情况勾选。 -->

- [ ] `npm run check`（tsc -b）通过
- [ ] `npx vitest run` 全部通过（或说明跳过原因）
- [ ] 手动验证：<!-- 描述验证步骤和结果 -->

## Test plan

<!-- Reviewer 验证步骤。写清楚"怎么确认这个 PR 解决了问题"。
     - 具体到命令或操作步骤
     - 预期结果明确
     - 边界场景如果有，列出来 -->

- [ ] 步骤 1：<!-- 操作 → 预期结果 -->
- [ ] 步骤 2：<!-- 操作 → 预期结果 -->

<!--
如果是 AI agent 提交，保留以下署名（CONTRIBUTING.md 规范要求）：

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>
-->
