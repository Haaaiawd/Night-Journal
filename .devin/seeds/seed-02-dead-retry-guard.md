# 难题种子卡：数据同步服务——失败后从不重试

## 摘要
一个简单的数据同步 cron 服务：定期把用户数据同步到外部系统。代码里有重试逻辑——失败后下次 cycle 应该重试。但失败的同步从不被重试，因为去重 guard 在检查前置条件之前就设置了，导致重试函数里的 guard 检查永远命中，重试逻辑成了死代码。

## 缺陷内核（真实来源）
**函数 A 用一个 in-memory Set 做去重 guard，在检查前置条件（是否有数据、是否需要同步）之前就 `set.add(id)`。一旦设置，后续所有 tick 在 guard 检查处直接 return。重试函数 B 检查同一个 Set，因为 guard 已设，永远跳过——重试逻辑存在但永远不会执行。**

一句话：guard 在前置条件之前设置，让"未处理"变成"已处理"，重试机制成了死代码。

## 真实来源说明
这个缺陷真实发生在一个日记自动生成调度器中（已脱敏）。调度器用 `lastProcessedDate` Map 做去重，防止同一用户同一天被重复处理。guard 在检查"是否有碎片数据"、"是否应该自动生成"、"创建 pending 日记"之前就设置了。如果用户当天还没有碎片数据，guard 已设但同步没发生；用户后来添加了碎片数据，调度器永远不会再处理——因为 guard 检查直接 return。重试逻辑（`shouldAutoGenerate` 函数）明确支持对 "failed" 状态重试，但 guard 阻止了重新进入 `processUser`，重试代码从未执行。

## 包装场景设计
**场景：数据同步服务（data-sync-service）**

一个 Node.js 服务，每分钟运行一次，把用户数据同步到外部 API。流程：
1. 遍历所有用户
2. 检查去重 guard（防止同一用户同一 cycle 重复处理）
3. 设置 guard
4. 查找用户待同步数据
5. 如果有数据，同步到外部 API
6. 如果同步失败，记录到 failures 表
7. 另一个函数 `retryFailedSyncs` 检查 failures 表并重试

**任务描述（给 AI 的 instruction）：**
> 数据同步服务的重试机制不工作：同步失败后，下次 cycle 应该重试，但从来没有重试过。请修复重试逻辑。

## 缺陷如何隐蔽嵌入
缺陷藏在**guard 设置的时机**——不是"有没有 guard"的问题，而是"guard 什么时候设"的问题：

```
syncUser(userId)                       // 函数 A
  └─ if (synced.has(userId)) return    // guard 检查
  └─ synced.add(userId)                // ← guard 设置（在前置条件之前！）
  └─ data = fetchUserData(userId)
  └─ if (data.length === 0) return     // ← 早退，但 guard 已设
  └─ if (!shouldSync(userId)) return   // ← 早退，但 guard 已设
  └─ try { syncToExternal(userId, data) }
       catch { recordFailure(userId) } // ← 失败了，但 guard 已设

retryFailedSyncs()                     // 函数 B
  └─ for each failure:
       └─ if (synced.has(userId)) continue  // ← 永远 continue！guard 已设
       └─ syncUser(userId)                   // ← 永远不会执行
```

**为什么 AI 不容易一眼看出：**
1. 重试函数 `retryFailedSyncs` **存在且逻辑看起来正确**——检查 failures 表，调用 syncUser
2. guard 设置看起来是合理的并发防护（"防止同一用户同一 cycle 重复处理"）
3. guard 设置和早退之间隔了几行"正常"逻辑，不是紧挨着
4. 失败处理（`recordFailure`）看起来在工作——failures 表确实有记录
5. naive AI 会聚焦重试函数本身，不会回溯到 `syncUser` 里的 guard 设置时机

## 复现环境要素

**基础环境：**
- Node.js 22 + TypeScript
- SQLite（better-sqlite3）
- 无外部依赖（外部 API 用 mock，可控制成功/失败）

**文件结构：**
```
/data-sync/
  package.json          # 依赖：better-sqlite3
  db.ts                 # SQLite 初始化 + sync_failures 表
  sync.ts               # 核心代码（含缺陷）
  config.ts             # 用户数据 + mock API
  test.ts               # 验证脚本
```

**关键数据（含隐蔽缺陷）：**
```typescript
// config.ts
export const users = [
  { id: 1, name: "Alice", data: [{ ts: "2024-01-01", value: 100 }] },
  { id: 2, name: "Bob", data: [{ ts: "2024-01-01", value: 200 }] },
];

// mock 外部 API — 第一次调用失败，第二次成功
let apiCallCount = 0;
export async function syncToExternal(userId: number, data: any[]) {
  apiCallCount++;
  if (apiCallCount === 1) {
    throw new Error("External API unavailable");
  }
  return { success: true };
}
```

**缺陷代码（sync.ts 核心结构）：**
```typescript
import { db } from "./db";
import { users, syncToExternal } from "./config";

// 去重 guard — 防止同一用户同一 cycle 重复处理
const synced = new Set<number>();

export async function syncUser(userId: number) {
  if (synced.has(userId)) return;

  // 标记为已处理，防止并发重复
  synced.add(userId);                          // ← guard 在前置条件之前设置

  const user = users.find((u) => u.id === userId);
  if (!user) return;

  const data = user.data;
  if (data.length === 0) return;               // ← 早退，但 guard 已设

  try {
    const result = await syncToExternal(userId, data);
    if (result.success) {
      console.log(`[sync] user ${userId} synced successfully`);
    }
  } catch (err) {
    // 记录失败，等待重试
    db.prepare(
      "INSERT INTO sync_failures (user_id, error, created_at) VALUES (?, ?, ?)"
    ).run(userId, (err as Error).message, new Date().toISOString());
    console.error(`[sync] user ${userId} failed:`, (err as Error).message);
  }
}

export async function retryFailedSyncs() {
  const failures = db.prepare("SELECT * FROM sync_failures").all() as any[];
  for (const f of failures) {
    if (synced.has(f.user_id)) continue;       // ← 永远 continue！
    await syncUser(f.user_id);                 // ← 永远不会执行
  }
}

export async function runCycle() {
  for (const user of users) {
    await syncUser(user.id);
  }
}
```

**验证脚本（test.ts）：**
```typescript
import { runCycle, retryFailedSyncs } from "./sync";
import { db } from "./db";

async function main() {
  // 第一次 cycle：user 1 同步失败（mock API 第一次调用抛错）
  await runCycle();

  const failuresAfterFirst = db.prepare("SELECT * FROM sync_failures").all();
  console.log(`After first cycle: ${failuresAfterFirst.length} failures`);

  // 重试
  await retryFailedSyncs();

  const failuresAfterRetry = db.prepare("SELECT * FROM sync_failures").all();
  console.log(`After retry: ${failuresAfterRetry.length} failures`);

  // 判定：重试后 failures 应该减少（重试成功的不应再留在 failures 表）
  // 或者：syncToExternal 应被调用至少 2 次（第一次失败 + 重试）
  if (failuresAfterRetry.length >= failuresAfterFirst.length) {
    console.error("FAIL: retry did not reduce failures");
    process.exit(1);
  }
  console.log("PASS: retry worked");
}

main();
```

## AI 卡点分析（难度依据）

**naive AI 最可能选的直接解法：**
1. **检查重试函数的条件**：看 `retryFailedSyncs`，觉得逻辑没问题，可能是"重试间隔不够"或"条件太严格"。调整重试条件或添加延迟。
2. **在重试函数里加更多逻辑**：加 logging、加指数退避、加最大重试次数——但核心问题是 `synced.has()` 永远为 true，加什么逻辑都没用。
3. **检查 `syncToExternal` 的 mock**：觉得可能是 mock 的问题，改 mock 让它总是成功——但这不是代码 bug。
4. **在 `syncUser` 的 catch 里加重试**：直接在 catch 里递归调用 `syncUser`——但 guard 已设，递归也会被 guard 挡住。

**为什么这些路会踩中隐蔽缺陷：**
- 解法 1/2 聚焦在重试函数本身，但重试函数的逻辑是**正确的**——它只是被 guard 阻止了执行
- 解法 3 改测试环境不改代码，不解决根本问题
- 解法 4 在错误的地方加重试，guard 仍然阻止

**正确解法需要的关键洞察：**
问题不在重试函数，而在 `syncUser` 里 guard 设置的**时机**。guard 应该在**所有前置条件检查通过且同步已触发后**才设置，而不是在函数入口处。

```typescript
export async function syncUser(userId: number) {
  if (synced.has(userId)) return;

  const user = users.find((u) => u.id === userId);
  if (!user) return;

  const data = user.data;
  if (data.length === 0) return;

  // guard 在前置条件全部通过后才设置
  synced.add(userId);

  try {
    const result = await syncToExternal(userId, data);
    if (result.success) {
      console.log(`[sync] user ${userId} synced successfully`);
    }
  } catch (err) {
    db.prepare(
      "INSERT INTO sync_failures (user_id, error, created_at) VALUES (?, ?, ?)"
    ).run(userId, (err as Error).message, new Date().toISOString());
    // 同步失败时清除 guard，允许重试
    synced.delete(userId);
    console.error(`[sync] user ${userId} failed:`, (err as Error).message);
  }
}
```

**卡点类型：** 顺序陷阱 + 隐藏耦合 + 症状治标

## 期望最终状态（解决判定）
运行 `npx tsx test.ts` 后：
- 第一次 cycle 后 `sync_failures` 表有 1 条记录（user 1 同步失败）
- 调用 `retryFailedSyncs()` 后，`syncToExternal` 被调用至少 2 次（第一次失败 + 重试成功）
- `sync_failures` 表中记录数减少（重试成功的记录被清理或标记为已重试）
- 退出码为 0

二元判定：重试后 `syncToExternal` 调用次数 > 重试前 → PASS，否则 FAIL。

## 参考解法
```typescript
// 关键改动：移动 guard 设置时机 + 失败时清除 guard

export async function syncUser(userId: number) {
  if (synced.has(userId)) return;

  const user = users.find((u) => u.id === userId);
  if (!user) return;

  const data = user.data;
  if (data.length === 0) return;

  // ✅ guard 在前置条件全部通过后才设置
  synced.add(userId);

  try {
    const result = await syncToExternal(userId, data);
    if (result.success) {
      console.log(`[sync] user ${userId} synced successfully`);
    }
  } catch (err) {
    db.prepare(
      "INSERT INTO sync_failures (user_id, error, created_at) VALUES (?, ?, ?)"
    ).run(userId, (err as Error).message, new Date().toISOString());
    // ✅ 失败时清除 guard，允许重试
    synced.delete(userId);
    console.error(`[sync] user ${userId} failed:`, (err as Error).message);
  }
}
```

验证命令：
```bash
npx tsx test.ts
# 期望输出：
#   After first cycle: 1 failures
#   After retry: 0 failures
#   PASS: retry worked
# 退出码 0
```

## 试错记录（可选但宝贵）
真实解决过程中走过的弯路：
1. **最初 guard 在函数入口处设置**：看起来合理——"防止并发重复处理"。没意识到早退路径也会设 guard。
2. **AI review 指出后，第一反应是检查重试函数**：`shouldAutoGenerate` 逻辑看起来正确——支持对 "failed" 状态重试。花了时间确认重试条件没问题。
3. **然后怀疑是时区或时间比较的问题**：检查了 `getLocalDateTimeParts` 和 `time < settings.diaryGenerationTime` 的比较逻辑。
4. **最终回溯到 guard 设置时机**：意识到 `lastProcessedDate.set()` 在 `findEntriesByDate` 之前，早退后 guard 不清除，重试函数的 guard 检查永远命中。
5. **修法**：把 `lastProcessedDate.set()` 移到 `ensurePendingDiary` 之后，并在 `.catch()` 里加 `lastProcessedDate.delete()`。

关键教训：**guard 的设置时机必须晚于所有可能早退的前置条件检查，且失败时必须清除 guard。**

## 脱敏说明
- "日记自动生成调度器" → "数据同步服务"
- `lastProcessedDate` Map → `synced` Set
- `processUser` → `syncUser`
- `shouldAutoGenerate` → 隐含在 `retryFailedSyncs` 的调用逻辑中
- `findEntriesByDate` → `fetchUserData`
- `ensurePendingDiary` → 隐含在 `syncToExternal` 调用前
- `generateDiaryForDate` → `syncToExternal`
- 缺陷技术内核完全保留：guard 在前置条件之前设置 + 失败时不清除 guard + 重试函数检查同一 guard 导致死代码
