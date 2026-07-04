# Mixture of Agents — Desktop

多模型协同智能体系统桌面版。基于 Claude Code 内核，支持 17+ 家模型提供商、MCP 服务器、技能配置。

![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)
![Electron](https://img.shields.io/badge/electron-43-47848f)
![Node](https://img.shields.io/badge/node.js-18+-339933)

---

## 🚀 快速开始

### 方式一：下载便携版 exe（推荐）

1. 前往 [Releases](https://github.com/bauerelizabeth07139/Mixture-of-Agents-Desktop/releases) 下载最新版本
2. 解压 zip 文件
3. 双击 `Mixture-of-Agents-1.0.0-portable.exe` 运行
4. **无需安装任何依赖**，直接使用

> ⚠️ 便携版约 92MB，首次启动需 5-10 秒加载后端服务

### 方式二：从源码构建

**前置条件**：安装 [Node.js 18+](https://nodejs.org)

```bash
# 1. 克隆仓库
git clone https://github.com/bauerelizabeth07139/Mixture-of-Agents-Desktop.git
cd Mixture-of-Agents-Desktop

# 2. 一键构建 exe
build-release.bat

# 3. 输出在 release/Mixture-of-Agents-1.0.0-portable.exe
```

### 方式三：开发模式运行

```bash
# 双击 dev.bat 或手动执行：
cd backend && npm install && npx tsc
cd ../frontend && npm install
cd .. && npm install && npm run dev
```

---

## 📦 功能特性

| 功能 | 说明 |
|------|------|
| 🧠 **多模型协同** | 宏观调控模型自动分配子任务给最适合的子代理 |
| 📦 **17+ 提供商** | OpenAI、DeepSeek、MiMo、硅基流动、阶跃星辰、火山、通义、智谱等 |
| 🔌 **MCP 服务器** | 15 个预设（文件系统、GitHub、搜索、数据库、浏览器等） |
| ⚡ **技能库** | 10 个预设技能（代码审查、架构设计、调试、测试等） |
| 🧪 **能力测试** | 8 项标准化测试，支持单模型/单提供商/全局测试 |
| 💰 **成本控制** | 滑块 0（效率优先）到 1（成本优先），归一化模型选择 |
| 🖥️ **独立窗口** | Electron 桌面应用，不依赖浏览器 |
| 🔑 **API 池** | 每个提供商最多 50 个 API Key，自动故障转移 |

---

## 🏗️ 技术栈

- **前端**: React 18 + TypeScript + Vite
- **后端**: Express + TypeScript + WebSocket
- **桌面**: Electron 43
- **打包**: electron-builder (NSIS + Portable)

---

## 📁 项目结构

```
Mixture-of-Agents-Desktop/
├── main.cjs                 # Electron 主进程
├── package.json             # 根配置 + electron-builder 配置
├── build-release.bat        # 一键打包脚本
├── dev.bat                  # 开发模式启动脚本
├── backend/                 # Express 后端
│   ├── src/                 # TypeScript 源码
│   │   ├── orchestrator/    # 调度引擎（Claude Code 内核）
│   │   ├── providers/       # API 池管理 + 17家预设
│   │   ├── services/        # LLM客户端、能力测试、编程引擎
│   │   └── routes/          # API 路由
│   └── dist/                # 编译输出
├── frontend/                # React 前端
│   ├── src/
│   │   ├── App.tsx          # 主界面（对话式交互）
│   │   └── styles/          # Codex 风格暗色主题
│   └── dist/                # Vite 构建输出
└── release/                 # 打包输出
    └── Mixture-of-Agents-1.0.0-portable.exe
```

---

## 📄 License

MIT
