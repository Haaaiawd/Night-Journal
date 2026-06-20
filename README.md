# Night-Journal 夜间日记

一个用 Kimi OAuth 登录的移动端日记 app。记录每日碎片，AI 生成日记。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19, React Router v7, TanStack Query, Framer Motion, Tailwind CSS, shadcn/ui |
| 后端 | Hono, tRPC v11, Drizzle ORM |
| 数据库 | MySQL 8.4 |
| 认证 | Kimi OAuth 2.0 + JWT (HS256, 30天) |
| 打包 | Vite + esbuild |

---

## Docker 部署（推荐）

### 前提

- Docker + Docker Compose
- Kimi 开放平台应用凭据（[platform.moonshot.cn](https://platform.moonshot.cn)）

### 步骤

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 填写必填项（APP_ID / APP_SECRET / KIMI_AUTH_URL / KIMI_OPEN_URL）
#    DATABASE_URL 在 Compose 里默认指向内置 MySQL，无需修改

# 3. 初次启动（构建镜像 + 启动 MySQL + 启动 app）
docker compose up -d --build

# 4. 推送数据库 schema（仅首次或 schema 变更后需要）
docker compose exec app node -e "
  const { drizzle } = await import('drizzle-orm/mysql2');
  // 使用 drizzle-kit push 推送 schema
"
# 或者本地执行（需要能访问到 MySQL）：
DATABASE_URL=mysql://nightjournal:nightjournal@localhost:3306/nightjournal npm run db:push

# 5. 查看日志
docker compose logs -f app
```

app 默认监听 `http://localhost:3000`，可通过 `PORT` 变量修改。

### 生产部署注意事项

- **不要**在 `docker-compose.yml` 里暴露 `3306` 端口，移除 `db.ports` 段或改用内部网络
- 建议在 app 前面加一层 nginx / Caddy 做 TLS 终止
- `APP_SECRET` 必须是足够随机的强密钥（至少 32 位），可用 `openssl rand -hex 32` 生成

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

详见 [.env.example](./.env.example)，必填项：

| 变量 | 说明 |
|---|---|
| `APP_ID` | Kimi 应用 ID |
| `APP_SECRET` | Kimi 应用密钥，同时用于 JWT 签名 |
| `DATABASE_URL` | MySQL 连接串 |
| `KIMI_AUTH_URL` | Kimi OAuth 服务地址 |
| `KIMI_OPEN_URL` | Kimi Open API 地址 |

---

## 测试

```bash
npm test
```

40 个单元测试覆盖：OAuth CSRF 防护、JWT 签发/验证、env 验证逻辑、diaries.delete ownership 校验。

AI API key 连通性测试（可选，需填入 `.env.test`）：

```bash
# .env.test
DEEPSEEK_API_KEY=sk-...
```

---

## 功能现状

- [x] Kimi OAuth 2.0 登录（CSRF 防护 + Open Redirect 防护）
- [x] 今日碎片记录（文字 + 情绪）
- [x] 日记列表 / 详情 / 删除
- [x] AI 设置（自定义模型 API Key）
- [x] Docker 多阶段构建
- [ ] 图片上传（需接入 OSS）
- [ ] AI 日记生成（需接入 LLM API）
- [ ] API Key 加密存储

## 项目结构

详见 [AGENTS.md](./AGENTS.md)。
