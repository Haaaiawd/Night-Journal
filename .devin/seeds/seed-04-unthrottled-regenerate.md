# 难题种子卡：报告生成服务——重复请求触发无限后台任务

## 摘要
一个报告生成服务：用户点击"生成报告"，服务端创建一条 "pending" 记录并 fire-and-forget 启动后台生成任务。`generate` 端点有"已存在则拒绝"的检查，看起来防了重复——但 `regenerate` 端点没有任何 pending 状态检查，每次调用都重置状态为 pending 并启动新的后台任务。用户快速连续调用 regenerate 可以触发任意数量的并发后台任务，造成成本放大和服务降级。

## 缺陷内核（真实来源）
**fire-and-forget 后台任务在启动前没有检查是否已有相同任务在运行。`generate` 端点有"已存在"检查（间接防重），但 `regenerate` 端点跳过了这个检查，直接将状态重置为 pending 并启动新任务。两个端点共享同一个后台任务函数，但只有 `generate` 有防重逻辑——不对称的防护让 `regenerate` 成了无限制的并发入口。**

一句话：防重检查只在一个入口做了，另一个入口绕过了它——两个入口共享同一个昂贵资源但防护不对称。

## 真实来源说明
这个缺陷真实发生在一个日记生成服务中（已脱敏）。`diaries.generate` mutation 在创建 pending 日记前检查"是否已存在"，如果存在就 throw CONFLICT——这间接防止了重复生成。但 `diaries.regenerate` mutation 没有检查当前 `generationStatus` 是否为 "pending"，它直接将状态重置为 "pending" 并 fire-and-forget 调用 `generateDiaryForDate`。AI review 指出这是 CWE-770：认证用户可以快速连续调用 regenerate，每次都会启动一个新的 LLM 请求（每次调用都是 2048 token 的 chat completion），造成无限制的成本放大。

修复方式是在 `regenerate` 中也添加 pending 状态检查：如果 `diary.generationStatus === "pending"`，throw CONFLICT。

## 包装场景设计
**场景：报告生成服务（report-generator）**

一个 Node.js 服务，用户可以请求生成报告。有两个操作：
- `generate`：首次生成（如果已有报告则拒绝）
- `regenerate`：重新生成已有报告

两个操作都会启动后台生成任务（模拟昂贵的 AI 调用）。

**任务描述（给 AI 的 instruction）：**
> 报告生成服务的 `regenerate` 端点有性能问题：用户快速连续调用可以触发无限多个并发后台任务。请修复，确保同一报告同时只有一个后台生成任务在运行。

## 缺陷如何隐蔽嵌入
缺陷藏在**两个端点防护的不对称**中：

```typescript
// generate — 有"已存在"检查（间接防重）
async function generate(reportId: string) {
  const existing = await findReport(reportId);
  if (existing) {
    throw new Error("Report already exists");  // ← 间接防止重复生成
  }
  await createReport(reportId, "pending");
  runGeneration(reportId).catch(console.error);  // fire-and-forget
}

// regenerate — 没有 pending 检查（看起来不需要？）
async function regenerate(reportId: string) {
  const report = await findReport(reportId);
  if (!report) throw new Error("Report not found");

  // 保存版本快照
  await saveVersion(report);

  // 重置状态为 pending
  await updateReport(reportId, { status: "pending" });

  // ← 没有检查 report.status 是否已经是 "pending"！
  // ← 每次调用都启动新的后台任务！
  runGeneration(reportId).catch(console.error);  // fire-and-forget
}
```

**为什么 AI 不容易一眼看出：**
1. `generate` 有"已存在"检查——看起来"防重逻辑有了"
2. `regenerate` 的语义是"重新生成"——naive AI 觉得"用户想重新生成就让它重新生成，为什么要拦？"
3. `regenerate` 有版本快照逻辑——看起来"考虑周全"
4. 状态重置为 pending 看起来是"正确的状态管理"
5. fire-and-forget 模式看起来是"正常的异步处理"
6. naive AI 不会想到"快速连续调用"这个攻击向量——它假设用户是"正常使用"

## 复现环境要素

**基础环境：**
- Node.js 22 + TypeScript
- SQLite（better-sqlite3）
- 无外部依赖（生成任务用 mock，可计数）

**文件结构：**
```
/report-generator/
  package.json          # 依赖：better-sqlite3
  db.ts                 # SQLite 初始化 + reports 表
  generator.ts          # 核心代码（含缺陷）
  test.ts               # 验证脚本
```

**关键数据（含隐蔽缺陷）：**
```typescript
// db.ts — reports 表
// CREATE TABLE reports (
//   id TEXT PRIMARY KEY,
//   status TEXT NOT NULL DEFAULT 'pending',
//   content TEXT,
//   created_at TEXT NOT NULL,
//   updated_at TEXT NOT NULL
// );

// 全局计数器 — 记录后台任务启动次数
let generationCount = 0;
export function getGenerationCount() { return generationCount; }
export function incrementGenerationCount() { generationCount++; }
```

**缺陷代码（generator.ts 核心结构）：**
```typescript
import { db } from "./db";

// 模拟昂贵的后台生成任务（每次 500ms）
async function runGeneration(reportId: string) {
  incrementGenerationCount();
  await new Promise((r) => setTimeout(r, 500));  // 模拟 AI 调用耗时
  db.prepare("UPDATE reports SET status = 'completed', content = ? WHERE id = ?")
    .run(`Report content for ${reportId}`, reportId);
}

export async function generate(reportId: string) {
  const existing = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (existing) {
    throw new Error("Report already exists. Use regenerate instead.");
  }

  db.prepare("INSERT INTO reports (id, status, created_at, updated_at) VALUES (?, 'pending', ?, ?)")
    .run(reportId, new Date().toISOString(), new Date().toISOString());

  runGeneration(reportId).catch((err) => {
    console.error(`[generate] background failed for ${reportId}:`, err);
    db.prepare("UPDATE reports SET status = 'failed' WHERE id = ?").run(reportId);
  });
}

export async function regenerate(reportId: string) {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId) as any;
  if (!report) {
    throw new Error("Report not found");
  }

  // 保存版本快照（看起来考虑周全）
  db.prepare("INSERT INTO report_versions (report_id, content, saved_at) VALUES (?, ?, ?)")
    .run(reportId, report.content, new Date().toISOString());

  // 重置状态为 pending
  db.prepare("UPDATE reports SET status = 'pending', content = NULL WHERE id = ?")
    .run(reportId);

  // ← 缺陷：没有检查 report.status 是否已经是 "pending"
  // ← 每次调用都启动新的后台任务
  runGeneration(reportId).catch((err) => {
    console.error(`[regenerate] background failed for ${reportId}:`, err);
    db.prepare("UPDATE reports SET status = 'failed' WHERE id = ?").run(reportId);
  });

  return { id: reportId, status: "pending" };
}
```

**验证脚本（test.ts）：**
```typescript
import { generate, regenerate } from "./generator";
import { db, getGenerationCount } from "./db";

async function main() {
  // 第一步：首次生成
  await generate("report-1");
  await new Promise((r) => setTimeout(r, 800));  // 等待生成完成
  const countAfterGenerate = getGenerationCount();
  console.log(`After generate: ${countAfterGenerate} generation tasks`);

  // 第二步：快速连续调用 regenerate 5 次（不等完成）
  // 如果有 pending 检查，只有第 1 次应该成功，后 4 次应该被拒绝
  let successCount = 0;
  let errorCount = 0;
  for (let i = 0; i < 5; i++) {
    try {
      await regenerate("report-1");
      successCount++;
    } catch (err) {
      errorCount++;
    }
  }

  // 等待所有后台任务完成
  await new Promise((r) => setTimeout(r, 2000));

  const countAfterRegenerate = getGenerationCount();
  const newTasks = countAfterRegenerate - countAfterGenerate;
  console.log(`After 5 rapid regenerates: ${successCount} succeeded, ${errorCount} rejected`);
  console.log(`New background tasks spawned: ${newTasks}`);

  // 判定：不应该启动 5 个后台任务
  // 正确行为：第 1 次 regenerate 启动 1 个任务（状态变 pending），
  //           后 4 次应该被 pending 检查拒绝
  if (newTasks >= 5) {
    console.error(`FAIL: ${newTasks} background tasks spawned — no throttling on regenerate`);
    process.exit(1);
  }

  console.log("PASS: regenerate has pending check");
  process.exit(0);
}

main();
```

## AI 卡点分析（难度依据）

**naive AI 最可能选的直接解法：**
1. **加全局速率限制**：每个用户每分钟最多 N 次请求。——能缓解但不能根治，且改变了功能语义（用户可能合理地需要快速重试）。
2. **在 `runGeneration` 内部加锁**：用 Map 记录正在运行的 reportId，如果已有就跳过。——这能工作但改动了底层函数，且 fire-and-forget 的 .catch() 需要清理锁，容易遗漏。
3. **在 `regenerate` 里加延迟**：`await new Promise(r => setTimeout(r, 1000))` 再启动——只是减慢了攻击，不是防护。
4. **"这不是 bug"**：觉得 regenerate 的语义就是"重新生成"，用户想调几次调几次——忽略了成本放大和服务降级。

**为什么这些路会踩中隐蔽缺陷：**
- 解法 1 改变了功能语义，且速率限制是"流量控制"不是"并发控制"
- 解法 2 改动了底层共享函数，可能影响 `generate` 端点的正常行为
- 解法 3 只是减慢攻击，N 个请求还是会启动 N 个任务
- 解法 4 完全没认识到问题——最 naive 的反应

**正确解法需要的关键洞察：**
问题是不对称防护——`generate` 有防重，`regenerate` 没有。最小改动是在 `regenerate` 中添加 pending 状态检查，和 `generate` 的防重逻辑对称：

```typescript
export async function regenerate(reportId: string) {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId) as any;
  if (!report) {
    throw new Error("Report not found");
  }

  // ✅ 关键：检查是否已有生成任务在运行
  if (report.status === "pending") {
    throw new Error("Generation already in progress for this report");
  }

  // 保存版本快照
  db.prepare("INSERT INTO report_versions (report_id, content, saved_at) VALUES (?, ?, ?)")
    .run(reportId, report.content, new Date().toISOString());

  // 重置状态为 pending
  db.prepare("UPDATE reports SET status = 'pending', content = NULL WHERE id = ?")
    .run(reportId);

  runGeneration(reportId).catch((err) => {
    console.error(`[regenerate] background failed for ${reportId}:`, err);
    db.prepare("UPDATE reports SET status = 'failed' WHERE id = ?").run(reportId);
  });

  return { id: reportId, status: "pending" };
}
```

**卡点类型：** 隐藏耦合 + 症状治标

## 期望最终状态（解决判定）
运行 `npx tsx test.ts` 后：
- 首次 `generate("report-1")` 启动 1 个后台任务
- 快速连续调用 5 次 `regenerate("report-1")`：
  - 第 1 次成功（启动 1 个后台任务）
  - 第 2-5 次被拒绝（throw "already in progress" 或类似消息）
- 新启动的后台任务数 ≤ 1（不是 5）
- 退出码为 0

二元判定：5 次 rapid regenerate 后新后台任务数 ≤ 1 → PASS；≥ 5 → FAIL。

## 参考解法
见上方"正确解法需要的关键洞察"中的完整代码。

验证命令：
```bash
npx tsx test.ts
# 期望输出：
#   After generate: 1 generation tasks
#   After 5 rapid regenerates: 1 succeeded, 4 rejected
#   New background tasks spawned: 1
#   PASS: regenerate has pending check
# 退出码 0
```

## 试错记录（可选但宝贵）
真实解决过程中走过的弯路：
1. **最初没意识到这是问题**：`regenerate` 的语义是"重新生成"，naive 觉得"用户想调就调"。是 AI review 主动指出 CWE-770。
2. **第一反应是加速率限制**：在路由层加 per-user throttle——但这改变了功能语义，且不能精确防护"同一报告的并发"。
3. **然后考虑在 `generateDiaryForDate` 内部加锁**：用 in-memory Set 记录正在生成的 (userId, date)——但这改动了底层函数，且需要处理锁的清理（成功/失败都要清理）。
4. **最终选择最小改动**：在 `regenerate` mutation 中添加 `generationStatus === "pending"` 检查，和 `generate` 的防重逻辑对称。只改了 6 行代码。

关键教训：**当两个入口共享同一个昂贵资源时，防护必须对称。只在一个入口做检查，另一个入口就是漏洞。**

## 脱敏说明
- "日记生成服务" → "报告生成服务"
- `diaries.generate` / `diaries.regenerate` → `generate` / `regenerate`
- `generateDiaryForDate` → `runGeneration`
- `diaryDate` → `reportId`
- `generationStatus: "pending"/"generated"/"failed"` → `status: "pending"/"completed"/"failed"`
- `createDiaryVersion` → `saveVersion`
- `diaries` 表 → `reports` 表
- 缺陷技术内核完全保留：两个入口共享 fire-and-forget 后台任务，只有 generate 有防重检查，regenerate 缺少 pending 状态检查
