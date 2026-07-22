---
name: exam-author
description: >-
  Terminal Bench 2.0 / General Coding 出题任务的提交流程规范。覆盖 ZIP 结构、
  Dockerfile + solve.sh + test.sh 编写、依赖匹配校验、风险命令扫描、提交前
  checklist 和本地 docker 验证闭环。当用户提到"出题"、"terminal bench"、
  "general coding"、"Env Zero"、"exam_001"、"solve.sh"、"提交 zip"、"reward=1"、
  "harbor 框架"、"oracle 测试"、"难题种子卡"、"problem_seed"、"难度自测"、
  "加压"、"治标解法"、"多 bug 合并"、"SSRF"、"guard 时机"、"红鲱鱼"、
  "混淆式包装"、"校验结果吞掉"、"console.warn 不 throw"、"混淆等级"、
  "L3 混淆"、"显性 bug 隐藏真 bug"、
  或在 exam 类目录下要编写/验证/打包提交物时，立即使用本 skill。它是出题
  流水线的交付端，消费发现端产出的难题种子卡构造四件套并验证难度。即使用户
  只是说"帮我看看这个题能不能提交"、"走一遍流程"、"打包一下"、"把这张种子卡
  做成题"，只要上下文是 terminal bench 出题，也应触发。
---

# Terminal Bench 出题提交流程（交付端）

本 skill 是出题流水线的**交付端**。它把一道难题构造成符合规范的提交物，
在虚拟环境里验证、自测难度、打包提交。完整流程拆成五个阶段：
**读题 → 规划 → 实现 → 验证 → 打包**。每阶段都有必须过的检查点，跳过
任何一个都可能导致 reward≠1、被判定环境不完整、或触发平台风控。照着走，
不会出错。

## 出题流水线定位

出题分两段，本 skill 负责第二段：

- **发现端**（`seed-harvester` skill）：在真实项目里把一个真实问题
  沉淀成**难题种子卡** `problem_seed.md`。
- **交付端（本 skill）**：消费种子卡 → 构造四件套 → 虚拟环境验证 → 难度自测
  → 打包提交。

如果手头有 `problem_seed.md`，先读"输入：消费难题种子卡"一节，把种子卡映射
成四件套再进入五阶段流程。如果是直接拿到一个已有题包（如 exam_001），
跳过种子卡，直接从"读题阶段"开始。

## 输入：消费难题种子卡

### 从索引抓取待处理种子卡

用 harvester skill 的 CLI 抓取 pending 状态的种子卡：

```bash
talent list --status pending
```

拿到种子卡路径后，读取 `problem_seed.md`，按下表映射构造四件套。

### 种子卡与题目的映射

种子卡和题目不是 1:1。可以：
- **单卡成题**：一张种子卡 → 一道题
- **多卡融合**：多张种子卡 → 一道题（bug 1 当幌子，bug 2 是真 bug）

做完题后用 CLI 记录映射：
```bash
talent link <seedName> <examDir>
talent update <seedName> --status submitted
```

### 字段映射

种子卡的每个字段都对应四件套的一块原料，按下表映射构造：

| 种子卡字段 | 构造目标 |
|---|---|
| 场景标题 + 摘要 | `instruction.md` 标题与开头 |
| 真实背景（脱敏） | `instruction.md` 任务描述 |
| 问题现象 | `instruction.md` 故障设定 |
| 根因链 | `environment/` 如何复现该故障 |
| 复现环境要素 | `Dockerfile` + 初始化脚本（依赖、配置、预置故障状态）|
| AI 卡点分析 | 指导 `tests/` 设计——专门卡住 naive 解法 |
| 期望最终状态 | `tests/` 的 reward=1 判定条件 |
| 参考解法 | `solution/solve.sh` 的参考 |

映射时守住封闭式原则：种子卡的"期望最终状态"必须能翻译成二元、可自动判定的
验收（解决 or 未解决）。如果种子卡里这一项模糊，回到发现端补清楚，别硬造。

## 0. 核心约束（先记住，贯穿全程）

这些是平台的硬规则，违反任意一条都会影响结算甚至封禁：

- **封闭式题目**：Agent 操作结果只有"解决 / 未解决"两种，reward 必须是 0 或 1。
  test.sh 最终把 `1` 或 `0` 写入 `/logs/verifier/reward.txt`。
- **solve.sh 必须是 Bash 脚本**，开头 `#!/bin/bash`。它可以拉起其他语言脚本
  （python 等），但入口必须是 bash。
- **Dockerfile 必须本地构建测试通过**，且与 solve.sh 实际用到的工具完全匹配——
  solve.sh 用了 awk，Dockerfile 就得装 gawk；solve.sh 没用 python，就别装 python。
- **禁止冗余依赖**：不为"可能用到"装一堆包。装了不用 = 冗余安装 = 风险信号。
- **禁止风险命令**：solve.sh 和 Dockerfile 内不出现 `rm -rf`（除 apt 清缓存外）、
  `curl/wget` 拉外部资源（test.sh 按需除外）、`sudo/chmod 777`、通配符写入等。
- **文件名全小写英文字母**。唯一例外是 `Dockerfile`——Docker 构建引擎强制首字母
  大写 D，改成 `dockerfile` 会导致 `docker build` 找不到文件，保持 `Dockerfile` 不变。
- **禁止合成数据**：prompt/instruction 必须手写，上传的代码/数据必须真实脱敏。
  用模型生成后不大改 = 风险数据 = 封禁。

## 1. 读题阶段

动手前把任务包里所有文件读一遍，建立完整地图。不要跳读。

**必读文件**（按优先级）：

1. `instruction.md` — 任务描述、输入格式、要求、输出格式。这是契约。
2. `environment/Dockerfile` — 基础镜像、已装依赖、预置数据、WORKDIR。
3. `tests/test.sh` — 验收脚本，决定 reward。**这是你真正要满足的对象**。
4. `tests/test_outputs.py`（如有）— Python 验收逻辑，补充 test.sh。
5. `task.toml`（如有）— timeout、难度、标签等元信息。

**读题时要确认的事**：

- 输入数据在哪、什么格式（`/data/access.log`？挂载？Dockerfile 生成？）
- 输出要写到哪、什么格式（逐字对照 instruction 的输出示例）
- test.sh 用什么方式校验（`grep -q`？pytest？selenium？）——校验方式决定你
  输出的容错空间。`grep -q` 只查子串存在性，格式细微差异不影响；pytest 断言
  则要求精确匹配。
- Dockerfile 装了哪些工具，没装哪些——这直接决定 solve.sh 能用什么。
- 有没有预置的故障/陷阱（残留进程、错误配置、端口占用）需要 Agent 先清理。

**输出**：一份现状分析——任务本质复杂度、预期输出、可用工具集、test 检查点列表。

## 2. 规划阶段

好计划不留模糊地带。这里要把"照着做就不会出错"的粒度敲定。

**必须完成的推演**：

1. **预计算预期输出**：对着 Dockerfile 里的样本数据，手算/推演 solve.sh 应该
   产出什么。比如日志分析就数清楚每个 IP 出现几次、每个状态码几次。这一步
   能在验证阶段立刻发现脚本逻辑错误。

2. **依赖审计**：列出 solve.sh 计划用到的每个工具，逐个对照 Dockerfile 是否
   已装。表格化：
   ```
   工具    | solve.sh 用途      | Dockerfile 来源
   awk     | 列提取             | gawk（已装）
   sort    | 排序               | coreutils（已装）
   python  | 数据处理           | 未装 → 要么不用，要么改 Dockerfile
   ```
   如果需要新工具，改 Dockerfile 装上——但要确认是真的需要，不是"可能用到"。

3. **风险命令扫描**：把计划写的每条命令过一遍（见下方 checklist），有风险的
   换方案或加防护。

4. **输出格式对齐**：把 instruction 的输出示例和 solve.sh 的 echo 语句逐行
   比对，包括空行、冒号后空格、大小写。

**判断点**：solve.sh 要不要拉起其他脚本？
- 任务纯文本处理、几十行 awk/sort 能搞定 → **单 solve.sh 就够**，不要硬塞
  python 脚本。为"结构完整"加用不上的文件，就是偶然复杂度。
- 任务确实需要复杂数据处理（JSON 解析、Excel 操作、多步转换）→ solve.sh 做
  入口，拉起 `solution/` 下的辅助脚本，Dockerfile 装对应依赖。

## 3. 实现阶段

按规划生成代码。克制即兴发挥。

**核心原则**：自然语言文本（instruction、排查思路）必须**手写**，工程代码
（solve.sh / test.sh / Dockerfile）由你写。AI 可以帮你整理逻辑清单、检查风险，
但**最终提交物必须是你自己进 IDE 写或确认的**。

### solve.sh 编写规则

- 第一行 `#!/bin/bash`
- 加 `set -e`，出错即停，避免写半截报告
- 变量引用加引号：`"$LOG"` 而不是 `$LOG`，防路径含空格
- 文件头注释说清：核心逻辑、依赖、输入输出、边界场景、测试覆盖
- 输出写入用固定路径变量 `> "$OUT"`，不要 `> /output/*` 通配符
- `mkdir -p` 确保输出目录存在
- **尤其注意**：修 bug 类题目中，solve.sh 往往用 `sed`、`cat << 'EOF'` 等
  方式修改源文件。不要直接让 AI 生成一版完整代码就提交。正确做法是：
  1. AI 给你**逻辑清单**（改哪、为什么、怎么验证）
  2. 你进 IDE 自己写**代码实现**
  3. 在本地跑 oracle 验证通过后再进 zip

### Dockerfile 修改规则

- 只在 solve.sh 确实需要新工具时才改
- 装包用 `apt-get install -y` + 末尾 `rm -rf /var/lib/apt/lists/*` 清缓存
  （这是 Dockerfile 标配，不算风险命令）
- 不固定版本除非有兼容性要求（`python3` 而不是 `python3.11.7`）
- 改完必须重新 `docker build` 验证

### Windows 编写时的坑

在 Windows 上创建的 .sh 文件默认 CRLF 行尾，进 Linux 容器会报 `bad interpreter`
或命令解析错误。**提交前必须转成 LF**：

```powershell
# PowerShell 转 LF
$path = "path\to\solve.sh"
$content = [System.IO.File]::ReadAllText($path)
$content = $content -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))
```

或者用 Git Bash / WSL 创建文件，天然 LF。

## 4. 验证阶段

信任，但要验证。**不在容器里跑通就不算完成。**

### 验证步骤（必须全过）

```bash
# 1. 构建镜像
cd environment
docker build -t <imagename> .

# 2. 运行 solve.sh + 查看 output + 跑 test.sh
docker run --rm \
  -v "<host>/solution:/solution:ro" \
  -v "<host>/tests:/tests:ro" \
  <imagename> \
  bash -c "bash /solution/solve.sh && echo '--- output ---' && cat /output/report.txt && echo '--- test ---' && bash /tests/test.sh"
```

### 验证检查清单

- [ ] `docker build` 成功，无报错
- [ ] solve.sh 执行无报错
- [ ] 输出文件存在于 instruction 指定路径
- [ ] 输出内容与 instruction 格式逐字对齐（包括空行）
- [ ] 输出数值与预计算一致
- [ ] test.sh 输出 `Score: N / N` 或 reward=1
- [ ] 如果 test.sh 有多个检查点，全部 PASS

### 常见失败排查

| 现象 | 可能原因 |
|---|---|
| `bad interpreter: /bin/bash^M` | CRLF 行尾，转 LF |
| `command not found: awk` | Dockerfile 没装对应工具 |
| test.sh grep 通过但 reward=0 | test.sh 逻辑与预期不符，重读 test.sh |
| solve.sh 本地能跑容器里不行 | 依赖了宿主机工具，容器内没有 |
| `set -e` 中途退出 | 某条命令非零退出（如 `grep` 无匹配返回 1），加 `\|\| true` |

## 4a. 加压循环——从"太简单"到"够难"的迭代过程

初版题目几乎总是太简单。agent 会找到各种治标解法绕过你设计的卡点。你需要
一个迭代循环：**造题 → 自测 → 发现治标解法 → 加压 → 再测**，直到治标解法
全部被卡住。

**加压有两种主轴**：
1. **加 test 条件**——封堵治标解法（适用于"修 bug"类题目）
2. **提升混淆等级**——让 bug 看起来不像 bug（适用于"缺防护"类题目）

两种主轴可以组合使用。详细指南见 `references/pressurize.md`，包含：
- 加压循环标准流程（9 步）
- guard 时机题的 3 轮加压实战案例
- 治标解法封堵策略表（入口清空 / 只修失败路径 / 调用方兜底 / 加 timeout / 加白名单）
- 多 bug 幌子策略（bug 1 明显当幌子，bug 2 隐蔽是真 bug）
- 心理学包装（满足陷阱 / 权威暗示 / 注意力预算耗尽 / 框架效应 / 确认偏误）
- **混淆式包装**（校验结果静默吞掉 / 混淆等级 L0-L4 / agent trace 分析）
- 种子卡类型与加压策略速查表
- 题目命名规范

核心原则：test 要检查**系统状态**，不是表层输出。每加一个 test 条件，
都要先确认参考解法能过、治标解法过不了。混淆升级时 test 可以不变，
变的是 environment/ 里源码的混淆程度。

## 4a+. 题目包装与交付

题目包装是难度的核心组成部分。同样一个 SSRF 缺口，包装不好 agent 一眼
看穿，包装好 agent 视而不见。

**包装与交付规范见 `references/packaging-and-delivery.md`**，包含：
- 如何从源码中移除提示性注释
- 如何增加"已完成"信号密度（红鲱鱼函数）
- 如何在 instruction 中使用框架效应
- 测试失败输出如何用一句话锁定 bug
- `solve.sh` 必须同时包含**逻辑说明**和**完整代码**
- 代码去提示化 checklist

**记住**：自然语言文本（instruction、排查思路、逻辑说明）必须手写，
工程代码（solve.sh / test.sh / Dockerfile）由你进企业 IDE 写或确认。

## 4b. 虚拟交付环境模拟 + 难度自测

平台收题后会在 Harbor 框架下做 oracle 验证（参考答案要 reward=1）+ 3 trail
× 200 round 的 Agent evals 评难度。你在本地要先把这两件事都模拟一遍，否则
大概率被打回。

### 模拟一：oracle 验证（参考答案必须通过）

这就是上面验证阶段做的事——在虚拟环境（docker 容器）里跑 `solve.sh` 再跑
`test.sh`，确认 reward=1。**这是提交的硬门槛**：如果你的参考答案都过不了自己
的 test，说明环境或 test 有缺陷，必须修到通过。

### 模拟二：难度验证（题目要够难）

题目难度直接绑定结算（L1=600 / L2=700 / L3=800）。难度过低不予结算。平台用
3 trail × 200 round 的 Agent evals 评难度，本质是**让不知道答案的 agent 实跑，
看它解不解得出来**。你在本地要尽量逼近这个标准。

难度验证的可信度有梯度，从强到弱：

1. **金标准：opencode 多模型实跑**——用 opencode 非交互模式跑多个不同模型，
   每个模型独立解题，只给 instruction + 环境，绝不给 solution。工具链和
   详细用法见 `references/eval-guide.md`，脚本在 `scripts/` 目录下。

2. **辅助：独立 subagent 实跑**——run_subagent 起独立 agent 近似。局限大：
   共享同一模型底座，多样性不足，结论偏乐观。用途：快速排雷。

3. **兜底：naive 解法自测**——根据种子卡的"AI 卡点分析"，自己写出 naive AI
   最可能产出的错误解法，跑一遍确认它拿不到 reward=1。局限明显：你出题时
   就知道坑在哪，扮演的"naive"是假 naive。用途：快速自检 test 有没有卡住
   要害。

### 想要难度，从这些维度加压（对应卡点类型）

- 让环境有需要先排查才能发现的隐藏故障（残留进程、错误配置）
- 让正确解法依赖非显然的执行顺序
- 让 test 检查"真正解决"的系统状态，而非表层输出（查进程/端口/HTTP 响应，
  而非只 grep 一个字符串）
- 制造"症状治标会失败"的结构——只处理表层报错的解法过不了 test
- 设置"危险操作陷阱"——naive 解法容易触发不可逆操作而毁掉环境

**但守住封闭式**：再难也必须是二元可判定。难度来自"解出来很难"，不是
"判定标准模糊"。test 永远只输出 0 或 1。

### 验证检查清单

```
[ ] 参考答案 solve.sh 在容器里跑通，reward=1（oracle 通过，硬门槛）
[ ] 至少用 opencode 多模型实跑确认题目不简单（金标准 > subagent 排雷 > naive 自测）
[ ] 验证时只给 instruction + 环境，绝不泄露 solution
[ ] test 检查的是系统状态/真实结果，不是容易蒙对的表层字符串
[ ] 难度来自问题本身，判定标准依然是封闭式二元结果
[ ] 如果用了 opencode eval，检查 trace_runN.json 确认 agent 失败原因跟设计的卡点一致
```

## 5. 打包阶段

本阶段说明 ZIP 结构，**实际打包在你企业 IDE 里完成**，AI 不替你执行压缩。

### ZIP 结构

你最终手动打包的 zip 解压后必须是这个结构（根目录为 `exam_001/` 或对应题号）：

```
exam_001/
├── environment/
│   └── Dockerfile          # 你在 IDE 里修改过的环境文件
├── instruction.md          # 你在 IDE 里手写的任务说明
├── solution/
│   └── solve.sh            # 你在 IDE 里写的答案（+ 可选辅助脚本）
└── tests/
    └── test.sh             # 你在 IDE 里写的验收脚本（+ 可选 test_outputs.py）
```

### 打包前确认

1. **剔除无关文件**：`.DS_Store`、`task.toml`、`.devin/`、`__pycache__`、
   临时文件都不要进 zip。它们不影响评分但显得不专业，且 `.devin/` 可能泄露
   本地配置。
2. **文件名全小写**：`solve.sh`、`test.sh`、`instruction.md` ✓；
   `Dockerfile` 保持大写 D（Docker 强制约定）。
3. **solution/ 内放了你修改的文件**：solve.sh（+ 辅助脚本如有）
4. **environment/ 内放了你修改的文件**：Dockerfile（+ 其他环境文件如有）

### 提交物准备流程

在企业 IDE 里按这个顺序做：

1. 在 IDE 里创建/修改 `environment/Dockerfile`、`solution/solve.sh`、
   `tests/test.sh`、`instruction.md`
2. 在本地 docker 环境跑 `docker build` + `solve.sh` + `test.sh` 验证 reward=1
3. 在 IDE 里把文件整理成上述 ZIP 结构
4. 你**自己**手动压缩成 zip 上传平台

### 平台提交字段

平台提交页面除了上传四件套文件，还有几个字段要手写。详见
`references/submission-template.md`。

### 提交后更新索引

题目上传平台后，用 `talent` CLI 更新种子卡状态和映射：

```bash
# 标记种子卡已被用于某题
talent link <seedName> <examDir>

# 多卡融合的题，每张卡都要 link
# talent link <seedName2> <examDir>

# 更新状态为已提交
talent update <seedName> --status submitted
```

示例：
```bash
talent link ssrf-webhook ssrf-webhook
talent update ssrf-webhook --status submitted
```

确认：
```bash
talent stats   # 应该显示题目→种子卡映射，状态为 submitted
```

## 6. 平台提交字段对标

题目最终提交到 Talents AI 作业页面，那里除了上传四件套文件，还有几个**页面
专属字段**要填。成题完成后，顺手把这些备齐，到时候直接粘贴。

### 字段映射表

| 页面输入框 | 内容来源 | 说明 |
|---|---|---|
| 题目标题 + 描述 | `instruction.md` 标题与摘要 | 直接取 |
| 类别下拉（如 A.4 Web 开发）| 按题目领域选 | 日志/文本处理≈终端类 |
| Prompt | `instruction.md` 全文 | 直接粘 |
| 环境搭建 | `environment/Dockerfile`（+ 其他环境文件）| 上传 |
| 测试搭建 | `tests/test.sh`（+ `test_outputs.py`/`filter.py`）| 上传 |
| 参考解答搭建 | `solution/solve.sh`（+ 辅助脚本）| 上传 |
| 运行描述 / 执行轨迹 | **需新写**：Golden Command Trace | 见下 |
| 难度等级自评 | **需评估**：L0–L4 | 见下 |
| 质检维度 | **需自评**：R1/R2/R3 | 见下 |

### 运行描述（Golden Command Trace）

官方 Part2 要求记录"从打开终端到完成任务的完整 shell 命令序列 + 排查思路"。
所以这个框要写两层：

1. **排查思路**：作为专家，你怎么定位问题、怎么判断根因、为什么选这条解法路径。
   这是体现题目深度的地方——把发现端种子卡的"根因链"和"AI 卡点分析"翻译成
   人类专家的思考过程。
2. **命令序列**：从打开终端到 reward=1 的完整命令轨迹，与 `solve.sh` 一致。

写法示例：
```
## 排查思路
1. 先看 X 的报错，怀疑是 Y，用 <命令> 确认
2. 发现根因是 Z（解释为什么 naive 做法会漏掉这里）
3. 因此正确解法需要先 ... 再 ...

## 命令序列
$ <cmd1>   # 干什么
$ <cmd2>   # 干什么
...
```

### 难度等级自评

对照结算规则给出你的预估（最终以平台 evals 为准）：

- **L1**：打败国内大部分基座模型
- **L2**：打败国内 + 国外大部分基座模型
- **L3**：打败最新版本所有基座模型

自评依据 = 难度验证结果（见 4b）。如果连本地 naive 自测都过不了，别报高；
如果用独立 agent / 多模型实跑大面积失败，才有底气报 L2/L3。诚实自评，
虚报会被 evals 打回。

### 质检维度（R1/R2/R3）

平台质检会看这三维，提交前自查：

- **R1 领域熟练**：题目场景是否体现真实领域知识，不是玩具题
- **R2 代码熟练**：solve/test/环境代码是否专业、无低级错误
- **R3 合成风险**：是否手写、表述真实、非模型批量生成。**这是高压线**——
  prompt/instruction 必须手写，数据真实脱敏，模型生成后不大改会被判风险数据。

### 平台对标自检清单

```
[ ] 标题/描述/Prompt 已从 instruction.md 备好
[ ] 三个文件框（环境/测试/参考解答）的文件已就位
[ ] 运行描述写了排查思路 + 命令序列两层
[ ] 难度自评有依据（对应 4b 验证结果），不虚报
[ ] R3 合成风险自查：instruction 手写、数据真实脱敏
```

## 7. 自然语言文本的人类手写要求

平台明令：prompt / instruction 等给人读的文字必须**人类手写**，AI 生成痕迹
高的直接判合成风险、不予结算。所以以下文本必须读起来像人手打的：
`instruction.md` 的描述、运行描述/排查思路、种子卡里给人读的字段。

**注意边界**：这条**只管自然语言文本**。`solve.sh`/`test.sh`/`Dockerfile`
是工程代码，本就该规范、该有标准注释，不在"去 AI 味"范围内。

去 AI 味原则清单：

```
[ ] 删除填充短语——去掉"值得注意的是""综上所述""接下来让我们"等开场和强调拐杖
[ ] 打破公式结构——不堆排比，不用"不仅…而且…""首先…其次…最后…"，两项优于三项
[ ] 变化节奏——句子长短交错，一句话能说完就说完，别都是工整长句
[ ] 信任读者——直接陈述事实，跳过软化、辩解和手把手引导
[ ] 删除金句——读起来像可引用的格言，就重写
[ ] 少破折号——破折号是 AI 高频标志，改用逗号或分句
[ ] 具体 > 泛泛——写真实文件名、报错原文、具体操作，别抽象描述
[ ] 第一人称叙事——运行描述是排查过程，"先看了…怀疑是…"
[ ] 写完读一遍——读着像同事随手写的，像 AI 报告就重写
```

## 附：检查清单速查

### 依赖匹配检查

```
[ ] solve.sh 用到的每个工具，Dockerfile 都已安装
[ ] Dockerfile 装的每个工具，solve.sh 都用到了（或 test.sh 用到）
[ ] 没有为"可能用到"装冗余包
[ ] 没有在 solve.sh 用 Dockerfile 没装的解释器（python/node 等）
```

### 风险命令检查

```
[ ] 无 rm -rf（Dockerfile 内 apt 清缓存除外）
[ ] 无 curl/wget 拉外部资源（test.sh 按需除外）
[ ] 无 sudo / chmod 777 / chown
[ ] 无通配符写入（> /output/* 之类）
[ ] 无 eval / exec 动态命令执行
[ ] 无从外部读取的环境变量注入到命令中
[ ] 写入路径固定，指向 instruction 指定位置
```

### 提交前最终确认

```
[ ] solve.sh 首行 #!/bin/bash
[ ] solve.sh 有 set -e
[ ] 文件名全小写（Dockerfile 除外）
[ ] docker build 成功
[ ] 容器内 solve.sh + test.sh 跑通，reward=1
[ ] zip 内无 .DS_Store / task.toml / .devin 等杂物
[ ] zip 结构与要求一致
[ ] instruction.md 未被模型生成后不大改（反风控）
```
