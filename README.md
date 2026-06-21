# Night-Journal 夜间日记

移动端私人日记 app。记录每日碎片，AI 生成日记。支持账号密码登录和 Kimi OAuth 登录。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19, React Router v7, TanStack Query, Framer Motion, Tailwind CSS, shadcn/ui |
| 后端 | Hono, tRPC v11, Drizzle ORM |
| 数据库 | MySQL 8.4 |
| 认证 | 账号密码（bcrypt）+ Kimi OAuth 2.0，统一 JWT session (HS256, 30天) |
| 打包 | Vite + esbuild |

---

## Docker 部署（推荐）

**`docker compose up` 即完成全部流程** — 镜像启动时自动运行数据库迁移，无需手动操作。

### 步骤

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 仅需填写两个必填项：
#      APP_SECRET  — JWT 签名密钥，至少 32 位随机字符串
#                    可用 openssl rand -hex 32 生成
#      DATABASE_URL — 留空则默认使用内置 MySQL，无需修改
#    Kimi OAuth 相关变量可选填，不填则只保留账号密码登录

# 3. 构建并启动
docker compose up -d --build

# 4. 查看日志（数据库迁移日志也在这里）
docker compose logs -f app
```

app 默认监听 `http://localhost:3000`，可通过 `.env` 里的 `PORT` 变量修改。

### 启动流程说明

```
docker compose up
  └─ db (MySQL 8.4) 健康检查通过
       └─ app 启动
            ├─ drizzle-kit migrate   ← 自动建表 / 跑增量迁移
            └─ node dist/boot.js     ← 启动 Hono 服务
```

### 生产部署注意事项

- `APP_SECRET` 必须是强随机密钥，可用 `openssl rand -hex 32` 生成
- 生产环境建议移除 `db.ports`（3306 不对外暴露），改用 Docker 内部网络
- 建议在 app 前面加一层 nginx / Caddy 做 TLS 终止

---

## 本地开发

```bash
# 安装依赖
npm install

# 复制并填写环境变量
cp .env.example .env

# 推送数据库 schema
npm run db:push

# 启动开发服务器（前端 HMR + 后端 hot-reload）
npm run dev
```

### 开发命令

```bash
npm run dev          # 启动前后端
npm run build        # 生产构建（输出到 dist/）
npm run check        # TypeScript 类型检查
npm test             # 运行测试
npm run db:generate  # 生成 migration SQL
npm run db:push      # 推送 schema 到数据库
npm run db:studio    # Drizzle Studio 可视化数据库
```

---

## 环境变量

详见 [.env.example](./.env.example)。

| 变量 | 必填 | 说明 |
|---|---|---|
| `APP_SECRET` | ✅ | JWT 签名密钥，至少 32 位随机字符串 |
| `DATABASE_URL` | ✅ | MySQL 连接串（Compose 内置 MySQL 时可用默认值） |
| `APP_ID` | 可选 | Kimi 应用 ID，仅 Kimi OAuth 登录时需要 |
| `KIMI_AUTH_URL` | 可选 | Kimi OAuth 服务地址 |
| `KIMI_OPEN_URL` | 可选 | Kimi Open API 地址 |
| `OWNER_UNION_ID` | 可选 | 管理员 union_id |
| `PORT` | 可选 | 监听端口，默认 3000 |
| `ENABLE_AUTO_GENERATION_IN_DEV` | 可选 | 设为 `true` 时在开发模式下启用自动日记生成调度器（生产环境默认启用） |

---

## 测试

```bash
npm test
```

50 个单元测试覆盖：账号密码注册/登录、OAuth CSRF 防护、JWT 签发/验证、env 验证逻辑、diaries.delete ownership 校验。

---

## 功能现状

- [x] 账号密码注册 / 登录（bcrypt, cost=12）
- [x] Kimi OAuth 2.0 登录（CSRF 防护 + Open Redirect 防护）
- [x] 今日碎片记录（文字 + 情绪）
- [x] 日记列表 / 详情 / 删除
- [x] AI 设置（自定义模型 API Key）
- [x] Docker 一键部署（自动迁移）
- [ ] 图片上传（需接入 OSS）
- [ ] AI 日记生成（需接入 LLM API）
- [ ] API Key 加密存储

## 项目结构

详见 [AGENTS.md](./AGENTS.md)。
