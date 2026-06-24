# API Tester - 轻量级 API 测试工具

一个基于 Node.js 和 Express 的轻量级 Web API 测试工具，提供类似 Postman 的功能，支持请求管理、环境变量、分组管理和历史记录。

## ✨ 特性

- 🚀 **直观的 Web 界面** - 现代化的 UI 设计，易于使用
- 📝 **请求管理** - 创建、编辑、保存和发送 HTTP 请求
- 🌍 **多环境支持** - 支持开发、测试、生产等多环境配置
- 📁 **分组管理** - 将请求按功能或项目进行分组
- 💾 **自动保存** - 实时自动保存您的工作进度
- 📊 **历史记录** - 完整记录所有请求历史，便于追溯
- 🔄 **变量替换** - 支持环境变量和全局变量替换
- 📦 **导入/导出** - 支持集合的导入和导出
- 🐳 **Docker 支持** - 一键部署，开箱即用

## 🛠️ 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 JavaScript + HTML5 + CSS3
- **数据存储**: JSON 文件系统
- **容器化**: Docker + Docker Compose

## 📋 前置要求

- Node.js 18+ 
- npm 或 yarn
- Docker & Docker Compose (可选，用于容器化部署)

## 🚀 快速开始

### 方式一：本地运行

1. **克隆项目**
``` bash
cd /root/.cxy/box/api-tester
```

2. **安装依赖**
``` bash
npm install
```

4. 启动服务
# 开发模式（支持热重载）
``` bash    
npm run dev

# 生产模式
npm start

```
4. 访问应用 打开浏览器访问: http://localhost:3000


方式二：Docker 运行