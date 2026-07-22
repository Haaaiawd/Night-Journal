# Eval 工具链与难度验证

## eval 脚本

脚本在 skill 目录的 `scripts/` 下，复制到题目的 `eval/` 目录使用：

- `eval.ps1` — PowerShell 一键脚本（Windows）
- `eval.sh` — Bash 版（Linux/WSL）
- `eval.Dockerfile` — 题目环境 + opencode 的容器定义
- `parse_trace.py` — trace 分析脚本

## 用法

```powershell
# 跑 3 次，用 kimi k2p7，超时 1 小时
.\eval\eval.ps1 -ExamDir . -Model kimi-for-coding/k2p7 -Runs 3 -Timeout 3600

# 跑 3 次，用 deepseek v4
.\eval\eval.ps1 . opencode/deepseek-v4-flash-free 3 3600
```

## 流程

构建题目镜像 → 构建 eval 镜像（加装 opencode）→ 启动容器 →
opencode run 喂 instruction → agent 自由解题 → 执行 solve.sh（如有）→
跑 test.sh → 收集 reward → 销毁容器 → 汇总。

## 修 bug 类题目的 eval 适配

"修 bug"类题目（agent 直接编辑源文件）和"生成输出"类题目（agent 写
solve.sh 产出报告）的 eval 流程不同：

- **生成输出类**：agent 写 `/workspace/solution/solve.sh`，eval.ps1 执行
  它产出结果，再跑 test.sh 检查输出。
- **修 bug 类**：agent 直接编辑 `/app/` 下的源文件（如 sync.ts），不写
  solve.sh。eval.ps1 执行 solve.sh 时要容错——文件不存在就跳过，直接
  跑 test.sh 检查源文件状态。

eval.ps1 的 solve.sh 执行行已写成容错：
```bash
if [ -f /workspace/solution/solve.sh ]; then bash /workspace/solution/solve.sh;
else echo 'no solve.sh, agent may have edited source directly'; fi
```

## test.sh 注意事项

test.sh **不能用 `set -e`**——verify.ts 失败时需要继续写 reward.txt：
```bash
#!/bin/bash
cd /app
npx tsx verify.ts
RESULT=$?
if [ $RESULT -eq 0 ]; then
  echo "1" > /logs/verifier/reward.txt
else
  echo "0" > /logs/verifier/reward.txt
fi
exit 0
```

eval.Dockerfile 必须创建 `/logs/verifier/` 目录：
```dockerfile
RUN mkdir -p /workspace/solution /logs/verifier
```

## trace 分析

跑完 eval 后，`trace_runN.json` 是 agent 的完整 JSON 事件流（UTF-16 LE
编码，PowerShell 写的）。用 `scripts/parse_trace.py` 分析：

```bash
python eval/parse_trace.py
```

看 trace 时关注：
- agent 做了几个 edit？改了哪些文件？改了什么？
- agent 跑了 verify.ts 吗？跑了几次？
- agent 的 edit 是治标解法还是根因修复？
- agent 有没有跑 bash 命令自验？没跑就停了 = 行为问题不是题目难度问题

## 难度解读

- 多个模型都失败、oracle 答案能过 → 难度达标
- 多个模型轻松通过 → 太简单，加压或弃题
- 一个模型过、一个模型不过 → 中等难度，可报 L1
- 弱模型过、强模型也过 → 太简单，必须加压
- 弱模型不过、强模型过了（且用根因修复）→ L1 达标
- 弱模型不过、强模型也不过 → L2 候选，考虑用更强模型再验

**注意**：agent reward=0 不一定意味着题目难——可能是 agent 行为问题
（没跑 verify.ts 自验、edit 没保存）。分析 trace 确认 agent 的 edit
是否是正确修复。如果 agent 做了正确修复但 reward=0，是 eval 流程问题
不是题目难度问题。

## 跟官方 evals 的差距

官方 3 trail × 200 round = 600 次，我们跑 3-6 次。信号方向一致（都解不出
→ 难），但样本小，是**必要不充分**验证：过不了我们的验证说明一定太简单，
过了不代表一定难。

## 前提

本机已装 opencode 并 `/connect` 配好 provider。auth 文件在
`~/.local/share/opencode/auth.json`，脚本自动挂载进容器。
