# 难题种子卡：邮件摘要发送器——部分记录永久卡在 pending 状态

## 摘要
一个简单的邮件摘要发送服务：为每个用户创建一条 "pending" 发送记录，校验邮箱配置后发送邮件。看起来有完整的 try/catch 错误处理——但没配邮箱的用户会永久卡在 "pending"，因为校验 throw 发生在 try/catch 之外，而 pending 记录早已写入了数据库。

## 缺陷内核（真实来源）
**函数 A 创建 "pending" 状态记录后调用函数 B；函数 B 在自己的 try/catch 之前就 throw 了校验错误；throw 穿透回函数 A 的 .catch()，但那个 catch 只 log 不清理 pending 记录。结果：pending 记录成为孤儿，永远不会变成 "failed"。**

一句话：throw 在 try/catch 作用域之外，但状态记录已在 try 之前创建——错误处理存在但不覆盖真正的失败点。

## 真实来源说明
这个缺陷真实发生在一个日记自动生成调度器中（已脱敏）。调度器为每个用户创建 "pending" 状态的日记记录，然后调用生成函数。生成函数在 try/catch 之前检查 AI API 凭证，如果用户没配置 API key 就 throw "Diary model not configured"。这个 throw 在 try/catch 之外，所以 catch 块里的 `updateDiary(status: "failed")` 永远不会执行。调度器的 .catch() 只打印日志，不清理 pending 记录。用户列表里永远显示一条"生成中"的幽灵日记。

数据库 schema 里 `diaryGenerationTime` 有默认值 `"02:00"`，所以任何有 AI 设置记录的用户（哪怕只配了图片识别没配日记生成）都会触发调度器——放大了影响范围。

## 包装场景设计
**场景：邮件摘要发送服务（email-digest-sender）**

一个 Node.js 服务，每天为用户发送邮件摘要。流程：
1. 遍历所有用户
2. 为每个用户创建一条 "pending" 的 send 记录
3. 调用 `sendDigest(userId)` 发送摘要
4. `sendDigest` 内部：校验邮箱配置 → 查找摘要内容 → 调用邮件 API

**任务描述（给 AI 的 instruction）：**
> 邮件摘要发送服务有 bug：部分 send 记录会永久卡在 "pending" 状态，既不是 "sent" 也不是 "failed"。请修复，确保所有 send 记录最终都会变成 "sent" 或 "failed"。

## 缺陷如何隐蔽嵌入
缺陷藏在**两个函数的控制流交界处**，不在单个函数内部：

```
processSends()                          // 函数 A（scheduler.ts 等价物）
  └─ createSendRecord(userId, "pending")  // ← 创建 pending 记录
  └─ sendDigest(userId)                   // ← 调用函数 B
       └─ if (!config.email) throw ...    // ← throw 在 try 之外！
       └─ try { sendEmail(...) }          // ← try/catch 只覆盖这里
            catch { markFailed() }        // ← 这个 catch 永远不会因校验失败而触发
  └─ .catch(err => console.error(err))    // ← 只 log，不清理 pending 记录
```

**为什么 AI 不容易一眼看出：**
1. try/catch **就在代码里**，扫一眼觉得"错误处理有了"
2. throw 和 try 只差几行，看起来不"违和"
3. 真正的问题在跨函数：A 创建了状态，B 的 throw 穿透了 B 自己的 catch
4. A 的 .catch() 存在，但只 log——看起来像"有意为之的 fire-and-forget"
5. 没配邮箱的用户是"边界用户"，naive 测试用正常用户跑一遍就过了

## 复现环境要素

**基础环境：**
- Node.js 22 + TypeScript
- SQLite（better-sqlite3 或等价物，不需要外部数据库）
- 无外部依赖（邮件 API 用 mock）

**文件结构：**
```
/email-digest/
  package.json          # 依赖：better-sqlite3
  db.ts                 # SQLite 初始化 + send_records 表
  sender.ts             # 核心代码（含缺陷）
  config.ts             # 用户配置（部分用户有邮箱，部分没有）
  test.ts               # 验证脚本
```

**关键数据（含隐蔽缺陷）：**
```typescript
// config.ts — 3 个用户，2 个有邮箱，1 个没有
const users = [
  { id: 1, email: "alice@example.com", subscribed: true },
  { id: 2, email: "bob@example.com", subscribed: true },
  { id: 3, email: null, subscribed: true },        // ← 边界用户：订阅了但没配邮箱
];
```

**缺陷代码（sender.ts 核心结构）：**
```typescript
import { db } from "./db";

// 函数 A：调度入口
export async function processAllSends() {
  const users = await getAllUsers();
  for (const user of users) {
    // 创建 pending 记录
    const record = db.prepare(
      "INSERT INTO send_records (user_id, status, created_at) VALUES (?, 'pending', ?)"
    ).run(user.id, new Date().toISOString());

    // 发送（fire-and-forget with catch）
    sendDigest(user.id).catch((err) => {
      console.error(`[sender] failed for user ${user.id}:`, err.message);
      // ← 只 log，不更新 send_records 状态！
    });
  }
}

// 函数 B：发送逻辑
export async function sendDigest(userId: number) {
  const config = await getUserConfig(userId);
  if (!config.email) {
    throw new Error("Email not configured");   // ← throw 在 try 之外
  }

  const digest = await buildDigest(userId);

  try {
    await sendEmail(config.email, digest);
    db.prepare("UPDATE send_records SET status = 'sent' WHERE user_id = ?")
      .run(userId);
  } catch (err) {
    db.prepare("UPDATE send_records SET status = 'failed' WHERE user_id = ?")
      .run(userId);                              // ← 只 catch 发送失败，不 catch 校验失败
    throw err;
  }
}
```

**验证脚本（test.ts）：**
```typescript
import { processAllSends } from "./sender";
import { db } from "./db";

async function main() {
  await processAllSends();
  // 等待异步发送完成
  await new Promise((r) => setTimeout(r, 2000));

  const pending = db.prepare("SELECT * FROM send_records WHERE status = 'pending'").all();
  const sent = db.prepare("SELECT * FROM send_records WHERE status = 'sent'").all();
  const failed = db.prepare("SELECT * FROM send_records WHERE status = 'failed'").all();

  console.log(`sent: ${sent.length}, failed: ${failed.length}, pending: ${pending.length}`);

  // 判定：不应该有任何 pending 记录
  if (pending.length > 0) {
    console.error("FAIL: still have pending records:", pending);
    process.exit(1);
  }
  console.log("PASS: all records are sent or failed");
}

main();
```

## AI 卡点分析（难度依据）

**naive AI 最可能选的直接解法：**
1. **症状治标**：加一个清理 cron，定期把老 pending 记录改成 failed。——看起来合理，但新记录还是会卡住。
2. **在函数 A 的 .catch() 里加 markFailed**：`db.prepare("UPDATE send_records SET status = 'failed' WHERE user_id = ?").run(userId)`。——更接近了，但需要知道 record id，而 fire-and-forget 的 .catch() 闭包里不一定能拿到。
3. **在函数 B 里把 throw 改成 return**：不 throw 了，直接 return。——但这样函数 A 不知道发生了什么，pending 记录还是不会被更新。

**为什么这些路会踩中隐蔽缺陷：**
- 解法 1 治标不治根：清理 cron 只处理历史数据，每次运行还是会产生新的 stuck pending
- 解法 2 需要跨闭包传递 record id，改动范围比预期大
- 解法 3 把 throw 改成 return 后，函数 A 完全无感知，pending 记录永远不被更新

**正确解法需要的关键洞察：**
核心问题是 **throw 的位置在 try/catch 作用域之外**。有两种正确的修法：

**修法 A（在调用方预防）：** 在函数 A 创建 pending 记录之前就检查邮箱配置，没配置的直接跳过或标记 failed。
```typescript
// 函数 A 中，创建 pending 之前
const config = await getUserConfig(user.id);
if (!config.email) {
  db.prepare("INSERT INTO send_records (user_id, status, created_at) VALUES (?, 'failed', ?)")
    .run(user.id, new Date().toISOString());
  continue;
}
```

**修法 B（扩大被调方的 try/catch 范围）：** 把校验逻辑移到 try 块内部，让 catch 能覆盖校验失败。
```typescript
export async function sendDigest(userId: number) {
  try {
    const config = await getUserConfig(userId);
    if (!config.email) {
      throw new Error("Email not configured");
    }
    const digest = await buildDigest(userId);
    await sendEmail(config.email, digest);
    db.prepare("UPDATE send_records SET status = 'sent' WHERE user_id = ?").run(userId);
  } catch (err) {
    db.prepare("UPDATE send_records SET status = 'failed' WHERE user_id = ?").run(userId);
    throw err;
  }
}
```

**卡点类型：** 隐蔽边界 + 症状治标 + 隐藏耦合

## 期望最终状态（解决判定）
运行 `node test.js`（或 `npx tsx test.ts`）后：
- `send_records` 表中 **status = 'pending' 的记录数为 0**
- user 1 和 user 2 的记录为 'sent'（有邮箱且邮件 API 是 mock 成功）
- user 3 的记录为 'failed'（无邮箱）
- 退出码为 0

二元判定：pending 记录数为 0 → PASS，否则 FAIL。

## 参考解法
```typescript
// 修法 B（扩大 try/catch 范围）— 最小改动

export async function sendDigest(userId: number) {
  try {
    const config = await getUserConfig(userId);
    if (!config.email) {
      throw new Error("Email not configured");
    }
    const digest = await buildDigest(userId);
    await sendEmail(config.email, digest);
    db.prepare("UPDATE send_records SET status = 'sent' WHERE user_id = ?").run(userId);
  } catch (err) {
    db.prepare("UPDATE send_records SET status = 'failed' WHERE user_id = ?").run(userId);
    throw err;
  }
}
```

验证命令：
```bash
npx tsx test.ts
# 期望输出：sent: 2, failed: 1, pending: 0
# 期望输出：PASS: all records are sent or failed
# 退出码 0
```

## 试错记录（可选但宝贵）
真实解决过程中走过的弯路：
1. **最初根本没检查 API 凭证**：调度器只检查了 `diaryGenerationTime`（有默认值），没检查 `diaryApiKey`。任何有 AI 设置记录的用户都会触发。
2. **AI review 指出后，第一反应是在调度器加检查**：在 `processUser` 里加了 `!settings.diaryApiKey || !settings.diaryApiBaseUrl` 的 early return。这防止了**新的** stuck pending，但已有的 pending 记录还是卡着。
3. **同时扩大了 `generateDiaryForDate` 的 try/catch**：把 `findEntriesByDate` 和 "No entries" throw 移进了 try 块。但 "Diary model not configured" 的 throw **仍然在 try 之外**（因为它在 diary 查找之前）。
4. **最终修法是双管齐下**：调用方（scheduler）在创建 pending 之前就检查凭证；被调方（generateDiaryForDate）扩大 try/catch 覆盖更多早期 throw。

关键教训：**throw 的位置相对于 try/catch 的位置，比 throw 本身是否存在更重要。**

## 脱敏说明
- "日记生成调度器" → "邮件摘要发送服务"
- `diaryGenerationTime` / `diaryApiKey` / `diaryApiBaseUrl` → `email` 配置
- `diaries` 表 → `send_records` 表
- `generationStatus: "pending"/"generated"/"failed"` → `status: "pending"/"sent"/"failed"`
- `generateDiaryForDate` → `sendDigest`
- `processUser` → `processAllSends` 中的循环体
- `ensurePendingDiary` → `createSendRecord`
- 缺陷技术内核完全保留：throw 在 try/catch 之外 + 状态记录在 throw 之前创建 + 调用方 catch 只 log 不清理
