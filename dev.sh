#!/bin/bash

# 开发模式启动脚本

echo "启动开发模式..."
echo "提示: 修改 public/ 目录下的文件会立即生效"
echo "提示: 修改 server.js 会通过 nodemon 自动重启"
echo ""

# 设置开发环境变量
export NODE_ENV=development
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0

# 停止现有容器
docker-compose down

# 启动开发模式
docker-compose up -d

# 显示日志
docker-compose logs -f api-tester