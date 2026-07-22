# 加压循环与治标封堵

初版题目几乎总是太简单。agent 会找到各种治标解法绕过你设计的卡点。你需要
一个迭代循环：**造题 → 自测 → 发现治标解法 → 加压 → 再测**，直到治标解法
全部被卡住。这个过程叫"加压"。

## 加压循环的标准流程

```
1. 造初版（oracle 通过）
2. 跑 agent eval（kimi / deepseek）
3. agent reward=1？→ 分析 trace，看它怎么过的
4. 如果是治标解法 → 设计新 test 场景卡住它
5. 确认参考解法仍能过新 test
6. 确认治标解法被新 test 卡住（reward=0）
7. 重跑 agent eval
8. agent 还能过？→ 回到第 3 步
9. agent 过不了 → 加压完成
```

## 实战案例：guard 时机题的加压过程

**初版**：sync.ts 里 guard 设置太早，失败后不释放，重试被挡。
test 只检查"失败后能否重试"。

**Round 1 自测**：kimi 用 `synced.clear()` 在入口清空 guard——症状治标，
过掉了 test。根因（guard 设置时机）没修。

**加压 Round 1**：verify.ts 增加"直接调用 syncUser(failedUser) 必须触发
新 API 调用"。`synced.clear()` 在 runCycle 入口清空，但直接调 syncUser
不走 runCycle，guard 还是挡。治标解法被卡。

**Round 2 自测**：kimi 和 deepseek 都改用 `synced.delete(userId)` 在
catch 块里释放 guard——这确实是合理修复，但没移动 guard 设置时机。
过掉了新 test。

**加压 Round 2**：verify.ts 增加"早退后重新进入"场景——user 3 一开始
没数据，syncUser 早退但 guard 已设，后来有数据了也进不去。
`synced.delete()` 在 catch 里只处理失败路径，不处理早退路径。
只有移动 guard 设置时机（移到前置条件之后）才能过。

**Round 3 自测**：kimi 解不出（reward=0），deepseek 找到了根因修复
（移动 guard 时机 + catch 里 delete）。加压完成。

## 治标解法的常见模式与封堵策略

| 治标模式 | agent 怎么做 | 怎么封堵 |
|---|---|---|
| 入口清空 | 在函数入口 `synced.clear()` | 设计不走该入口的直接调用场景 |
| 只修失败路径 | catch 里 `synced.delete()` | 设计早退后重新进入的场景（guard 在早退路径已设） |
| 调用方兜底 | `.catch()` 里更新状态 | 让 test 检查 retry_queue 记录数（throw 在 try 外不会插记录） |
| 加 timeout | 觉得慢就是问题 | test 检查的是"能不能访问到"，不是"快不快" |
| 加白名单 | 只允许特定域名 | 破坏功能需求，test 检查正常 URL 仍可用 |

**核心原则**：test 要检查**系统状态**，不是表层输出。每加一个 test 条件，
都要先确认参考解法能过、治标解法过不了。

## 多 bug 合并——第一个 bug 当幌子

单 bug 题目即使加了压，强模型还是能过。把两个不同类型的 bug 放在同一个
代码库里，难度会显著提升——但关键不是"两个都隐蔽"，而是**第一个 bug
较为明显，作为幌子掩盖第二个真正的 bug**。

**设计原则**：
- **Bug 1（幌子）**：相对容易发现，agent 一眼能看出来。修了它之后症状
  部分缓解，agent 觉得"搞定了"就停了。
- **Bug 2（真 bug）**：更隐蔽，跟 bug 1 的症状相关但根因不同。agent 如果
  修完 bug 1 就收手，不会发现 bug 2。
- 两个 bug 必须都修才能过 test（只修任何一个都 reward=0）。
- 治标解法也被卡住（只修调用方兜底也过不了）。

**为什么幌子策略有效**：agent 有"找到一个问题就停"的倾向。如果第一个 bug
很明显，它会投入精力修那个，产生"已经解决了"的满足感，不再深入审查。
这跟真实代码审查中的"满意陷阱"一样——找到一个 bug 就觉得审查完成了。

**test 设计**：每个 bug 对应一个独立的 test 条件。条件之间不能有依赖——
不能让修了 bug 1 后 bug 2 的 test 条件自动过。理想情况下 test 1 先过
（让 agent 觉得有进展），test 2/3 再卡住（迫使它继续找）。

**实战案例**：exam_003 合并了 throw 位置陷阱（bug 1，相对明显——throw
在 try 外面）和 guard 时机陷阱（bug 2，更隐蔽——guard 设置时机不对）。
test 1 查 pending 记录（卡 bug 1），test 2 查 retry_queue 记录数（卡
.catch() 兜底治标），test 3 查早退后重新进入（卡 bug 2）。
kimi reward=0，deepseek reward=1 但用了正确的根因修复。

## 心理学包装——让 agent 忙着修明面问题

对于"缺了安全防护"类题目（如 SSRF），agent 不会主动想到"还缺了什么"。
需要用心理学陷阱消耗它的注意力预算：

**满足陷阱**：放一个明显的红鲱鱼 bug（真实存在但不影响测试），agent 修了
就觉得"搞定了"。

**权威暗示**：函数名叫 `validateWebhookUrl`——agent 看到"validate"就觉得
"URL 已验证"。再加 `sanitizePayload`、`checkRateLimit`，agent 觉得
"这代码安全意识很强"。

**注意力预算耗尽**：代码里放多个"看起来需要改"的地方——错误信息泄露 URL、
timeout 太长、重试没 backoff。agent 忙着修这些，没精力去想"还缺了什么"。

**框架效应**：instruction 说"修复所有安全和性能问题"——让 agent 找
"有问题的代码"去改，而不是评估"缺了什么防护"。这两件事完全不同。

**确认偏误**：agent 看到 `new URL()` + 协议校验，会确认"URL 安全已处理"，
不会反向问"这个校验够不够"。

## 混淆式包装——让显性 bug 完美隐藏真正 bug

混淆式包装是心理学包装的进阶版。核心不是让代码难看，是**让 bug 看起来
不像 bug**。利用 LLM 的松懈——它看到安全函数存在、被调用、返回结果，
就会判定"已处理"，不会追踪结果到底有没有生效。

详细规范见 `references/packaging-and-delivery.md` 的"混淆式包装"章节，
这里讲加压循环中怎么用混淆。

### 核心手法：校验结果静默吞掉

安全函数存在、被调用、返回正确的校验结果，但**结果被静默吞掉**——
只 `console.warn` 不 `throw`，校验失败后继续往下执行。

```typescript
// isPrivateHost 函数存在且完整——覆盖所有私有网络段
function isPrivateHost(hostname: string): boolean { ... }

// validateWebhookUrl 调用了 isPrivateHost，返回 { valid: false, error }
function validateWebhookUrl(url: URL): ValidationResult {
  if (isPrivateHost(url.hostname)) {
    return { valid: false, error: "private network" };
  }
  return { valid: true };
}

// sendWebhook 检查了 validation.valid，但只 warn 不 throw
const validation = validateWebhookUrl(parsed);
if (!validation.valid) {
  console.warn(`[webhook] URL validation failed: ${validation.error}`);
  // 没有 throw，没有 return，继续 fetch
}
```

**为什么这个方案最隐蔽**：

1. LLM 看到 `isPrivateHost` 函数 → "私有网络检查已实现"
2. LLM 看到 `validateWebhookUrl` 调用 `isPrivateHost` → "校验逻辑已接入"
3. LLM 看到 `if (!validation.valid)` → "校验失败会被处理"
4. LLM **不会**追踪 `console.warn` 后面有没有 `throw`——它的注意力在
   "有没有校验"上，不在"校验结果怎么处理"上

**显性 bug（isPrivateHost 存在且被调用）完美隐藏了真正的 bug
（校验结果只 warn 不 throw）**。

### 混淆等级作为加压主轴

加压不只是"加 test 条件"，更是"提升混淆等级"。每次 agent 稳定解出，
就升一级混淆：

| 等级 | 做法 | agent 突破难度 | 实测通过率 |
|---|---|---|---|
| L0 | 没有任何安全函数，直接 fetch | 极易 | ~100% |
| L1 | 有 normalize + 协议校验，没 hostname 校验 | 易 | ~80% |
| L2 | 有 validateWebhookUrl 做多项校验，没 hostname 校验 | 中 | ~60% |
| L3 | 有 isPrivateHost + validateWebhookUrl，但结果只 warn 不 throw | 难 | ~33% |
| L4 | L3 + 多个红鲱鱼函数 + 配置白名单 + 框架效应 | 极难 | <20% |

**实测数据**（ssrf-webhook 题，kimi k2p7 + deepseek v4 各 3 次）：
- L2 版本：kimi 2/2 稳定通过，deepseek 1/3
- L3 版本：kimi 1/3，deepseek 1/3

L3 的 1/3 通过率符合 L1 难度区间（打败国内大部分基座模型）。

### agent trace 分析——混淆效果验证

加压后必须看 trace 确认 agent 卡在哪。不看 trace 就不知道混淆有没有效。

**kimi 在 L3 的 trace 分析**：
- Run 1：空跑，agent 没做事（模型随机性）
- Run 2：精准命中——直接把 `console.warn` 改成 `throw new Error`。正确解法
- Run 3：过度工程——加 `dns.resolve4` DNS 解析、把 validateWebhookUrl 改成
  async、加指数退避。改太多反而把外部 URL 也阻断了，reward=0

**关键发现**：即使混淆到 L3，强模型仍有约 1/3 概率精准命中。但另外 2/3
会因为"过度工程"或"空跑"而失败。这说明混淆的作用不是让 agent 完全解不出，
而是把通过率从"稳定通过"压到"偶尔通过"。

### 加压循环中的混淆升级路径

```
1. 造初版（L1-L2 混淆 + oracle 通过）
2. 跑 agent eval
3. agent 稳定通过（>50%）→ 升一级混淆
   - L2→L3：把"没校验"改成"校验了但结果被吞掉"
   - L3→L4：加配置白名单、更多红鲱鱼函数、框架效应
4. 重跑 agent eval
5. agent 偶尔通过（~33%）→ 看trace确认卡点符合设计
6. 卡点符合 → 加压完成
7. agent 仍稳定通过 → 继续升级
```

**注意**：混淆升级时，test.sh 不一定要改——混淆改的是 environment/ 里的
源码，test 检查的是最终行为。只要 oracle 仍能过、未修复版仍 reward=0，
混淆升级就有效。

## 种子卡类型与加压策略速查

| 卡点类型 | 种子卡 | agent 治标倾向 | 加压方向 |
|---|---|---|---|
| try/catch 红鲱鱼 | seed-01 stuck pending | 调用方 .catch() 兜底 | test 查 retry_queue 记录数（throw 在 try 外不插记录）|
| guard 时机陷阱 | seed-02 dead retry guard | catch 里 synced.delete() | test 加早退后重新进入场景（guard 在早退路径已设）|
| SSRF 安全盲区 | seed-03 ssrf webhook | 加 timeout / 加白名单 / "看起来没问题" | 混淆升级：L2→L3 校验结果静默吞掉（见混淆等级表）|
| 不对称防护 | seed-04 unthrottled regenerate | 加全局速率限制 / "这不是 bug" | test 快速连续调用后查后台任务数 |

**安全盲区类（SSRF）的特殊性**：这类题不是"修 bug"而是"发现缺了安全
防护"。agent 最容易漏——看到 URL 校验和协议校验就觉得"安全已处理"。
加压的核心手段不是加 test 条件，而是**提升混淆等级**——从"没校验"
升级到"校验了但结果被吞掉"。test 用 mock 内网服务验证 fetch 被阻断，
这个 test 设计本身不变，变的是 environment/ 里源码的混淆程度。

**不对称防护类的特殊性**：两个入口共享昂贵资源，只检查一个入口。agent
容易觉得"regenerate 语义就是重新生成，用户想调就调"。test 要快速连续
调用后查后台任务启动次数，不能只看代码里有没有加检查。

## 题目命名规范

不要用 `exam_001` / `exam_002` 这种序号命名——无信息量。用 bug 概述命名：

- `dead-retry-guard` — guard 时机导致重试死代码
- `stuck-pending-throw` — throw 位置导致状态卡住
- `ssrf-webhook` — webhook URL 缺少私有网络校验
- `unthrottled-regenerate` — regenerate 缺少 pending 检查
- `merged-notify-bugs` — 多 bug 合并题
