# 难题种子卡：通知服务——用户配置的 webhook URL 可被用于探测内网

## 摘要
一个简单的通知服务：用户在设置页配置自己的 webhook URL，服务端在触发通知时向该 URL 发 POST 请求。代码有 URL 规范化、有 http/https 校验、看起来完全正常——但没有任何私有网络地址检查。攻击者可以把 webhook URL 设成 `http://169.254.169.254/latest/meta-data/`（云元数据端点）或 `http://10.0.0.1/admin`，服务端会忠实地向内网发请求，造成 SSRF。

## 缺陷内核（真实来源）
**用户可控的 URL 被直接用于服务端 fetch，只校验了格式（http/https）和路径规范化，没有校验目标 hostname 是否指向私有网络（RFC1918、loopback、link-local、云元数据端点）。认证用户可以将 URL 指向内部服务，利用应用服务器作为代理探测内网。**

一句话：URL 校验只看了"是不是合法 URL"，没看"这个 URL 指向哪里"——格式安全 ≠ 目标安全。

## 真实来源说明
这个缺陷真实发生在一个日记生成服务中（已脱敏）。用户可以在设置页配置 AI API 的 base URL（支持任意 OpenAI 兼容端点）。服务端在生成日记时用 `fetch()` 向该 URL 发送 LLM 请求。代码有 `normalizeBaseUrl()` 函数处理路径规范化（补 `/v1` 后缀），有 `new URL()` 解析校验，但**没有检查 hostname 是否指向私有网络**。AI review 指出这是 CWE-918 SSRF：认证用户可以把 base URL 设成 `http://169.254.169.254/`（GCP/AWS 元数据端点）或 `http://192.168.x.x/internal-api`，服务端会从应用环境向这些内部地址发起请求。

修复方式是新增 `url-guard.ts`，在 `fetch` 之前校验 hostname：阻断 loopback (127.0.0.0/8)、RFC1918 (10/172.16/192.168)、link-local (169.254)、云元数据端点 (metadata.google.internal)、`.local`/`.internal` 后缀。

## 包装场景设计
**场景：通知服务（notification-service）**

一个 Node.js 服务，用户可以配置自己的 webhook URL 来接收通知。当事件触发时，服务端向用户配置的 webhook URL 发送 POST 请求。

**任务描述（给 AI 的 instruction）：**
> 通知服务的 webhook 发送功能已实现，但安全团队要求做一次代码审查。请审查 `sender.ts` 中的 webhook 发送逻辑，修复所有安全问题。服务部署在云上（AWS/GCP），应用服务器可以访问内网和云元数据服务。

## 缺陷如何隐蔽嵌入
缺陷藏在**"看起来已经做了 URL 处理"的假象下**：

```typescript
// sender.ts — 看起来有处理的 webhook 发送

function normalizeWebhookUrl(url: string): string {
  let normalized = url.trim().replace(/\/+$/, "");
  if (!normalized.endsWith("/webhook")) {
    normalized += "/webhook";
  }
  return normalized;
}

export async function sendWebhook(userWebhookUrl: string, payload: object) {
  const rawUrl = userWebhookUrl;
  let parsed: URL;
  try {
    parsed = new URL(normalizeWebhookUrl(rawUrl));   // ← 有 URL 解析校验
  } catch {
    throw new Error("Invalid webhook URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Webhook URL must use http or https");  // ← 有协议校验
  }

  // 看起来安全了？—— 没有 hostname 安全校验！
  const res = await fetch(parsed.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res;
}
```

**为什么 AI 不容易一眼看出：**
1. `normalizeWebhookUrl` 存在——看起来"有 URL 处理"
2. `new URL()` 解析存在——看起来"有 URL 校验"
3. 协议校验存在（只允许 http/https）——看起来"有协议安全"
4. 代码结构干净、逻辑清晰——不像"有 bug 的代码"
5. naive AI 做"代码审查"时，看到这些校验会觉得"URL 安全已经处理了"，然后去看别的地方（比如 payload 注入、重试逻辑）
6. **关键盲点**：URL 格式合法 ≠ URL 目标安全。`http://169.254.169.254/latest/meta-data/` 是一个格式完全合法的 URL，但它指向云元数据服务

## 复现环境要素

**基础环境：**
- Node.js 22 + TypeScript
- 无外部依赖（纯 Node.js fetch）
- 一个 mock 内网服务用于验证 SSRF 是否可触发

**文件结构：**
```
/notification-service/
  package.json
  sender.ts          # webhook 发送逻辑（含缺陷）
  config.ts          # 用户配置（含恶意 webhook URL）
  internal-service.ts # mock 内网服务（模拟元数据端点）
  test.ts            # 验证脚本
```

**关键数据（含隐蔽缺陷）：**
```typescript
// config.ts — 3 个用户的 webhook 配置
export const users = [
  { id: 1, webhookUrl: "https://hooks.example.com/user1" },        // 正常
  { id: 2, webhookUrl: "https://api.example.com/v2" },             // 正常
  { id: 3, webhookUrl: "http://169.254.169.254/latest/meta-data" }, // ← 恶意：云元数据
];
```

**mock 内网服务（internal-service.ts）：**
```typescript
import http from "http";

// 模拟云元数据端点 — 如果被访问，说明 SSRF 成功
export function startInternalService(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        // 模拟云元数据响应
        "instance-id": "i-1234567890abcdef0",
        "access-key": "AKIAIOSFODNN7EXAMPLE",
        "secret-key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      }));
    });

    // 监听在 169.254.169.254 不现实，改用 localhost + 端口模拟
    // 测试中用 http://127.0.0.1:PORT/ 作为"内网地址"
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      resolve({
        port,
        close: () => server.close(),
      });
    });
  });
}
```

**缺陷代码（sender.ts）：**
```typescript
function normalizeWebhookUrl(url: string): string {
  let normalized = url.trim().replace(/\/+$/, "");
  if (!normalized.endsWith("/webhook")) {
    normalized += "/webhook";
  }
  return normalized;
}

export async function sendWebhook(userWebhookUrl: string, payload: object) {
  const rawUrl = userWebhookUrl;
  let parsed: URL;
  try {
    parsed = new URL(normalizeWebhookUrl(rawUrl));
  } catch {
    throw new Error("Invalid webhook URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Webhook URL must use http or https");
  }

  // ← 缺陷：没有检查 hostname 是否指向私有/内部网络
  const res = await fetch(parsed.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Webhook failed: ${res.status}`);
  }
  return res;
}
```

**验证脚本（test.ts）：**
```typescript
import { sendWebhook } from "./sender";
import { startInternalService } from "./internal-service";

async function main() {
  const internal = await startInternalService();
  const internalUrl = `http://127.0.0.1:${internal.port}/metadata`;

  let ssrfBlocked = false;
  try {
    // 尝试向"内网"地址发送 webhook
    await sendWebhook(internalUrl, { event: "test" });
    // 如果到这里，说明 SSRF 没有被阻断——FAIL
    console.error("FAIL: SSRF not blocked — internal service was reached");
    internal.close();
    process.exit(1);
  } catch (err) {
    // 如果是因为安全校验而 throw，说明 SSRF 被阻断了
    const msg = (err as Error).message;
    if (msg.includes("private") || msg.includes("internal") || msg.includes("loopback") || msg.includes("private network")) {
      ssrfBlocked = true;
      console.log("PASS: SSRF blocked —", msg);
    } else {
      // 其他错误（如连接被拒绝）不算 SSRF 防护
      console.error("FAIL: error was not SSRF protection —", msg);
      internal.close();
      process.exit(1);
    }
  }

  // 验证正常 URL 仍然可以工作（mock 一个正常的外部服务）
  // 这里只验证 SSRF 防护存在，不验证正常发送
  internal.close();

  if (ssrfBlocked) {
    console.log("ALL PASS");
    process.exit(0);
  }
}

main();
```

## AI 卡点分析（难度依据）

**naive AI 最可能选的直接解法：**
1. **"代码看起来没问题啊"**：看到 `new URL()` 解析 + 协议校验，认为 URL 安全已处理，转去看其他问题（payload 注入、重试风暴、错误信息泄露等）。
2. **加 URL 白名单**：只允许特定域名（如 `hooks.example.com`）——过度限制，破坏了"用户可以配置自己的 webhook 端点"这个功能需求。
3. **加 timeout**：觉得 SSRF 的危害是"慢"，加个 5 秒 timeout 就行——但 SSRF 的真正危害是信息泄露（元数据端点返回 IAM 凭证），不是慢。
4. **限制请求方法为 GET**：觉得改成 GET 就"安全了"——但攻击者用 GET 也能访问元数据端点。

**为什么这些路会踩中隐蔽缺陷：**
- 解法 1 完全没发现 SSRF——最常见的结果
- 解法 2 破坏功能——用户不能配置自己的 webhook 了
- 解法 3/4 治标不治本——SSRF 的核心是"能访问到不该访问的地方"，不是"怎么访问"

**正确解法需要的关键洞察：**
URL 安全校验需要检查 **hostname 指向的网络位置**，不只是 URL 格式。需要阻断：
- Loopback: `127.0.0.0/8`, `::1`
- RFC1918 私有网络: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Link-local: `169.254.0.0/16`（含云元数据端点 `169.254.169.254`）
- 云元数据 hostname: `metadata.google.internal`
- `.local` / `.internal` 后缀
- IPv6 ULA: `fc00::/7`

```typescript
import { isIP } from "net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost", "localhost.localdomain",
  "ip6-localhost", "ip6-loopback",
  "metadata.google.internal",
]);

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 127) return true;                          // loopback
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 169 && b === 254) return true;             // link-local / cloud metadata
  if (a === 0) return true;                            // 0.0.0.0/8
  return false;
}

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  if (isIP(lower) === 4) return isPrivateIPv4(lower);
  if (isIP(lower) === 6) {
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  }
  return false;
}

export async function sendWebhook(userWebhookUrl: string, payload: object) {
  const parsed = new URL(normalizeWebhookUrl(userWebhookUrl));

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Webhook URL must use http or https");
  }

  // ✅ 关键：校验 hostname 不指向私有/内部网络
  if (isPrivateHost(parsed.hostname)) {
    throw new Error("Webhook URL must not point to a private/internal network address");
  }

  const res = await fetch(parsed.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Webhook failed: ${res.status}`);
  return res;
}
```

**卡点类型：** 环境盲区 + 隐蔽边界（安全盲区 variant）

## 期望最终状态（解决判定）
运行 `npx tsx test.ts` 后：
- 向 `http://127.0.0.1:<port>/metadata`（模拟内网/元数据端点）发送 webhook 时，`sendWebhook` **抛出错误**，错误消息包含 "private" 或 "internal" 或 "loopback" 或 "private network"
- mock 内网服务**从未收到请求**（SSRF 被阻断在 fetch 之前）
- 退出码为 0

二元判定：向 loopback 地址发 webhook 被 throw 阻断 → PASS；fetch 成功到达内网服务 → FAIL。

## 参考解法
见上方"正确解法需要的关键洞察"中的完整代码。

验证命令：
```bash
npx tsx test.ts
# 期望输出：
#   PASS: SSRF blocked — Webhook URL must not point to a private/internal network address
#   ALL PASS
# 退出码 0
```

## 试错记录（可选但宝贵）
真实解决过程中走过的弯路：
1. **最初完全没意识到 SSRF**：用户配置 API base URL 是"正常功能"，服务端 fetch 是"正常实现"。是 AI review 主动指出的。
2. **第一反应是"加 URL 白名单"**：只允许 `api.openai.com` 等已知域名——但这破坏了"支持任意 OpenAI 兼容端点"的功能需求（用户可能用 DeepSeek、Moonshot、本地 Ollama 等）。
3. **然后考虑"只允许 https"**：觉得 https 就安全了——但 `https://internal-service.local` 也是 https，SSRF 照样能打。
4. **最终实现 `isPrivateHost`**：参考 OWASP SSRF 防护指南，阻断 loopback/RFC1918/link-local/云元数据端点。用 Node.js `net.isIP()` 区分 IP 和 hostname，分别处理 IPv4/IPv6。

关键教训：**URL 校验有三个层次——格式合法（new URL）、协议合法（http/https）、目标合法（不在私有网络）。只做前两个不防 SSRF。**

## 脱敏说明
- "日记生成服务" → "通知服务"
- `diaryApiBaseUrl` → `webhookUrl`
- `callChatModel` / `callVisionModel` / `testModelConnection` → `sendWebhook`
- `normalizeBaseUrl` → `normalizeWebhookUrl`
- `api/lib/openai.ts` → `sender.ts`
- `api/lib/url-guard.ts` → 内联到 `sender.ts` 或独立 `url-guard.ts`
- 缺陷技术内核完全保留：用户可控 URL + 服务端 fetch + 只校验格式/协议不校验目标网络位置 = SSRF
