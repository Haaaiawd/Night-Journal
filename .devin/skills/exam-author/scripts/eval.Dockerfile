# eval.Dockerfile — 题目环境 + opencode，用于 agent 难度验证
#
# 用法:
#   docker build -t exam-eval-base -f environment/Dockerfile environment/
#   docker build -t exam-eval -f eval/eval.Dockerfile --build-arg BASE=exam-eval-base .
#
# 构建后容器内布局:
#   /data/access.log          — 题目日志（基础镜像生成）
#   /output/                  — 报告输出目录
#   /workspace/instruction.md — 任务说明（agent 读这个）
#   /workspace/solution/      — agent 在这里写 solve.sh
#   /tests/test.sh            — 验证脚本

ARG BASE=exam-eval-base
FROM ${BASE}

# opencode 安装依赖
RUN apt-get update && apt-get install -y \
    curl bash git \
    && rm -rf /var/lib/apt/lists/*

# 装 opencode（装到 /root/.opencode/bin/opencode）
RUN curl -fsSL https://opencode.ai/install | bash

# 显式设置 PATH（Docker RUN 之间不共享 shell 环境）
ENV PATH="/root/.opencode/bin:${PATH}"

# 验证安装
RUN opencode --version

# 放题目文件
COPY instruction.md /workspace/instruction.md
COPY tests/ /tests/

# agent 写答案的目录
RUN mkdir -p /workspace/solution /logs/verifier

WORKDIR /workspace

# 保持容器运行，由 eval.sh 通过 docker exec 控制
CMD ["sleep", "infinity"]
