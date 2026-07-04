# Mixture of Agents — Desktop

多模型协同智能体系统桌面版。基于 Claude Code 内核，支持 17+ 家模型提供商、MCP 服务器、技能配置。

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/electron-43-47848f)

## 快速开始

### 开发模式

```bash
# 安装依赖
cd backend && npm install
cd ../frontend && npm install
cd .. && npm install

# 启动开发环境
npm run dev
```

### 打包为 exe

```bash
# 安装依赖
npm install

# 构建所有组件并打包
npm run dist
```

打包产物在 `release/` 目录下：
- `Mixture of Agents Setup 1.0.0.exe` — 安装版
- `Mixture-of-Agents-1.0.0-portable.exe` — 便携版

### 仅构建（不打包）

```bash
npm run build:all
```

## 功能特性

- 🧠 **多模型协同调度** — 宏观调控模型自动分配子任务给最适合的子代理
- 📦 **17+ 家模型提供商** — OpenAI、DeepSeek、MiMo、硅基流动、阶跃星辰、火山等
- 🔌 **MCP 服务器** — 15 个预设，支持自定义添加
- ⚡ **技能库** — 10 个预设技能，可自定义创建和编辑
- 🧪 **能力测试** — 8 项标准测试，支持单模型/单提供商/全局测试
- 💰 **成本/效率控制** — 滑块控制 0（效率优先）到 1（成本优先）
- 🤖 **Claude Code 内核** — 任务分解→分配→监控→聚合的完整调度链
- 🖥️ **独立桌面窗口** — 不依赖浏览器

## 技术栈

- **前端**: React + TypeScript + Vite
- **后端**: Express + TypeScript + WebSocket
- **桌面**: Electron 43
- **打包**: electron-builder

## 项目结构

```
Mixture-of-Agents-Desktop/
├── main.cjs              # Electron 主进程
├── package.json          # 根配置 + electron-builder
├── build/                # 图标等资源
├── backend/              # Express 后端
│   ├── src/              # TypeScript 源码
│   └── dist/             # 编译输出
├── frontend/             # React 前端
│   ├── src/              # TypeScript/React 源码
│   └── dist/             # Vite 构建输出
└── release/              # 打包输出
```

## 许可证

MIT
