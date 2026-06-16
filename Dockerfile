FROM harbor1.shie.com.cn/library/node:18.20.4-slim

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm install --production
RUN npm install -g nodemon

# 复制应用代码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data /app/history

EXPOSE 3000

# CMD ["npm", "run", "dev"]
CMD ["node", "server.js"]