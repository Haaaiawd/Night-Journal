# CONTRIBUTING — Night-Journal 协作规范

> 本规范同时面向人类协作者和 AI agent。Agent 接手项目时，**必须按本规范执行分支、commit、PR 全流程**。

---

## 分支规范

### 命名格式

```
<type>/<short-description>
```

| type | 用途 | 示例 |
|---|---|---|
| `feat` | 新功能 | `feat/dream-memory` |
| `fix` | bug 修复 | `fix/vision-pending-polling` |
| `refactor` | 重构（无行为变化） | `refactor/extract-diary-service` |
| `chore` | 构建/依赖/配置 | `chore/upgrade-drizzle` |
| `docs` | 文档 | `docs/update-agents-md` |

### 规则

- 从 `master` 切出，PR 回到 `master`
- 一个分支一个 PR，不要在同一个分支塞无关改动
- 分支名全小写，用 `-` 分隔单词，不超过 40 字符
- 不要用 `main`、`dev`、`tmp`、`wip` 这类无意义名称

---

## Commit 规范

### 格式

```
<type>(<scope>): <subject>

<body — 可选，解释 why>

<footer — 可选，如 breaking change、co-author>
```

### type（与分支 type 一致）

`feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `perf`

### scope（可选）

受影响的模块：`diary` / `scheduler` / `auth` / `schema` / `settings` / `home` 等。

### subject

- 祈使句，首字母小写（英文）或直接中文
- 不超过 72 字符
- 说 what + why，不要只说 what

### body（可选但推荐）

- 解释**为什么**这么做，不是做了什么（diff 已经说明了 what）
- 如果是修 bug，写清根因链：现象 → 中层原因 → 根本原因
- 每行不超过 72 字符

### 示例

```
feat: add Dream memory mechanism for diary continuity

Introduces a lightweight Dream memory system that maintains an abstract
understanding of the user (persona, relationships, emotional tone,
language style) plus short-term recent-state memories with 14-day decay.

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>
```

```
fix: TEXT column index failure, archived re-create collision, scheduler guard timing

Three bugs found by PR review, all in the Dream memory mechanism:

1. Unique index on TEXT column would fail MySQL DDL (error 1170):
   - content column changed from text to varchar(200)
2. archiveExpiredMemories would hit unique constraint violation when
   re-archiving previously archived content (error 1062):
   - Removed the archived column; expired memories are hard-deleted
3. Scheduler memory-decay guard set before operation success:
   - guard moved AFTER archiveExpiredMemories succeeds
```

### 规则

- 一个 commit 一个逻辑变更，不要把无关改动塞进一个 commit
- 不要 `--amend` 已推送的 commit（除非只有你一个人用这个分支）
- 不要 squash 别人的 commit
- **AI agent 署名**：如果是 AI agent 提交，footer 必须包含 `Generated with [Devin](https://devin.ai)` 和 `Co-Authored-By` 行

---

## PR 规范

### 创建前检查

- [ ] 分支从最新 `master` 切出
- [ ] `npm run check`（tsc -b）通过
- [ ] `npx vitest run` 全部通过（新增功能必须附带测试）
- [ ] 如果改了 `db/schema.ts`，已运行 `npm run db:generate` 并确认迁移文件正确
- [ ] 没有提交 `.devin/config.local.json`、`.env`、`node_modules/` 等本地文件

### PR 标题

与主 commit 的 subject 一致：

```
<type>(<scope>): <subject>
```

示例：`feat: add Dream memory mechanism for diary continuity`

### PR Body

使用 `.github/PULL_REQUEST_TEMPLATE.md` 模板（创建 PR 时自动加载），包含四个区块：

#### 1. Summary

2-5 条要点，每条一个变更维度。侧重 **why** 而非 what。

- 如果是修 bug：写清根因和触发条件
- 如果是新功能：写清设计决策和选型理由
- 如果有安全/性能影响：明确说明

#### 2. Changes

关键文件改动，按层分组（schema / queries / services / routers / frontend）。只列有架构意义的改动，不列琐碎改动。

#### 3. Verification

必须至少跑 typecheck + tests。手动验证项按实际情况勾选。

#### 4. Test plan

给 Reviewer 的验证步骤。具体到命令或操作，预期结果明确。边界场景如果有，列出来。

### 用 gh CLI 创建 PR

```bash
gh pr create \
  --title "feat: add Dream memory mechanism for diary continuity" \
  --body-file .github/PULL_REQUEST_TEMPLATE.md \
  --base master
```

> 如果模板里的 `<!-- -->` 注释会显示在 PR body 里，可以先复制模板内容到临时文件、填好后用 `--body-file` 指向临时文件。

### PR 规则

- 一个 PR 一个分支，一个分支一个主题
- PR 大小控制：目标 < 500 行 diff（含测试）。超过的话考虑拆分
- 不要在 PR 里混入无关的格式化/重命名改动
- 收到 review 反馈后，新 commit 修复（不要 force-push 覆盖，除非 reviewer 要求 squash）
- **不要自己 merge 自己的 PR**（除非有明确的 owner 授权）

---

## 测试规范

### 什么必须测

| 改动类型 | 测试要求 |
|---|---|
| 新 service / 新 router | 必须有单元测试 |
| bug fix | 必须有能复现 bug 的测试（先写 failing test，再修） |
| schema 改动 | 必须验证 `db:generate` + `db:push` 成功 |
| 纯前端 UI | 至少手动验证，有逻辑分支时补组件测试 |

### 测试风格

- 测试文件与被测文件同目录：`foo.ts` → `foo.test.ts`
- describe 块按功能分组，it 描述行为而非实现
- mock 外部依赖（DB、LLM、网络），不 mock 被测代码本身
- 测试名用行为描述：`it("returns null for non-JSON content")` 而非 `it("test parse")`

---

## 文件提交规范

### 不要提交

- `.devin/config.local.json` — 本地 Devin 配置
- `.devin/skills/` — 本地 skill 安装目录
- `.env` — 环境变量
- `node_modules/`
- 临时输出文件（`*-out.txt`、`vitest-out.txt` 等）

### 必须提交

- `db/migrations/meta/*.json` — drizzle 迁移元数据（snapshot + journal）
- `db/schema.ts` 的改动必须配对应的迁移文件
- `AGENTS.md` 的状态更新（如果改了架构/测试状态/技术栈）

### 可选提交

- `db/migrations/*.sql` — SQL 迁移文件（本项目用 `drizzle-kit push` 不用 `migrate`，SQL 文件被 gitignore，但 snapshot/journal 必须提交）

---

## AI Agent 专项指引

### 接手项目时

1. **先读 `AGENTS.md`** — 获取项目地图、技术栈、当前状态
2. **跑 `npm run check` + `npx vitest run`** — 确认基线状态是干净的
3. **看 `git log --oneline -10`** — 了解最近的改动方向

### 提 PR 时

1. 按本规范创建分支、写 commit、填 PR 模板
2. PR body 的 Summary 写清楚**为什么**这么做——Reviewer（可能是另一个 agent）需要理解决策上下文
3. 如果做了设计决策，在 Summary 里写选型理由，不要只说"选了 A"
4. 如果有已知风险或留坑，在 Summary 末尾明确列出
5. footer 必须包含 AI 署名

### 收到 review 反馈时

1. 每条反馈都回应：同意就改，不同意就说理由
2. 修复用新 commit，不要 force-push 覆盖（保留修复历史）
3. 修复后重跑 `npm run check` + `npx vitest run`，确认没引入新问题
