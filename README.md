# Night-Journal 夜间日记

一个用 Kimi OAuth 登录的移动端日记 app。记录每日碎片，AI 生成日记。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19, React Router v7, TanStack Query, Framer Motion, Tailwind CSS, shadcn/ui |
| 后端 | Hono, tRPC v11, Drizzle ORM |
| 数据库 | MySQL |
| 认证 | Kimi OAuth 2.0 + JWT (HS256, 30天) |
| 打包 | Vite + tsx |

## 快速开始

```bash
# 安装依赖
npm install

# 复制并填写环境变量
cp .env.example .env

# 推送数据库 schema
npm run db:push

# 启动开发服务器
npm run dev
```

## 环境变量

```env
APP_ID=               # Kimi 应用 ID
APP_SECRET=           # Kimi 应用密钥
DATABASE_URL=         # MySQL 连接串
KIMI_AUTH_URL=        # Kimi OAuth 服务地址
KIMI_OPEN_URL=        # Kimi Open API 地址
```

## 开发命令

```bash
npm run dev          # 启动前后端
npm run check        # TypeScript 类型检查
npm test             # 运行测试
npm run db:generate  # 生成 migration
npm run db:push      # 推送 schema 到数据库
npm run db:studio    # Drizzle Studio 可视化
```

## 测试

```bash
npm test
```

40 个单元测试覆盖：OAuth CSRF 防护、JWT 签发/验证、env 验证逻辑、diaries.delete ownership 校验。

AI API key 连通性测试（需填入 `DEEPSEEK_API_KEY` 到 `.env.test`）：

```bash
# .env.test
DEEPSEEK_API_KEY=sk-...
```

## 功能现状

- [x] Kimi OAuth 2.0 登录（CSRF 防护）
- [x] 今日碎片记录（文字 + 情绪）
- [x] 日记列表 / 详情 / 删除
- [x] AI 设置（自定义模型 API Key）
- [ ] 图片上传（需接入 OSS）
- [ ] AI 日记生成（需接入 LLM API）
- [ ] API Key 加密存储

## 项目结构

详见 [AGENTS.md](./AGENTS.md)。
