# 难题种子卡：后台任务失败记录未在成功时清理

## 摘要

一个看似简单的后台任务状态记录器：任务失败时把错误信息写进数据库，成功时更新状态。隐蔽缺陷在于——实现者很容易只更新 `status` 而忘记把之前留下的 `errorMessage` 清空，导致后续查询成功记录时仍然挂着过期的错误信息。

## 缺陷内核（真实来源）

在日记自动生成服务里，为了给用户在设置页展示失败原因，给 `diaries` 表新增了 `generation_error` 字段，并在 `generateDiaryForDate` 的 catch 块写入失败信息。但成功路径和重新生成入口都没有把 `generation_error` 重置为 `null`。结果是：某一天生成失败后记录了错误，用户点击重新生成并成功，数据库里那条日记的 `generation_error` 仍是旧错误，UI 会同时在同一条记录上显示"成功"和一条过期错误。

本质机制：新增"错误快照"字段时只考虑了"写入"逻辑，没考虑字段的生命周期状态机（pending → failed 要写；pending → generated / regenerate 要清空）。

## 真实来源说明

这个缺陷真实发生在 Night-Journal 项目的 `feat/diary-generation-logs` 分支开发中。代码审查时被发现：

- `api/services/diary.ts` 在 catch 块写入 `generationError`
- `api/services/diary.ts` 在成功更新 `generationStatus: "generated"` 时未清空 `generationError`
- `api/routers/diaries.ts` 的 `regenerate` mutation 更新 `generationStatus: "pending"` 时也未清空 `generationError`

修复方案：成功时和开始重新生成时都把 `generationError` 设为 `null`。

## 包装场景设计

把缺陷内核装进一个极简的"定时任务状态追踪脚本"。

任务描述：
> 写一个 `task-runner.js`，它读取 `db.json` 中的任务记录，调用一个外部服务（用 `runTask()` 模拟），根据结果更新记录。要求：
> - 任务进行中：`status = "pending"`
> - 任务成功：`status = "success"`，`result` 写入返回内容
> - 任务失败：`status = "failed"`，`error` 写入错误信息
> - 支持重试：对 `status = "failed"` 的任务再次调用 `runTask()`，更新状态
>
> `db.json` 初始有一条失败记录：`{ "id": 1, "status": "failed", "error": "connection timeout" }`。

表面任务非常简单：根据成功/失败更新两个字段。但正确的状态机要求成功或重试时把 `error` 清空，否则就会留下脏数据。

## 缺陷如何隐蔽嵌入

缺陷藏在"成功路径该做什么"的默认假设里。人/AI 看到"任务失败时记录 error"，本能会把注意力放在失败分支；看到成功分支，只会想"更新 status 和 result"。`error` 字段不是新失败才需要的东西，而是旧失败留下的残留——这个"清理旧状态"的动作非常容易被忽略，因为业务需求描述里通常不会明说"成功后清空 error"。

测试会检查：任务成功后，`error` 必须是 `null`；重试 pend 时，`error` 也必须是 `null`。

## 复现环境要素

- 基础镜像：Node.js 22
- 文件结构：
  - `task-runner.js`：待实现
  - `db.json`：初始任务记录
  - `test.js`：判定脚本
- 初始 `db.json`：
  ```json
  {
    "tasks": [
      { "id": 1, "status": "failed", "error": "connection timeout", "result": null }
    ]
  }
  ```
- `runTask()` 模拟器：
  - 第一次调用返回 `{ ok: true, data: "done" }`
  - 可配置为失败以测试失败路径
- 判定：运行 `node task-runner.js` 后读取 `db.json`，检查 `tasks[0].status === "success"` 且 `tasks[0].error === null`

## AI 卡点分析（难度依据）

- **naive AI 最可能选的直接解法**：
  - 失败时：`task.status = "failed"; task.error = error.message`
  - 成功时：`task.status = "success"; task.result = data`
  - 重试时：`task.status = "pending"`
  - 完全不会想到要清 `error`

- **为什么这条路会踩中隐蔽缺陷**：
  - 需求没明说"成功后清空 error"，naive 实现只更新"本次状态相关的字段"
  - `error` 是上一轮失败的残留，不是本次逻辑自然覆盖的字段
  - 测试不检查 status 本身，而是检查成功状态下的数据一致性

- **正确解法需要的关键洞察**：
  - 把 `status` 和 `error` 看作一个状态机：进入 success / pending（重试）状态时，error 必须重置
  - 或者实现一个 `updateTask(id, patch)`，显式把不相关的字段设回 null

- **卡点类型**：状态机盲区 / 隐藏耦合

## 期望最终状态（解决判定）

运行 `node task-runner.js` 后，`db.json` 中的记录变为：

```json
{
  "tasks": [
    { "id": 1, "status": "success", "error": null, "result": "done" }
  ]
}
```

并且额外测试：如果 `runTask()` 第一次失败、第二次成功，重试前 `status` 为 `pending` 且 `error` 为 `null`。

## 参考解法

```js
// task-runner.js
const fs = require("fs");

const DB_PATH = "./db.json";

function loadDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function runTask() {
  // 模拟外部服务：默认成功，可切换为失败
  return { ok: true, data: "done" };
}

async function main() {
  const db = loadDb();
  const task = db.tasks[0];

  task.status = "pending";
  task.error = null; // 重试或新执行时必须清空旧错误

  const res = await runTask();

  if (res.ok) {
    task.status = "success";
    task.result = res.data;
    task.error = null; // 关键：成功时清空错误
  } else {
    task.status = "failed";
    task.error = res.error;
    task.result = null;
  }

  saveDb(db);
}

main();
```

## 试错记录（可选但宝贵）

真实修复中第一次只改了 catch 块写 `generationError`，没意识到 success 路径也需要清。是代码审查里被指出"stale error"才补的。这个弯路说明：给数据模型加"错误快照"字段时，必须同时定义它的完整生命周期，否则就会出现成功记录带着旧错误的脏数据。

## 脱敏说明

- 项目名已泛化为"定时任务状态追踪脚本"
- 原字段 `generation_error` 简化为 `error`
- 原业务"日记自动生成"替换为通用"外部任务调用"
- 技术内核（新增错误字段后未在成功/重试路径清空）完全保留
