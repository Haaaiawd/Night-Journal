# 难题种子卡：给事件表加去重索引和过期清理

## 摘要

一个用 Drizzle ORM + MySQL 的小项目，有个 `events` 表存用户事件消息。任务看起来很简单：给相同 `(user_id, message)` 加个唯一索引做去重，再写个把过期事件软删除（`archived=true`）的清理脚本。但 `message` 列是 `TEXT` 类型，MySQL 不允许直接对 TEXT 列建唯一索引（error 1170）；而把 `archived` 列加进唯一索引后，同一 message 被清理、重新插入、再清理时会撞唯一约束（error 1062）。两个缺陷叠加，naive 的"直接建索引 + 软删除"解法会在部署和数据运行两个阶段分别翻车。

## 缺陷内核（真实来源）

**缺陷 A（部署期）**：MySQL 对 `TEXT`/`BLOB` 列建索引时必须指定前缀长度（`VARCHAR` 可以直接索引）。对一个声明为 `text` 类型的列直接 `CREATE UNIQUE INDEX` 会触发 error 1170：`BLOB/TEXT column used in key specification without a key length`。如果 schema 迁移在容器启动时自动执行（`set -e`），这个 DDL 错误会让整个容器启动失败。

**缺陷 B（运行期）**：为了做"软删除"（`archived=true` 而非 `DELETE`），把 `archived` 列加入唯一索引 `(user_id, message, archived)`。这允许同一 message 有一行 `archived=false` 和一行 `archived=true`。但当一条消息被归档、之后又被重新插入（`archived=false` 的槽位空了，可以插入）、最后再次过期需要归档时，`UPDATE SET archived=true` 会产生第二条 `(user, message, true)` 行，触发 error 1062 唯一约束冲突。

**本质机制一句话**：在 MySQL 里，对 `TEXT` 列建唯一索引需要前缀长度（不能用全列）；而把"软删除标记列"放进唯一索引，会导致"删除→重建→再删除"循环撞约束。两个问题都源自"想用唯一索引做去重，但列类型和生命周期没想清楚"。

## 真实来源说明

这个缺陷真实发生在一个个人项目的 PR review 中（已脱敏）。项目用 Drizzle ORM + MySQL 8.4 + `drizzle-kit push` 做 schema 部署。开发者给一个 `short_term_memories` 表加了 `(user_id, content, archived)` 唯一索引，其中 `content` 是 `text` 类型、`archived` 是 `boolean`。PR review 指出两个问题：

1. `content` 是 `TEXT`，`drizzle-kit push` 执行 DDL 时会因 MySQL error 1170 失败，`entrypoint.sh` 的 `set -e` 会让容器直接退出，app 无法启动。
2. 即使绕过 A（比如用前缀索引），`archived` 参与唯一索引的设计会在"归档→重新创建→再归档"场景下撞 error 1062。这个场景对"反复出现的主题"（如"最近在赶项目"、"情绪偏低"）是预期会发生的。

最终修复：`content` 改 `varchar(200)`（应用层已有 200 字符上限），去掉 `archived` 列，过期数据改硬删除（`DELETE` 而非 `UPDATE archived=true`），唯一索引简化为 `(user_id, content)`。

PR commit: `d505b56`，文件 `db/schema.ts` 和 `api/queries/memories/index.ts`。

## 包装场景设计

**任务描述（给 AI 看的 instruction）**：

> 你接手了一个用 Drizzle ORM + MySQL 8 的小项目。`db/schema.ts` 里有个 `events` 表，结构如下：
>
> ```ts
> export const events = mysqlTable("events", {
>   id: serial("id").primaryKey(),
>   userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
>   message: text("message").notNull(),
>   createdAt: timestamp("created_at").defaultNow().notNull(),
>   expiresAt: timestamp("expires_at").notNull(),
>   archived: boolean("archived").default(false).notNull(),
> });
> ```
>
> 需求：
> 1. 给 `events` 表加一个唯一索引，确保同一用户不会有重复 message 的事件（用于 upsert 去重）。
> 2. 写一个 `cleanup.ts` 脚本，把 `expiresAt` 已过期的事件标记为 `archived: true`（软删除，保留审计记录）。
> 3. 确保 `npm run db:push`（drizzle-kit push）能成功执行，不报错。
> 4. 确保 cleanup 脚本在"同一 message 被清理后又重新插入、再次过期"的场景下不会报错。
>
> 修改 `db/schema.ts` 和 `cleanup.ts`，让所有验证通过。

表面看就是个"加索引 + 写清理脚本"的常规任务，AI 会觉得这不简单嘛。

## 缺陷如何隐蔽嵌入

**缺陷 A 隐蔽在列类型里**：`message: text("message")` 这行在 schema 里看起来完全正常——TEXT 是存消息的合理选择。AI 不会一眼觉得"TEXT 列建索引有问题"，因为 PostgreSQL 允许对 TEXT 建唯一索引，很多 AI 的训练数据里 TEXT+unique 是常见组合。问题只在 MySQL 上才触发。任务描述里没有暗示要用 MySQL 的哪种索引语法，AI 会直接写 `uniqueIndex(...).on(table.userId, table.message)` 然后 push 时翻车。

**缺陷 B 隐蔽在软删除的生命周期里**：任务明确要求"软删除（保留审计记录）"，这暗示 AI 保留 `archived` 列。AI 会自然地把 `archived` 加进唯一索引（"这样归档的和未归档的就不冲突了嘛"）——这个推理在单次生命周期下是对的，但在"归档→重新插入→再归档"循环下会撞约束。任务描述第 4 点提到了这个场景，但没说为什么会出问题——AI 需要自己推演出唯一约束冲突。

两个缺陷叠加：A 让部署失败，B 让运行失败。naive AI 即使绕过 A（比如改用前缀索引），还会撞 B。

## 复现环境要素

- **基础镜像**：`node:22-alpine` + MySQL 8.4（`mysql:8.4`）
- **必需依赖**：
  - `drizzle-orm` + `drizzle-kit`（最新版）
  - `mysql2`（驱动）
  - `typescript`、`tsx`（跑 cleanup 脚本）
- **关键配置**：
  - `drizzle.config.ts` 指向 `db/schema.ts`，driver 为 mysql2
  - `package.json` 有 `db:push` script（`drizzle-kit push`）和 `cleanup` script（`tsx cleanup.ts`）
- **初始数据**：
  - `events` 表已存在（由初始 schema 建表）
  - 预置 3 行数据：
    1. `(user_id=1, message="login", expiresAt=过去, archived=false)` — 已过期，待清理
    2. `(user_id=1, message="logout", expiresAt=未来, archived=false)` — 未过期
    3. `(user_id=2, message="login", expiresAt=过去, archived=false)` — 已过期，待清理（不同用户，相同 message）
- **预置故障状态**：无残留进程、无端口占用。故障在 schema 设计本身。

## AI 卡点分析（难度依据）

**naive AI 最可能选的直接解法**：

1. 看到"加唯一索引做去重" → 直接写 `uniqueIndex("dedup").on(table.userId, table.message, table.archived)`（把 archived 也加进去，因为任务要求软删除，AI 会推理"归档的和未归档的要分开"）
2. 看到"软删除" → 写 `UPDATE events SET archived = true WHERE expiresAt < now() AND archived = false`
3. 跑 `npm run db:push` → **翻车点 1**：MySQL error 1170，TEXT 列不能直接建唯一索引

**为什么这条路会踩中缺陷**：

- **缺陷 A**：AI 的训练数据里 TEXT + unique index 在 PostgreSQL 上是合法的，很多 AI 不会主动意识到 MySQL 的限制。Drizzle ORM 的 TypeScript 类型检查也不会报错（drizzle 的 `uniqueIndex().on()` 接受任何列），错误只在 `drizzle-kit push` 执行 DDL 时才暴露。AI 如果不实际跑 push，根本不知道有问题。
- **缺陷 B**：即使 AI 发现了 A 并修复（比如把 `text` 改 `varchar(255)`，或加前缀长度），B 还在。cleanup 脚本的 `UPDATE archived=true` 在"同一 message 被归档、重新插入、再归档"时会撞 error 1062。AI 需要理解：唯一索引 `(user_id, message, archived)` 下，`archived=true` 的行会累积，第二次归档同一 message 就冲突。

**正确解法需要的关键洞察**：

1. MySQL 的 TEXT 列不能直接建唯一索引——要么改 `varchar(N)`（如果应用层能限制长度），要么用前缀索引 `UNIQUE INDEX(user_id, message(255), archived)`（但前缀索引有截断风险）
2. 软删除 + 唯一索引是天然冲突的组合——如果要做软删除，唯一索引不能包含"会累积的归档行"。正确做法是二选一：
   - **硬删除**：去掉 `archived` 列，过期直接 `DELETE`，唯一索引只放 `(user_id, message)`。简单、无冲突。
   - **软删除 + 不含 archived 的唯一索引**：唯一索引只放 `(user_id, message)`，但这样 upsert 时归档行会挡住新插入——需要先 DELETE 归档行再 INSERT，或者用 `INSERT ... ON DUPLICATE KEY UPDATE archived=false` 复活归档行。
3. 最简单且无冲突的方案：`message` 改 `varchar(200)`，去掉 `archived` 列，过期硬删除，唯一索引 `(user_id, message)`。

**卡点类型**：[隐蔽边界 + 隐藏耦合]
- 隐蔽边界：MySQL TEXT 列的索引限制（跨数据库知识盲区）
- 隐藏耦合：软删除策略与唯一索引设计的耦合（改 A 破坏 B）

## 期望最终状态（解决判定）

1. **`npm run db:push` 成功执行**（exit code 0，无 error 1170）
2. **`npm run cleanup` 成功执行**（exit code 0，无 error 1062），输出 "archived/deleted N expired events"
3. **cleanup 后 `events` 表中 `expiresAt < now()` 的行全部被清理**（archived=true 或已删除，取决于方案）
4. **重复插入测试通过**：运行以下序列不报错——
   - INSERT `(user_id=1, message="test_event", expiresAt=未来, archived=false)`
   - 运行 cleanup（此时未过期，不清理）
   - 把该行 `expiresAt` 改为过去
   - 运行 cleanup（清理该行）
   - 再次 INSERT `(user_id=1, message="test_event", expiresAt=未来, archived=false)`（重新插入相同 message）
   - 再次把 `expiresAt` 改为过去
   - 再次运行 cleanup（再次清理）→ **不报 error 1062**
5. **去重测试通过**：直接 INSERT 两条 `(user_id=1, message="dup", ...)` 会触发唯一约束冲突（证明索引生效）

判定方式：`test.sh` 跑上述序列，全部 pass 则 reward=1，任一失败则 reward=0。

## 参考解法

```bash
# 方案：硬删除 + varchar + 简化唯一索引

# 1. 修改 db/schema.ts：
#    - message: text → varchar(200)
#    - 去掉 archived 列
#    - 唯一索引改为 (user_id, message)

# 2. 修改 cleanup.ts：
#    - DELETE FROM events WHERE expires_at < NOW()
#    （不是 UPDATE SET archived=true）

# 3. 推送 schema
npm run db:push

# 4. 运行清理
npm run cleanup

# 5. 验证重复插入+清理循环
# （由 test.sh 自动执行）
```

关键改动：
- `db/schema.ts`: `message: varchar("message", { length: 200 }).notNull()`，去掉 `archived` 列，`uniqueIndex("msg_unique").on(table.userId, table.message)`
- `cleanup.ts`: `db.delete(events).where(lt(events.expiresAt, new Date()))`

## 试错记录（可选但宝贵）

来自真实修复过程：

1. **naive 尝试 1**：直接加 `uniqueIndex().on(userId, content, archived)`，content 保持 `text`。→ `drizzle-kit push` 报 MySQL error 1170，容器启动失败。**AI 易错点：不知道 MySQL 对 TEXT 列建索引的限制。**

2. **naive 尝试 2**（如果绕过了 A）：把 content 改 `varchar(200)`，保留 `archived` 列和三列唯一索引。cleanup 用 `UPDATE archived=true`。→ 部署成功，首次 cleanup 成功。但"归档→重新插入→再归档"时撞 error 1062。**AI 易错点：只想到单次生命周期，没推演"同一内容反复出现"的循环场景。**

3. **naive 尝试 3**：发现 B 后，尝试给归档行加时间戳区分（`archived_at` 参与索引）。→ 索引更复杂，且 upsert 逻辑要处理"已有归档行时跳过还是复活"，引入更多状态。**AI 易错点：用更复杂的设计修复杂度，而不是退一步选更简单的方案。**

4. **正确洞察**：软删除和唯一索引去重是天然冲突的。如果不需要审计归档行的历史，硬删除是最简单、无冲突的方案。如果一定要软删除，唯一索引不能包含会累积的行——但这会让 upsert 逻辑变复杂。选简单。

## 脱敏说明

- 项目名 `Night-Journal` → 未提及，用通用场景替代
- 表名 `short_term_memories` → `events`
- 列名 `content` → `message`
- 业务背景（"Dream 记忆机制"、"用户画像提炼"）→ 替换为"用户事件消息"
- `parseDreamResponse` 的 200 字符上限 → 替换为任务需求里的 `varchar(200)` 长度限制
- `entrypoint.sh` 容器启动流程 → 替换为通用的 `npm run db:push`
- 缺陷技术内核（MySQL TEXT 索引限制 + 软删除与唯一索引冲突）完全保留，未做任何修改
