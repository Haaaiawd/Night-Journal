# eval.ps1 — Agent 难度验证一键脚本
#
# 用 opencode 非交互式跑题，期望 agent 解不出来。
#
# 用法:
#   .\eval.ps1 -ExamDir . -Model kimi-for-coding/kimi-k2-thinking -Runs 1 -Timeout 3600
#   .\eval.ps1 . openai/gpt-5.4 2 3600
#
# 输出:
#   - 实时 agent 操作流（stdout）
#   - trace_runN.json（agent 完整 JSON 事件流，事后分析用）
#   - agent_solve_runN.sh（agent 产出的 solve.sh）
#   - eval_summary.txt（汇总）

param(
    [Parameter(Position=0)]
    [string]$ExamDir = ".",

    [Parameter(Position=1)]
    [string]$Model = "kimi-for-coding/kimi-k2-thinking",

    [Parameter(Position=2)]
    [int]$Runs = 1,

    [Parameter(Position=3)]
    [int]$Timeout = 3600  # 默认 1 小时
)

$ErrorActionPreference = "Continue"

# === 路径 ===
$ScriptDir = if ($MyInvocation.MyCommand.Path) { Split-Path $MyInvocation.MyCommand.Path } else { $PWD }
$EvalDockerfile = Join-Path $ScriptDir "eval.Dockerfile"
$BaseTag = "exam-eval-base"
$EvalTag = "exam-eval"
$AuthFile = Join-Path $HOME ".local\share\opencode\auth.json"
$Summary = Join-Path $ScriptDir "eval_summary.txt"

Write-Host "=== Agent 难度验证 ==="
Write-Host "题目: $ExamDir"
Write-Host "模型: $Model"
Write-Host "次数: $Runs"
Write-Host "超时: ${Timeout}s ($([math]::Floor($Timeout / 60))min)"
Write-Host ""

# === 检查 auth 文件 ===
if (-not (Test-Path $AuthFile)) {
    Write-Host "ERROR: opencode auth 文件不存在: $AuthFile"
    Write-Host "请先运行 opencode 并 /connect 配置 provider"
    exit 1
}

# === 检查 eval.Dockerfile ===
if (-not (Test-Path $EvalDockerfile)) {
    Write-Host "ERROR: eval.Dockerfile 不存在: $EvalDockerfile"
    exit 1
}

# === 1. 构建题目基础镜像 ===
Write-Host "[1/4] 构建题目基础镜像..."
docker build -t $BaseTag -f "$ExamDir/environment/Dockerfile" "$ExamDir/environment"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: 基础镜像构建失败"
    exit 1
}

# === 2. 构建 eval 镜像 ===
Write-Host "[2/4] 构建 eval 镜像 (题目 + opencode)..."
docker build -t $EvalTag -f $EvalDockerfile --build-arg "BASE=$BaseTag" $ExamDir
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: eval 镜像构建失败"
    exit 1
}

# === 3. 运行 ===
$Results = @()
for ($i = 1; $i -le $Runs; $i++) {
    Write-Host ""
    Write-Host "=== Run $i/$Runs — model=$Model ==="

    # 清除上一轮积累的 ErrorRecord，防止 $Error 膨胀影响后续 cmdlet
    $Error.Clear()

    # 启动一次性容器，挂载 auth
    $Container = docker run -d --rm `
        -v "${AuthFile}:/root/.local/share/opencode/auth.json:ro" `
        $EvalTag
    # docker run -d 输出容器 ID，确保是干净的单行字符串（去除可能的 \r\n）
    $Container = (@($Container) | Select-Object -First 1).Trim()
    Write-Host "  容器: $Container"

    # 等待容器就绪（docker run -d 返回后容器可能还没完全启动）
    $Ready = $false
    for ($w = 0; $w -lt 10; $w++) {
        docker exec $Container echo ready 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $Ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $Ready) {
        Write-Host "  ERROR: 容器未就绪，跳过"
        $Results += "N/A"
        docker kill $Container 2>$null | Out-Null
        continue
    }
    Write-Host "  容器就绪"

    # 喂 instruction，让 agent 解题
    # 超时由容器内 timeout 命令处理，更可靠
    Write-Host "  启动 agent..."
    $Start = Get-Date

    $TraceFile = Join-Path $ScriptDir "trace_run${i}.json"

    # opencode run 非交互模式：读 instruction，自由操作，完成后退出
    # timeout 在容器内执行，超时杀进程
    # 用 pipe 传 instruction，避免引号嵌套被 PowerShell/docker 吃掉
    #
    # 关键：2>&1 必须放在 bash 内部，不能放在 PowerShell 层。
    # PowerShell 5.1 的 2>&1 会把 native command 的 stderr 每行转成 ErrorRecord
    # 对象，管道传给 Tee-Object 时会干扰管道行为、累积到 $Error 集合，
    # 多次循环后导致后续 docker exec / docker cp 异常。
    # 放在 bash 内部则 bash 自己合并 stderr→stdout，PowerShell 只看到纯字符串。
    $Cmd = "cat /workspace/instruction.md | timeout $Timeout opencode run --model '$Model' --dir /workspace --dangerously-skip-permissions --format json 2>&1"
    docker exec $Container bash -c $Cmd | Tee-Object -FilePath $TraceFile

    $ExitCode = $LASTEXITCODE
    $Elapsed = [math]::Floor(((Get-Date) - $Start).TotalSeconds)

    # timeout 命令退出码 124 = 超时
    if ($ExitCode -eq 124) {
        Write-Host "  结果: 超时 (${Elapsed}s)"
        $Results += "timeout"
        docker kill $Container 2>$null | Out-Null
        continue
    }

    Write-Host "  agent 完成 (exit=$ExitCode)，耗时 ${Elapsed}s"

    # 执行 solve.sh（如果存在——适用于"生成输出"类题目）
    # 对于"修 bug"类题目，agent 直接编辑源文件，不需要 solve.sh
    # 2>&1 放在 bash 内部，原因同上
    Write-Host "  执行 solve.sh（如果存在）..."
    docker exec $Container bash -c "if [ -f /workspace/solution/solve.sh ]; then bash /workspace/solution/solve.sh; else echo 'no solve.sh, agent may have edited source directly'; fi 2>&1"
    Write-Host "  solve.sh exit: $LASTEXITCODE"

    # 跑 test
    # 2>&1 放在 bash 内部，原因同上
    Write-Host "  跑 test..."
    docker exec $Container bash -c "bash /tests/test.sh 2>&1"
    $TestExit = $LASTEXITCODE
    Write-Host "  test.sh exit: $TestExit"

    # 检查容器是否还在运行（agent 操作可能意外导致容器停止）
    $ContainerState = docker inspect -f '{{.State.Running}}' $Container 2>$null
    Write-Host "  容器状态: $ContainerState"

    # 读 reward — 用 docker cp
    $TempReward = Join-Path $env:TEMP "reward_${i}.txt"
    # 清除可能的残留文件
    if (Test-Path $TempReward) { Remove-Item $TempReward -Force }
    Write-Host "  TempReward: $TempReward"
    Write-Host "  Container: $Container"

    # docker cp 的 2>&1 用来捕获错误信息，但不让它干扰管道
    $CpOutput = docker cp "${Container}:/logs/verifier/reward.txt" $TempReward 2>&1
    $CpExit = $LASTEXITCODE
    Write-Host "  docker cp exit: $CpExit"
    if ($CpOutput) { Write-Host "  docker cp output: $CpOutput" }

    if (Test-Path $TempReward) {
        $Reward = [string](Get-Content $TempReward -Raw).Trim()
        Remove-Item $TempReward -Force
        Write-Host "  reward from file: $Reward"
    } else {
        $Reward = "N/A"
        Write-Host "  reward file not found"
        # 诊断：在容器内查看 reward 文件是否存在
        Write-Host "  诊断: 检查容器内 /logs/verifier/ ..."
        docker exec $Container bash -c "ls -la /logs/verifier/ 2>&1; echo '---'; cat /logs/verifier/reward.txt 2>&1" 2>$null
    }
    Write-Host "  reward=$Reward"
    $Results += $Reward

    # 保存 agent 产出的 solve.sh（事后分析）
    $AgentSolve = Join-Path $ScriptDir "agent_solve_run${i}.sh"
    docker cp "${Container}:/workspace/solution/solve.sh" $AgentSolve 2>$null | Out-Null

    # 清理
    docker kill $Container 2>$null | Out-Null
}

# === 4. 汇总 ===
Write-Host ""
Write-Host "=== 汇总 ==="
Write-Host "模型: $Model"
Write-Host "次数: $Runs"
Write-Host "结果: $($Results -join '  ')"

$Pass = ($Results | Where-Object { $_ -eq "1" -or $_ -eq "1.00" }).Count
Write-Host "通过: $Pass / $Runs"
Write-Host ""
Write-Host "失败分析: 查看 trace_runN.json 和 agent_solve_runN.sh"

# 写汇总文件
$SummaryContent = @"
时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
题目: $ExamDir
模型: $Model
次数: $Runs
结果: $($Results -join '  ')
通过: $Pass / $Runs
"@
$SummaryContent | Out-File -FilePath $Summary -Encoding utf8
Write-Host "汇总已写入: $Summary"
