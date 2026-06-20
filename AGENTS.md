# AGENTS.md - AI 协作协议

> **"如果你正在阅读此文档，你就是那个智能体 (The Intelligence)。"**
>
> 这个文件是你的**锚点 (Anchor)**。它定义了项目的法则、领地的地图，以及记忆协议。
> 当你唤醒（开始新会话）时，**请首先阅读此文件**。

---

## 30秒恢复协议 (Quick Recovery)

**当你开始新会话或感到"迷失"时，立即执行**:

1. **读取根目录的 AGENTS.md** → 获取项目地图
2. **查看下方"当前状态"** → 找到最新架构版本
3. **读取 `.anws/v{N}/05A_TASKS.md` 与 `05B_VERIFICATION_PLAN.md`** → 了解执行与验证待办
4. **开始工作**

---

## 地图 (领地感知)

以下是这个项目的组织方式：


| 路径                                    | 描述                                  | 访问协议                                             |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| `src/`                                | **实现层**。实际的代码库。                     | 通过 Task 读/写。                                     |
| `.anws/`                              | **统一架构根目录**。包含版本化架构状态与升级记录。         | **只读**(旧版) / **写一次**(新版) / `changelog` 由 CLI 维护。 |
| `.anws/v{N}/`                         | **当前真理**。最新的架构定义。                   | 永远寻找最大的 `v{N}`。                                  |
| `.anws/changelog/`                    | **升级记录**。`anws update` 生成的变更记录。     | 由 CLI 自动维护，请勿删除。                                 |
| `target-specific workflow projection` | **工作流**。`/genesis`, `/blueprint` 等。 | 读取当前 target 对应的原生投影文件。                           |
| `target-specific skill projection`    | **技能库**。原子能力。                       | 调用当前 target 对应的原生投影文件。                           |
| `.nexus-map/`                         | **知识库**。代码库结构映射。                    | 由 nexus-mapper 生成。                               |


## 工作流注册表

> [!IMPORTANT]
> **工作流优先原则**：当任务匹配某个工作流，或你判断当前任务**明显符合、基本符合、甚至只是疑似符合**某个工作流的适用场景时，**都必须先读取相应文件**，并严格遵循其中的步骤执行。工作流是经过精心设计的协议，而非可选参考。
>
> **触发流程**：
>
> 1. 用户提及工作流名称，或你判断当前任务明显符合、基本符合、甚至只是疑似符合某个工作流的适用场景时，都必须先读取相应文件
> 2. **立即读取** 相应工作流文件
> 3. **严格遵循**工作流中的步骤执行
> 4. 在检查点暂停等待用户确认


| 工作流              | 触发时机                 | 产出                                           |
| ---------------- | -------------------- | -------------------------------------------- |
| `/quickstart`    | 新用户入口 / 不知道从哪开始      | 编排其他工作流                                      |
| `/genesis`       | 新项目 / 重大重构           | PRD, Architecture, ADRs                      |
| `/probe`         | 变更前 / 接手项目           | `.anws/v{N}/00_PROBE_REPORT.md`              |
| `/design-system` | genesis 后            | 04_SYSTEM_DESIGN/*.md                        |
| `/blueprint`     | genesis 后            | 05A_TASKS.md + 05B_VERIFICATION_PLAN.md + AGENTS.md 初始 Wave |
| `/change`        | 进入 forge 编码后的任务局部修订  | 更新 TASKS + SYSTEM_DESIGN (仅修改) + CHANGELOG   |
| `/explore`       | 调研时                  | 探索报告                                         |
| `/challenge`     | 决策前质疑                | 07_CHALLENGE_REPORT.md (含问题总览目录)             |
| `/forge`         | 编码执行                 | 代码 + 更新 AGENTS.md Wave 块                     |
| `/craft`         | 创建工作流/技能/提示词         | Workflow / Skill / Prompt 文档                 |
| `/upgrade`       | `anws update` 后做升级编排 | 判断 Minor / Major，并路由到 `/change` 或 `/genesis` |


---

## 宪法 (The Constitution)

1. **版本即法律**: 不"修补"架构文档，只"演进"。变更必须创建新版本。
2. **显式上下文**: 决策写入 ADR，不留在"聊天记忆"里。
3. **交叉验证**: 编码前对照 `05A_TASKS.md` 与 `05B_VERIFICATION_PLAN.md`。我在做计划好的事吗？
4. **美学**: 文档应该是美的。善用 Markdown 与清晰的层次结构。

---

## 项目状态保留区

<!-- AUTO:BEGIN — 项目状态保留区（升级时唯一保留的部分，请勿手动修改区块边界） -->

## 当前状态

- **最近一次更新**: 2025 — 安全审查 + 功能修复 + Docker 支持（已推送 GitHub）
- **数据库迁移**: 字段已重命名 `encrypted_vision_api_key` → `vision_api_key`，`encrypted_diary_api_key` → `diary_api_key`，migration 已生成
- **部署方式**: Docker 多阶段构建（`node:22-alpine`），`docker-compose.yml` 含 MySQL 8.4 服务
- **测试状态**: 40 个单元测试全部通过（vitest），覆盖 OAuth、JWT、env、diaries.delete

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19, React Router v7, TanStack Query (via tRPC), Framer Motion, Tailwind CSS, shadcn/ui |
| 后端 | Hono (Node http adapter), tRPC v11, Drizzle ORM |
| 数据库 | MySQL |
| 认证 | Kimi OAuth 2.0 + JWT session (HS256, 30天有效期) |
| 打包 | Vite (前端) + tsx watch (后端) |

---

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器（前端 + 后端 concurrently）
npm run dev

# 类型检查
npm run check

# 数据库迁移生成
npm run db:generate

# 数据库迁移推送
npm run db:push

# Drizzle Studio（可视化数据库）
npm run db:studio
```

---

## 项目结构

```text
Night-Journal/
├── api/                    # Hono 后端
│   ├── boot.ts             # 路由注册入口（含 OAuth 端点 + tRPC）
│   ├── context.ts          # tRPC context（从 JWT cookie 解析用户）
│   ├── middleware.ts        # authedQuery / createRouter 工厂
│   ├── lib/
│   │   ├── env.ts          # 环境变量验证（始终强验证，dev 下用随机 fallback）
│   │   └── cookies.ts      # session cookie 配置
│   ├── kimi/
│   │   ├── auth.ts         # OAuth CSRF-safe initiate + callback handler
│   │   └── session.ts      # JWT sign/verify
│   ├── queries/            # Drizzle ORM 数据库查询
│   │   ├── entries/
│   │   ├── diaries/
│   │   ├── ai-settings/
│   │   └── users/
│   └── routers/            # tRPC 路由
│       ├── entries.ts
│       ├── diaries.ts      # 含 delete mutation
│       ├── aiSettings.ts   # API key 不暴露给前端
│       └── upload.ts       # TODO: OSS presigned URL
├── src/                    # React 前端
│   ├── pages/
│   │   ├── Home.tsx        # 今日碎片，接入 trpc.entries.create/list
│   │   ├── Diary.tsx       # 日记列表（infinite scroll）
│   │   ├── DiaryDetail.tsx # 日记详情（含真正的 delete）
│   │   ├── CalendarPage.tsx
│   │   ├── Settings.tsx    # AI 模型配置
│   │   └── Login.tsx       # 重定向到 /api/oauth/initiate
│   ├── components/
│   │   ├── Layout.tsx      # 主布局（含 BottomNav）
│   │   └── BottomNav.tsx   # 四个 tab: 记录/日记/日历/我的
│   ├── hooks/
│   │   └── useAuth.ts      # 全局认证状态
│   └── providers/
│       └── trpc.ts         # tRPC client 配置
├── db/
│   └── schema.ts           # Drizzle schema（users/entries/diaries/aiSettings）
├── contracts/
│   ├── constants.ts        # 路径常量 + OAuth/Session 配置
│   └── errors.ts           # 错误码
├── Dockerfile              # 多阶段构建：builder → runner (node:22-alpine)
├── docker-compose.yml      # app + mysql:8.4，含 healthcheck
└── .env.example            # 环境变量模板（含 Docker Compose 专用变量）
```

---

## 认证流程（已修复 CSRF）

```
用户点击"Sign in with Kimi"
  → GET /api/oauth/initiate
    → 生成 crypto.getRandomValues() nonce
    → 写入 httpOnly cookie: kimi_oauth_nonce (10 min TTL)
    → state = btoa(JSON.stringify({ redirectUri, nonce }))
    → 302 → Kimi 授权页
  → Kimi 回调 → GET /api/oauth/callback?code=...&state=...
    → 解码 state，提取 nonce
    → 对比 kimi_oauth_nonce cookie（不一致 → 400）
    → 删除 nonce cookie
    → 换 access_token → 拉用户信息 → upsertUser
    → 签发 JWT → 写入 kimi_sid cookie (30天)
    → 302 → /
```

---

## 关键 TODO（功能未完成）

1. **文件上传 OSS** — `api/routers/upload.ts` 返回 mock URL，需接入 Aliyun OSS / AWS S3 / MinIO
2. **AI 日记生成** — `diaries.generate` 和 `diaries.regenerate` 是 stub，需接入 LLM API
3. **API key 加密存储** — 当前明文存入 MySQL，建议生产环境用 AES-256-GCM + env 密钥加密
4. **图片碎片持久化** — Home 页图片上传路径未打通，依赖 TODO 1

---

## 数据库 Schema 要点

- `entries`: 用户碎片（text + 情绪），`hasImages` 标记是否有附件，`softDeletedAt` 软删除
- `entryAttachments`: 文件附件，`fileUrl` 为 OSS URL，`visionSummary` 为 AI 识别结果
- `diaries`: AI 生成日记，`generationStatus: pending/generated/failed`，`manuallyEdited` 防止覆盖手动编辑
- `diaryVersions`: 每次 regenerate 前快照
- `aiSettings`: 用户 AI 配置，`visionApiKey` / `diaryApiKey` 明文存储（见 TODO 3）

---

## 环境变量（必填）

```env
APP_ID=               # Kimi 应用 ID
APP_SECRET=           # Kimi 应用密钥（用于 JWT 签名，至少 32 位随机字符串）
DATABASE_URL=         # MySQL 连接串，例：mysql://user:pass@host:3306/db
KIMI_AUTH_URL=        # Kimi OAuth 服务地址（默认 https://kimi.moonshot.cn）
KIMI_OPEN_URL=        # Kimi Open API 地址（默认 https://api.moonshot.cn）
OWNER_UNION_ID=       # 管理员 union_id（可选，留空则无管理员）
PORT=                 # 监听端口（可选，默认 3000）
```

完整示例见 `.env.example`。`VITE_*` 变量已废弃，前端不使用 Vite 环境变量。

<!-- AUTO:END -->

---

> **状态自检**: 准备好了？提醒用户运行 `/quickstart` 开始吧。

