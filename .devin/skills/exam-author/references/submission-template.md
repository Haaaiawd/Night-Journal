# 平台提交字段模板（人类手写为主）

本模板对应 Talents AI 作业提交页面的字段。你最终在企业 IDE 里自己写完后
手动打包，所以这里只给**手写框架**和**内容来源**，不生成可粘贴的完整文本。

## 提交页面字段映射

| 页面字段 | 内容来源 | 手写要求 |
|---|---|---|
| 题目标题 | `instruction.md` 第一行标题 | 手写，像人类起的名字 |
| 题目描述 | `instruction.md` 的背景 + 任务说明 | 手写自然语言 |
| 类别 | 题目领域（Web 开发 / 数据处理 / 安全等）| 手动下拉选择 |
| Prompt | `instruction.md` 全文 | 手写，可让 AI 辅助整理结构，但最终文字必须是人改的 |
| 环境搭建 | `environment/Dockerfile` | 手写/手改，工程代码 |
| 测试搭建 | `tests/test.sh` | 手写/手改，工程代码 |
| 参考解答搭建 | `solution/solve.sh` | 手写**逻辑骨架**，代码由你手敲或确认 |
| 运行描述 / 执行轨迹 | 见下文 Golden Command Trace | 手写排查思路 + 命令序列 |
| 难度等级 | L1–L3 自评 | 见 4b 验证结果 |
| 质检维度 | R1/R2/R3 自评 | 见下文章节 |

## 手写原则

### Prompt（instruction.md）

- 必须由人类手写最终文字，不能让 AI 生成后直接提交。
- AI 可以帮你梳结构、补遗漏，但你要自己改一遍，去掉 AI 味。
- 去 AI 味：删除填充短语、打破排比、变化句子长短、用具体文件名和报错原文。

### solve.sh（参考解答）

- 不要在 AI 对话里直接产出一版就丢进 zip。
- 正确的做法：AI 帮你写**逻辑清单** → 你进企业 IDE 自己写**代码实现**。
- 逻辑清单格式示例：
  ```
  1. 读取 /app/config.ts 里用户的 webhook URL
  2. 在 fetch 前校验 hostname 不指向私有/内部网络
  3. 覆盖 127.x、10.x、172.16-31.x、192.168.x、169.254.x、localhost、.internal
  4. 保留正常 webhook 功能，不影响外部 URL 发送
  5. 跑 verify.ts 自验
  ```
- 然后你自己写 solve.sh 里的 bash + sed/awk/here-doc 或 source 修改。

### 运行描述（Golden Command Trace）

这是平台要求单独填的字段，必须两层：

**排查思路**（手写第一人称）：
```
1. 先看 instruction 里说的“安全和性能问题”，但代码里 normalizeWebhookUrl、
   sanitizePayload、checkRateLimit 已经都有了——不是这些。
2. 重点看 URL 校验：代码校验了格式和协议，但没校验目标地址指向哪里。
3. 服务在云上，用户能把 webhook URL 写成 127.0.0.1 或 169.254.169.254，
   这就成了 SSRF。需要在 fetch 前加 hostname 私有网络校验。
4. 验证：用 verify.ts 的 mock 内网服务测试，确认被阻断。
```

**命令序列**（与 solve.sh 一致）：
```
$ cd /app
$ cat sender.ts                          # 确认当前代码
# ... 修改 sender.ts 加入 isPrivateHost 校验 ...
$ npx tsx verify.ts                      # 验证 reward=1
```

## 质检维度自评

### R1 领域熟练

- 题目场景是否体现真实领域知识（不是玩具题）
- SSRF 题：是否模拟了云元数据端点、私有网络、webhook 服务真实场景
- 日志题：日志格式是否真实，分析目标是否反映真实运维需求

### R2 代码熟练

- solve.sh / test.sh / Dockerfile 是否专业、无低级错误
- 依赖是否匹配、无冗余
- 是否用标准工具而非炫技

### R3 合成风险

- **高压线**：prompt/instruction 是否手写
- 代码/数据是否真实脱敏
- 是否用模型生成后不大改

自评写法示例：
```
R1: 场景基于真实 webhook 服务配置问题，模拟云内网访问风险
R2: 代码使用标准 Node.js + Docker，依赖精简，无冗余
R3: instruction 由出题人手写，案例基于真实脱敏问题；solve.sh 逻辑由出题人
     设计，代码在企业 IDE 中人工实现
```

## 风险报告

如果题目涉及 SSRF、网络请求、敏感配置等，提交时需要在风险报告里说明：

- 该漏洞是**沙箱内模拟的 SSRF 端点**，用于测试 agent 安全审查能力
- 代码不会访问真实内网服务，verify.ts 仅使用 127.0.0.1 的 mock 服务
- 参考解法明确拒绝所有私有/内部网络地址
- 题目设计目的：训练 agent 识别