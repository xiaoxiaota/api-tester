.PHONY: dev build prod logs stop restart

# 开发模式（自动热重载）
dev:
	export NODE_ENV=development && \
	export DOCKER_BUILDKIT=0 && \
	export COMPOSE_DOCKER_CLI_BUILD=0 && \
	docker-compose up -d && \
	docker-compose logs -f api-tester

# 构建镜像
build:
	docker-compose build

# 生产模式
prod:
	export NODE_ENV=production && \
	docker-compose up -d

# 查看日志
logs:
	docker-compose logs -f api-tester

# 停止服务
stop:
	docker-compose down

# 重启服务
restart:
	docker-compose restart api-tester

# 调试模式（带更多输出）
debug:
	export NODE_ENV=development && \
	export DEBUG=express:* && \
	docker-compose up -d && \
	docker-compose logs -f	