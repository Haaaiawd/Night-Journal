# 题目包装与交付规范

## 核心原则

题目是**给 agent 出的题**，不是给人类看的文档。所有会提示 agent 的线索
都要从题目代码里拿掉，但验证失败时要用一句话让人类/平台一眼锁定 bug。

交付物分两类：

1. **给 agent 看的**（`environment/` 里的源码、`instruction.md`）
   - 不能暴露 bug 位置
   - 不能有"这里缺了什么""注意这个函数"之类的提示
   - 注释要像人类工程师随手写的，只解释"这段代码干什么"，不解释"为什么
     这样就够了"

2. **给验证者/平台看的**（`tests/verify.ts`、`tests/test.sh`、
   `solution/solve.sh` 里的逻辑说明）
   - 测试失败时输出一句话，明确锁定 bug
   - solve.sh 里要同时写**人读的逻辑说明**和**机器执行的代码**

## 包装技巧：让 agent 觉得"已经够了"

### 1. 增加"已完成"信号密度

在源码里放很多看起来已经完成的安全/性能处理：

```typescript
function normalizeWebhookUrl(url: string): string { ... }
function validateWebhookUrl(url: URL): void { ... }
function sanitizePayload(payload: object): string { ... }
function sanitizeHeaders(headers: Record<string, string>): ... { ... }
function checkRateLimit(userId: number): boolean { ... }
```

这些函数都真实存在、真实工作，但共同覆盖掉一个真正的缺口：
**没有校验目标网络位置**。agent 看到"validate""sanitize""check"这类函数名，
很容易产生"安全已处理"的确认偏误。

### 2. 引入真实但不影响 reward 的功能缺陷

在源码里放几个确实能改、但改了也拿不到 reward 的小问题：

- 错误信息泄露完整 URL
- timeout 30s 太长
- 重试没有 backoff
- 日志里没有错误分类

这些小问题消耗 agent 的注意力预算，让它修完就停。

### 3. 框架效应

instruction 里不要写"识别缺失的安全防护"，要写"修复已知的安全和性能问题"。
前者引导 agent 反向排查"还缺什么"，后者引导 agent 正向找"哪些代码有问题"。

### 4. 注释要像人类写的

允许注释解释代码逻辑，但禁止注释暴露设计意图：

- 允许： `// 规范化 webhook URL：去空白、去末尾斜杠、补 /webhook`
- 禁止： `// 注意：这里没校验私有 IP，是故意留下的 SSRF 陷阱`
- 禁止： `// 红鲱鱼：让 agent 以为安全已处理`
- 禁止： `// TODO: 需要加 SSRF 防护`

## 测试输出：一句话锁定 bug

测试代码（`verify.ts` / `test.sh`）失败时，要用一句话让出题人/平台知道
问题在哪。这个输出 agent 也看得到，所以不要说得太直白。

**好的失败输出**：
```
FAIL: sender.ts 在 fetch 前未校验 webhook URL 指向的私有/内部网络地址，允许访问本地服务
```

**不好的失败输出**（暴露题目设计）：
```
FAIL: SSRF 陷阱未被触发，agent 没加 hostname 校验
```

**技术中性但可锁定**的词汇：
- "私有/内部网络地址"
- "本地服务"
- "目标网络位置"
- "fetch 前"

避免在测试输出里用"SSRF""陷阱""红鲱鱼""agent"等出题术语。

## solve.sh 交付格式

`solve.sh` 必须同时包含**人类可读的解题思路**和**机器可执行的完整代码**。

### 格式要求

```bash
#!/bin/bash
set -e

# === 人读：解题思路 ===
#
# 核心问题：
#   sender.ts 里 URL 校验已经做了不少工作——normalize、协议检查、
#   校验 username/password、query、fragment，payload 也清洗了，
#   速率限制和 header 清洗也都有。但所有这些校验都没看一个关键问题：
#   webhook URL 指向的目标地址是否位于私有/内部网络。
#
# 修复思路：
#   1. 在 fetch 之前增加 hostname 私有网络校验。
#   2. 覆盖 loopback、RFC1918 私有地址、link-local、localhost 域名、
#      .local/.internal 后缀。
#   3. 保持原有功能不变：外部 webhook URL 仍然正常发送。

# === 机器执行：写出修复后的源码 ===
cat > /app/sender.ts << 'FIXED'
import { db } from "./db";
...
FIXED

echo "sender.ts fixed"
```

### 为什么这样写

- 逻辑说明部分：出题人/审核人读得懂，平台也能判断你是真人思路
- 代码部分：你进企业 IDE 后照着写，AI 生成后你要自己检查一遍
- 不写一行完整 bash 就算完成，而是把"改哪个文件""怎么改""为什么"都讲清楚

### 禁止

- 只有代码没有逻辑说明
- 只有逻辑说明没有代码
- 逻辑说明里用"红鲱鱼""陷阱""我故意"等出题黑话

## 代码去提示化 checklist

```
[ ] 源码注释只解释"做什么"，不解释"为什么这样就够了"
[ ] 没有 TODO / FIXME / 暗示缺失功能的注释
[ ] 没有"注意""警告""别改"等引导性文字
[ ] 函数名不用暗示完整性的词（如 validateWebhookUrl 可以，但 ensureWebhookUrlSafe 太满）
[ ] 测试失败输出能一句话锁定 bug，但不用"陷阱""红鲱鱼""SSRF"等出题术语
[ ] instruction.md 用"修复已知问题"框架，不用"发现缺失防护"框架
[ ] solve.sh 同时包含逻辑说明和完整代码
```

## 混淆式包装：让显性 bug 完美隐藏

混淆式包装的核心不是让代码难看，是**让 bug 看起来不像 bug**。
利用 LLM 的松懈——它看到安全函数存在、被调用、返回结果，就会判定
"已处理"，不会追踪结果到底有没有生效。

### 最高隐蔽等级：校验结果静默吞掉

安全函数存在、被调用、返回正确的校验结果，但**结果被静默吞掉**——
只 `console.warn` 不 `throw`，校验失败后继续往下执行。

```typescript
// isPrivateHost 函数存在且完整——覆盖 127/10/172.16-31/192.168/169.254/localhost
function isPrivateHost(hostname: string): boolean { ... }

// validateWebhookUrl 调用了 isPrivateHost，返回 { valid: false, error }
function validateWebhookUrl(url: URL): ValidationResult {
  // ... 各种校验
  if (isPrivateHost(url.hostname)) {
    return { valid: false, error: "private network" };
  }
  return { valid: true };
}

// sendWebhook 里检查了 validation.valid，但只 warn 不 throw
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

agent 如果要修，需要把 `console.warn` 改成 `throw new Error`。但 agent
大概率会：
- 看到 isPrivateHost 已存在 → 跳过
- 或者加一个新的 isPrivateHost 检查（重复劳动，但能过）
- 或者把 warn 改成 throw（正确解法，但需要发现 warn 后面没 throw）

### 混淆等级速查

| 等级 | 做法 | 隐蔽度 | agent 突破难度 |
|---|---|---|---|
| L0 | 没有任何安全函数，直接 fetch | 最低 | 极易 |
| L1 | 有 normalize + 协议校验，没 hostname 校验 | 低 | 易 |
| L2 | 有 validateWebhookUrl 做多项校验，没 hostname 校验 | 中 | 中 |
| L3 | 有 isPrivateHost + validateWebhookUrl，但结果只 warn 不 throw | 高 | 难 |
| L4 | L3 + 多个红鲱鱼函数 + 配置白名单 + 框架效应 | 极高 | 极难 |

当前 ssrf-webhook 题目用的是 L3。如果 agent 仍能稳定解出，升到 L4。

### 混淆式包装的通用模式

SSRF 题的"校验结果静默吞掉"不是唯一手法。以下是可复用到其他题型的混淆模式：

**模式 1：校验结果静默吞掉**
- 适用：安全防护类题目（SSRF、XSS、SQL 注入）
- 做法：安全函数存在且被调用，但结果只 log 不 throw
- agent 突破点：发现 log 后面没有中断流程
- 实测效果：kimi 从 2/2 降到 1/3

**模式 2：校验了错误的对象**
- 适用：权限/认证类题目
- 做法：`checkPermission(userId)` 存在且被调用，但检查的是 userId 是否存在，
  不是 userId 是否有权限
- agent 突破点：发现校验对象错了（查存在性 vs 查权限）
- 隐蔽度：高——函数名暗示"权限已检查"

**模式 3：校验在错误的时机**
- 适用：状态机/时序类题目
- 做法：`validateInput()` 在 parse 前调用，但 parse 后的值没再校验
- agent 突破点：发现校验时机和实际使用时机之间有 gap
- 隐蔽度：高——校验确实存在且被调用

**模式 4：校验覆盖了部分但不是全部**
- 适用：边界条件类题目
- 做法：`isPrivateHost` 覆盖了 IPv4 私有段，但漏了 IPv6 的 fc00::/7
- agent 突破点：发现覆盖不完整
- 隐蔽度：中——agent 容易看到"有校验"就跳过

**模式 5：校验结果被后续代码覆盖**
- 适用：配置/状态类题目
- 做法：`if (!valid) throw` 存在，但后面有 `try { ... } catch { /* ignore */ }`
  把异常吞掉了
- agent 突破点：发现异常被 catch 吞掉
- 隐蔽度：极高——throw 确实存在，但被外层 catch 吃了

**选择模式的依据**：
- 题型是"缺防护" → 模式 1 或 4
- 题型是"修 bug" → 模式 2 或 3
- 题型是"状态机" → 模式 3 或 5
- 想要最高隐蔽度 → 模式 1 或 5
