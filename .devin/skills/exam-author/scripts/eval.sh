#!/bin/bash
# eval.sh — Agent 难度验证一键脚本
#
# 用 opencode 非交互式跑题，期望 agent 解不出来。
#
# 用法:
#   ./eval.sh <题目目录> <provider/model> [跑几次] [超时秒数]
#
# 例:
#   ./eval.sh ./exam_001 kimi-for-coding/kimi-k2-thinking 1 3600
#   ./eval.sh . openai/gpt-5.4 2 3600
#
# 输出:
#   - 实时 agent 操作流（stdout）
#   - trace_runN.json（agent 完整 JSON 事件流，事后分析用）
#   - 最终汇总

set -uo pipefail

# === 参数 ===
EXAM_DIR="${1:-.}"
MODEL="${2:-kimi-for-coding/kimi-k2-thinking}"
RUNS="${3:-1}"
TIMEOUT="${4:-3600}"  # 默认 1 小时

# === 路径 ===
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_DOCKERFILE="$SCRIPT_DIR/eval.Dockerfile"
BASE_TAG="exam-eval-base"
EVAL_TAG="exam-eval"
AUTH_FILE="$HOME/.local/share/opencode/auth.json"

# === 汇总文件 ===
SUMMARY="$SCRIPT_DIR/eval_summary.txt"

echo "=== Agent 难度验证 ==="
echo "题目: $EXAM_DIR"
echo "模型: $MODEL"
echo "次数: $RUNS"
echo "超时: ${TIMEOUT}s ($(echo "scale=0; $TIMEOUT/60" | bc)min)"
echo ""

# === 检查 auth 文件 ===
if [ ! -f "$AUTH_FILE" ]; then
  echo "ERROR: opencode auth 文件不存在: $AUTH_FILE"
  echo "请先运行 opencode 并 /connect 配置 provider"
  exit 1
fi

# === 1. 构建题目基础镜像 ===
echo "[1/4] 构建题目基础镜像..."
docker build -t $BASE_TAG -f "$EXAM_DIR/environment/Dockerfile" "$EXAM_DIR/environment" || {
  echo "ERROR: 基础镜像构建失败"
  exit 1
}

# === 2. 构建 eval 镜像 ===
echo "[2/4] 构建 eval 镜像(题目 + opencode)..."
docker build -t $EVAL_TAG -f "$EVAL_DOCKERFILE" --build-arg BASE=$BASE_TAG "$EXAM_DIR" || {
  echo "ERROR: eval 镜像构建失败"
  exit 1
}

# === 3. 运行 ===
RESULTS=()
for i in $(seq 1 $RUNS); do
  echo ""
  echo "=== Run $i/$RUNS — model=$MODEL ==="

  # 启动一次性容器，挂载 auth
  CONTAINER=$(docker run -d --rm \
    -v "$AUTH_FILE:/root/.local/share/opencode/auth.json:ro" \
    $EVAL_TAG)

  echo "  容器: $CONTAINER"

  # 喂 instruction，让 agent 解题
  echo "  启动 agent..."
  START=$(date +%s)

  # opencode run 非交互模式：读 instruction，自由操作，完成后退出
  timeout $TIMEOUT docker exec $CONTAINER bash -c "
    cd /workspace && \
    opencode run \
      --model '$MODEL' \
      --dir /workspace \
      --dangerously-skip-permissions \
      --format json \
      \"\$(cat /workspace/instruction.md)\"
  " 2>&1 | tee "$SCRIPT_DIR/trace_run${i}.json"

  EXIT_CODE=$?
  END=$(date +%s)
  ELAPSED=$((END - START))

  if [ $EXIT_CODE -eq 124 ]; then
    echo "  结果: 超时(${ELAPSED}s)"
    RESULTS+=("timeout")
    docker kill $CONTAINER 2>/dev/null || true
    continue
  fi

  echo "  agent 完成，耗时 ${ELAPSED}s"

  # 执行 solve.sh（确保输出存在）
  echo "  执行 solve.sh..."
  docker exec $CONTAINER bash -c "bash /workspace/solution/solve.sh" 2>&1 || {
    echo "  WARNING: solve.sh 执行失败"
  }

  # 跑 test
  echo "  跑 test..."
  docker exec $CONTAINER bash /tests/test.sh 2>&1

  # 读 reward
  REWARD=$(docker exec $CONTAINER cat /logs/verifier/reward.txt 2>/dev/null || echo "N/A")
  echo "  reward=$REWARD"
  RESULTS+=("$REWARD")

  # 保存 agent 产出的 solve.sh（事后分析）
  docker cp "$CONTAINER:/workspace/solution/solve.sh" "$SCRIPT_DIR/agent_solve_run${i}.sh" 2>/dev/null || true

  # 清理
  docker kill $CONTAINER 2>/dev/null || true
done

# === 4. 汇总 ===
echo ""
echo "=== 汇总 ==="
echo "模型: $MODEL"
echo "次数: $RUNS"
echo "结果: ${RESULTS[*]}"

PASS=0
for r in "${RESULTS[@]}"; do
  if [ "$r" = "1.00" ]; then
    PASS=$((PASS + 1))
  fi
done
echo "通过: $PASS / $RUNS"
echo ""
echo "失败分析: 查看 trace_runN.json 和 agent_solve_runN.sh"

# 写汇总文件
{
  echo "时间: $(date)"
  echo "题目: $EXAM_DIR"
  echo "模型: $MODEL"
  echo "次数: $RUNS"
  echo "结果: ${RESULTS[*]}"
  echo "通过: $PASS / $RUNS"
} > "$SUMMARY"

echo "汇总已写入: $SUMMARY"
