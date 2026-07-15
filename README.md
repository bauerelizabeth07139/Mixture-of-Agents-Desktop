<div align="center">

<a id='top'></a>

# ⚛️ Mixture of Agents — Desktop

### Intelligent Multi-Model Agent System Built on Claude Code Architecture

![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue?style=for-the-badge)
![Electron](https://img.shields.io/badge/electron-28-47848f?style=for-the-badge)
![Node](https://img.shields.io/badge/node.js-20+-339933?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

A full-featured AI development desktop environment with multi-model collaboration, code editing, file management, terminal, MCP/Skill extension system, and automated model capability testing.

[Switch to Chinese / 切换中文 ▶](#chinese-doc)

</div>

---

## 📑 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Screenshots](#-screenshots)
- [Architecture](#-architecture)
- [Extension System](#-extension-system)
- [Model Testing](#-model-testing)
- [Code Editor](#-code-editor)
- [Supported Languages](#-supported-languages)
- [Configuration](#-configuration)
- [Development](#-development)
- [Changelog](#-changelog)
- [License](#-license)

---

## ✨ Features

### 🤖 Multi-Model Collaborative Chat
- **Orchestrator Model** analyzes tasks and dispatches sub-agents with different models
- **Global thinking intensity**: Low / Medium / High / Auto (orchestrator decides for sub-agents)
- Orchestrator and sub-agent thinking strength configured independently
- **Context compression** — automatically condenses long conversation history
- Local conversation persistence with multi-thread management
- DeepSeek-style cache-friendly message formatting for improved cache hit rates

### 📝 Code Editor (Integrated File Management)
- **Monaco Editor** — the same engine powering VS Code
- Built-in file tree browser with right-click context menu (New / Rename / Delete)
- **Project directory selector** — choose any workspace location
- **Smart file creation** — auto-appends correct file extension
- **Change highlighting** — real-time visual markers on modified lines
- Bottom command bar for shell command execution with history
- One-click file runner supporting 14+ languages

### 🔌 Model Provider Management
- **17 preset providers**: OpenAI, DeepSeek, Zhipu AI, Moonshot, SiliconFlow, StepFun, Volcengine, MiniMax, Qwen, Baidu, iFlytek, Baichuan, LingYiwanWu, Tencent, MiMo, Anthropic, Local/Ollama
- Up to 50 API keys per provider with automatic round-robin and failover
- **API pool concurrency control** — max 80 concurrent requests per key
- Rate limit handling (429/401/403) with automatic key pool management
- One-click model list fetch with automatic capability detection (Vision / Audio / Multimodal)
- Custom provider support (any OpenAI-compatible API)

### 🧪 Model Capability Testing
- **Quick Test** (~3 min) and **Standard Test** (~12 min)
- 8 dimensions: Coding, Reasoning, Math, Creative Writing, Instruction Following, Tool Use, Multilingual, Context
- **10-point scale** with linear time-based fitting and correctness coefficients
- Automatic multimodal detection (Vision / Audio) via API testing

### 🧩 Extension System
- **28 MCP Server presets** — Filesystem, GitHub, Database, Search, AI tools, and more
- **27 Skill Server presets** — Independent skill execution environments (stdio / HTTP)
- **15 Expert/Skill presets** — Pre-configured skill templates with custom content
- All extensions: one-click add, test, enable/disable, and delete

### ⚡ Agent Orchestration
- Inspired by Claude Code, Codex, Trae, and open-source agents (OpenHands, Cline, OpenSpec)
- Sub-agents can use **different models** for different task types
- Task verification loop — orchestrator assigns sub-agents to check completion
- Automatic error recovery and retry logic

---

## 🚀 Quick Start

### Option 1: Download Portable (Recommended)

1. Go to [Releases](../../releases) and download the latest Windows x64 package
2. Extract the package and run `Mixture of Agents.exe`
3. No installation required

### Option 2: Download Installer

1. Download `Mixture of Agents Setup 1.0.0.exe`
2. Run the installer and follow the prompts
3. Launch from the Start Menu

### Option 3: Build from Source

```bash
git clone https://github.com/bauerelizabeth07139/Mixture-of-Agents-Desktop.git
cd Mixture-of-Agents-Desktop
npm install
npm run build:all
npm run dist
```

### Development Mode

```bash
npm run dev
```

---

## 🖼 Screenshots

| Chat | Providers | Models |
|:----:|:---------:|:------:|
| Multi-model collaborative chat | 17+ preset providers | Model capability overview |
| Orchestrator dispatches sub-agents | Auto model detection | 10-point test scores |

| Testing | Editor | Extensions |
|:-------:|:------:|:----------:|
| 8-dimension model testing | Monaco Editor + File Tree | MCP + Skill servers |
| Quick & Standard modes | Change highlighting | One-click setup |

---

## 🏗 Architecture

```
Mixture-of-Agents-Desktop/
├── frontend/                    # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx              # Main application (1500+ lines)
│   │   ├── components/
│   │   │   ├── Editor.tsx       # Monaco Editor + File Tree + Terminal
│   │   │   ├── FileManager.tsx  # File operations UI
│   │   │   └── Terminal.tsx     # xterm.js terminal
│   │   ├── services/api.ts      # Backend API client
│   │   └── types.ts             # TypeScript type definitions
│   └── dist/                    # Built frontend assets
│
├── backend/                     # Express.js + TypeScript
│   ├── src/
│   │   ├── index.ts             # Server entry point
│   │   ├── providers/
│   │   │   ├── api-pool.ts      # API key pool & concurrency control
│   │   │   └── presets.ts       # 17 provider presets
│   │   ├── routes/
│   │   │   ├── chat.ts          # Chat endpoints (SSE streaming)
│   │   │   ├── providers.ts     # Provider CRUD
│   │   │   ├── models.ts        # Model management
│   │   │   ├── testing.ts       # Model capability testing
│   │   │   ├── coding.ts        # Code execution engine
│   │   │   ├── projects.ts      # Project file operations
│   │   │   └── extensions.ts    # MCP/Skill management
│   │   └── services/
│   │       ├── project-manager.ts
│   │       ├── ws-manager.ts
│   │       ├── coding-engine.ts
│   │       └── extensions/
│   │           ├── extension-manager.ts
│   │           └── presets.ts   # 28 MCP + 27 Skill + 15 Expert
│   └── public/                  # Static frontend files
│
├── electron/                    # Electron main process
├── package.json
└── README.md
```

### Key Design Principles

| Principle | Description |
|-----------|-------------|
| **Orchestrator Pattern** | Macro model analyzes tasks and dispatches sub-agents |
| **API Pool** | Round-robin key rotation, max 80 concurrent/key, auto-failover |
| **Cache Optimization** | DeepSeek-style formatting for improved API cache hit rates |
| **Context Compression** | Automatic history condensation to prevent overflow |
| **Real-time Sync** | WebSocket-based live updates from backend to frontend |

---

## 🧩 Extension System

### MCP Servers (28 presets)

| Category | Servers |
|----------|---------|
| 🔧 **Tools** | Filesystem, GitHub, Git, Fetch, Everything |
| 🔍 **Search** | Brave Search, Exa, Google Maps |
| 🗄️ **Database** | PostgreSQL, MySQL, SQLite, Redis |
| 📊 **Data** | Pandoc, Excel, CSV |
| 🎨 **Creative** | Replicate, Figma, Puppeteer |
| 🤖 **AI** | OpenAI, Context7 |
| ☁️ **Cloud** | AWS S3, Cloudflare, Linear |
| 📱 **Social** | Discord, Slack, Twitter |

### Skill Servers (27 presets)

Pre-configured skill execution environments for web automation, data analysis, system administration, code review, and more.

### Expert Library (15 presets)

Ready-to-use expert configurations for common development workflows.

---

## 🧪 Model Testing

### Testing Dimensions

| Dimension | What It Tests |
|-----------|---------------|
| 💻 **Coding** | Algorithm implementation, data structures |
| 🧠 **Reasoning** | Logical deduction, multi-step reasoning |
| 🔢 **Math** | Mathematical computation, proofs |
| ✍️ **Creative Writing** | Format adherence, creative constraints |
| 📋 **Instruction Following** | Complex instruction compliance |
| 🔧 **Tool Use** | API calls, structured output |
| 🌍 **Multilingual** | Cross-language understanding |
| 📚 **Context Handling** | Long-context retention, multi-turn |

### Scoring System

- **10-point scale** per dimension, 80 points total
- Time-based linear scoring: ≤50% of limit = 10 points, linear decay to 2 points at limit
- **Quick test**: 3-minute limit per question
- **Standard test**: 12-minute limit per question (harder problems)
- **Correctness coefficient**: Multi-pattern regex matching with partial credit

### Multimodal Detection

- **Visual**: Sends test image via API, detects image understanding
- **Audio**: Sends test audio via API, detects audio comprehension
- Tags: `🖼️ Vision` / `🎵 Audio` / `🔊 Speech`

---

## 📝 Code Editor

| Feature | Description |
|---------|-------------|
| **Monaco Engine** | VS Code's editor with full IntelliSense |
| **File Tree** | Browse, create, rename, delete files and folders |
| **Smart Templates** | Auto-fill templates for 14 languages |
| **Change Highlighting** | Visual markers on modified lines |
| **Command Bar** | Execute shell commands in workspace |
| **One-Click Run** | Run any supported file with a button |
| **Project Selector** | Choose any directory as workspace root |

---

## 💻 Supported Languages

| Language | Extension | Runner |
|----------|-----------|--------|
| Python | `.py` | `python` |
| JavaScript | `.js` | `node` |
| TypeScript | `.ts` | `npx tsx` |
| C | `.c` | `gcc` → `./a.out` |
| C++ | `.cpp` | `g++` → `./a.out` |
| Go | `.go` | `go run` |
| Rust | `.rs` | `rustc` → `./main` |
| Java | `.java` | `javac` → `java` |
| Ruby | `.rb` | `ruby` |
| Shell | `.sh` | `bash` |
| HTML | `.html` | Browser open |
| CSS | `.css` | — |
| JSON | `.json` | — |
| Markdown | `.md` | — |

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server port |

### Key Pool Behavior

- **Deduplication** — duplicate keys automatically removed
- **Max concurrency** — 80 concurrent requests per key
- **Auto-rotation** — switches to next key when limit reached
- **Invalid key removal** — 401/403 keys removed from pool
- **Balance-based ordering** — keys with remaining balance prioritized

---

## 🛠 Development

### Prerequisites

- Node.js 20+
- npm 9+
- Windows x64

### Commands

```bash
npm install           # Install dependencies
npm run build:all     # Build frontend + backend
npm run dev           # Development mode
npm run dist          # Package as EXE
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript 5, Vite, Monaco Editor, xterm.js |
| Backend | Express.js, TypeScript, WebSocket (ws), Node.js |
| Desktop | Electron 28 |
| Styling | CSS Variables, Dark/Light Theme |
| State | React Hooks, localStorage persistence |

---

## 📋 Changelog

### v1.0.0 (Latest)

- ✅ Multi-model collaborative chat with orchestrator
- ✅ 17 preset providers with API pool management
- ✅ Monaco-based code editor with file tree
- ✅ 14-language code execution engine
- ✅ 8-dimension model capability testing (10-point scale)
- ✅ 28 MCP + 27 Skill + 15 Expert presets
- ✅ Multimodal detection (Vision / Audio)
- ✅ Context compression and cache optimization
- ✅ Dark/Light theme support
- ✅ Portable and Installer EXE packaging

---

## 📄 License

MIT License © 2025

---

<div align="center">

**For the Web version → [Mixture-of-Agents](https://github.com/bauerelizabeth07139/Mixture-of-Agents)**

</div>

---
---

<a id="chinese-doc"></a>`n`n# 中文文档

<div align="center">

# ⚛️ Mixture of Agents — Desktop

### 基于 Claude Code 架构的多模型智能代理桌面系统

</div>

[◀ 返回英文版 / Back to English](#top)

---

## 📑 目录

- [核心特性](#-核心特性)
- [快速开始](#-快速开始)
- [界面预览](#-界面预览)
- [架构说明](#-架构说明)
- [扩展系统](#-扩展系统)
- [模型能力测试](#-模型能力测试)
- [代码编辑器](#-代码编辑器)
- [支持语言](#-支持语言)
- [配置说明](#-配置说明)
- [开发指南](#-开发指南)
- [更新日志](#-更新日志)
- [许可证](#-许可证)

---

## ✨ 核心特性

### 🤖 多模型协作对话
- **宏观调控模型**分析任务，自动分配子代理执行
- **全局思考强度**：低 / 中 / 高 / 自动（由宏观模型决定子代理思考强度）
- 调控模型和子代理思考强度独立配置
- **上下文压缩**，长对话自动精简历史
- 对话历史本地持久化，支持多线程管理
- DeepSeek 风格的缓存友好消息格式，提高 API 缓存命中率

### 📝 代码编辑器（集成文件管理）
- **Monaco Editor** — VS Code 同款编辑器引擎
- 内置文件树浏览器，支持右键菜单（新建、重命名、删除）
- **项目目录选择器**，自由选择工作区位置
- **智能文件创建**，新建文件时自动补全后缀
- **改动行高亮**，编辑时实时标记修改的行
- 底部命令栏，直接在工作区执行 shell 命令
- 一键运行文件，支持 14+ 种语言

### 🔌 模型提供商管理
- **17 个预设提供商**：OpenAI、DeepSeek、智谱 AI、月之暗面、硅基流动、阶跃星辰、火山引擎、MiniMax、通义千问、百度千帆、讯飞星火、百川智能、零一万物、腾讯混元、小米 MiMo、Anthropic、Local/Ollama
- 每个提供商最多支持 50 个 API Key，自动轮询和故障转移
- **API 池并发控制** — 单密钥最大 80 并发
- 429/401/403 速率限制处理，密钥池自动管理
- 一键获取模型列表，自动探测模型能力（视觉/音频/多模态）
- 自定义提供商支持（任意 OpenAI 兼容 API）

### 🧪 模型能力测试
- **快速测试**（~3 分钟）和**标准测试**（~12 分钟）
- 8 个维度：编码、推理、数学、创意写作、指令遵循、工具使用、多语言、上下文处理
- **10 分制评分**，线性时间拟合 + 正确系数
- 自动多模态检测（视觉/音频），通过 API 测试

### 🧩 扩展系统
- **28 个 MCP 服务器预设** — 文件系统、GitHub、数据库、搜索、AI 工具等
- **27 个技能服务器预设** — 独立技能执行环境（stdio / HTTP）
- **15 个专家库预设** — 预配置技能模板
- 所有扩展支持一键添加、测试、启用/禁用、删除

### ⚡ 智能体编排
- 参考 Claude Code、Codex、Trae 及开源智能体（OpenHands、Cline、OpenSpec）
- 子代理可使用**不同模型**执行不同任务
- 任务验证循环 — 调控模型分配子代理检查任务完成情况
- 自动错误恢复和重试逻辑

---

## 🚀 快速开始

### 方式一：下载便携版（推荐）

1. 前往 [Releases](../../releases) 下载最新版本
2. 解压后运行 `Mixture of Agents.exe`
3. 无需安装任何依赖

### 方式二：下载安装版

1. 下载 `Mixture of Agents Setup 1.0.0.exe`
2. 运行安装程序，按提示完成安装
3. 从开始菜单启动

### 方式三：从源码构建

```bash
git clone https://github.com/bauerelizabeth07139/Mixture-of-Agents-Desktop.git
cd Mixture-of-Agents-Desktop
npm install
npm run build:all
npm run dist
```

### 开发模式

```bash
npm run dev
```

---

## 🖼 界面预览

| 对话 | 提供商 | 模型 |
|:----:|:------:|:----:|
| 多模型协作对话 | 17+ 预设提供商 | 模型能力总览 |
| 宏观调控智能调度 | 自动探测模型能力 | 10 分制测试评分 |

| 测试 | 编辑器 | 扩展 |
|:----:|:------:|:----:|
| 8 维度模型测试 | Monaco 编辑器 + 文件树 | MCP + Skill 服务器 |
| 快速/标准模式 | 改动行高亮 | 一键配置 |

---

## 🏗 架构说明

```
Mixture-of-Agents-Desktop/
├── frontend/                    # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx              # 主应用（1500+ 行）
│   │   ├── components/
│   │   │   ├── Editor.tsx       # Monaco 编辑器 + 文件树 + 终端
│   │   │   ├── FileManager.tsx  # 文件操作界面
│   │   │   └── Terminal.tsx     # xterm.js 终端
│   │   ├── services/api.ts      # 后端 API 客户端
│   │   └── types.ts             # TypeScript 类型定义
│   └── dist/                    # 构建产物
│
├── backend/                     # Express.js + TypeScript
│   ├── src/
│   │   ├── index.ts             # 服务入口
│   │   ├── providers/
│   │   │   ├── api-pool.ts      # API 密钥池 & 并发控制
│   │   │   └── presets.ts       # 17 个提供商预设
│   │   ├── routes/
│   │   │   ├── chat.ts          # 对话端点（SSE 流式）
│   │   │   ├── providers.ts     # 提供商管理
│   │   │   ├── models.ts        # 模型管理
│   │   │   ├── testing.ts       # 模型能力测试
│   │   │   ├── coding.ts        # 代码执行引擎
│   │   │   ├── projects.ts      # 项目文件操作
│   │   │   └── extensions.ts    # MCP/Skill 管理
│   │   └── services/
│   │       ├── project-manager.ts
│   │       ├── ws-manager.ts
│   │       ├── coding-engine.ts
│   │       └── extensions/
│   │           ├── extension-manager.ts
│   │           └── presets.ts   # 28 MCP + 27 Skill + 15 专家
│   └── public/                  # 静态前端文件
│
├── electron/                    # Electron 主进程
├── package.json
└── README.md
```

### 核心设计原则

| 原则 | 描述 |
|------|------|
| **调控模式** | 宏观模型分析任务并分配子代理 |
| **API 池** | 密钥轮询，单密钥最大 80 并发，自动故障转移 |
| **缓存优化** | DeepSeek 风格格式化，提高 API 缓存命中率 |
| **上下文压缩** | 自动精简历史，防止上下文溢出 |
| **实时同步** | 基于 WebSocket 的前后端实时通信 |

---

## 🧩 扩展系统

### MCP 服务器（28 个预设）

| 类别 | 服务器 |
|------|--------|
| 🔧 **工具** | Filesystem、GitHub、Git、Fetch、Everything |
| 🔍 **搜索** | Brave Search、Exa、Google Maps |
| 🗄️ **数据库** | PostgreSQL、MySQL、SQLite、Redis |
| 📊 **数据** | Pandoc、Excel、CSV |
| 🎨 **创意** | Replicate、Figma、Puppeteer |
| 🤖 **AI** | OpenAI、Context7 |
| ☁️ **云服务** | AWS S3、Cloudflare、Linear |
| 📱 **社交** | Discord、Slack、Twitter |

### 技能服务器（27 个预设）

预配置的技能执行环境，覆盖 Web 自动化、数据分析、系统管理、代码审查等场景。

### 专家库（15 个预设）

常用开发工作流的即用型专家配置。

---

## 🧪 模型能力测试

### 测试维度

| 维度 | 测试内容 |
|------|----------|
| 💻 **编码** | 算法实现、数据结构 |
| 🧠 **推理** | 逻辑推理、多步推理 |
| 🔢 **数学** | 数学计算、证明 |
| ✍️ **创意写作** | 格式遵循、创意约束 |
| 📋 **指令遵循** | 复杂指令遵从 |
| 🔧 **工具使用** | API 调用、结构化输出 |
| 🌍 **多语言** | 跨语言理解 |
| 📚 **上下文处理** | 长上下文保持、多轮对话 |

### 评分系统

- 每个维度 **10 分制**，总分 80 分
- 线性时间评分：≤50% 时间 = 10 分，线性递减至上限时 2 分
- **快速测试**：每题上限 3 分钟
- **标准测试**：每题上限 12 分钟（难度更高）
- **正确系数**：多模式正则匹配，支持部分得分

### 多模态检测

- **视觉**：通过 API 传入测试图片，检测图像理解能力
- **音频**：通过 API 传入测试音频，检测音频理解能力
- 标签显示：`🖼️ 视觉` / `🎵 音频` / `🔊 语音`

---

## 📝 代码编辑器

| 功能 | 描述 |
|------|------|
| **Monaco 引擎** | VS Code 编辑器，完整 IntelliSense |
| **文件树** | 浏览、创建、重命名、删除文件和文件夹 |
| **智能模板** | 14 种语言的自动填充模板 |
| **改动高亮** | 修改行的可视化标记 |
| **命令栏** | 在工作区中执行 shell 命令 |
| **一键运行** | 一键运行任何支持的文件 |
| **项目选择器** | 选择任意目录作为工作区根目录 |

---

## 💻 支持语言

| 语言 | 扩展名 | 运行方式 |
|------|--------|----------|
| Python | `.py` | `python` |
| JavaScript | `.js` | `node` |
| TypeScript | `.ts` | `npx tsx` |
| C | `.c` | `gcc` → `./a.out` |
| C++ | `.cpp` | `g++` → `./a.out` |
| Go | `.go` | `go run` |
| Rust | `.rs` | `rustc` → `./main` |
| Java | `.java` | `javac` → `java` |
| Ruby | `.rb` | `ruby` |
| Shell | `.sh` | `bash` |
| HTML | `.html` | 浏览器打开 |
| CSS | `.css` | — |
| JSON | `.json` | — |
| Markdown | `.md` | — |

---

## ⚙️ 配置说明

### 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `PORT` | `3001` | 后端服务端口 |

### 密钥池行为

- **去重** — 重复密钥自动移除
- **并发上限** — 单密钥最大 80 并发
- **自动轮换** — 达到上限自动切换下一个密钥
- **失效移除** — 401/403 密钥自动从池中移除
- **余额排序** — 按剩余余额优先使用

---

## 🛠 开发指南

### 前置条件

- Node.js 20+
- npm 9+
- Windows x64

### 常用命令

```bash
npm install           # 安装依赖
npm run build:all     # 构建前后端
npm run dev           # 开发模式
npm run dist          # 打包为 EXE
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18、TypeScript 5、Vite、Monaco Editor、xterm.js |
| 后端 | Express.js、TypeScript、WebSocket (ws)、Node.js |
| 桌面 | Electron 28 |
| 样式 | CSS Variables、深色/浅色主题 |
| 状态 | React Hooks、localStorage 持久化 |

---

## 📋 更新日志

### v1.0.0（最新）

- ✅ 多模型协作对话，宏观调控智能调度
- ✅ 17 个预设提供商，API 池管理
- ✅ Monaco 编辑器 + 文件树
- ✅ 14 种语言代码执行引擎
- ✅ 8 维度模型能力测试（10 分制）
- ✅ 28 MCP + 27 Skill + 15 专家预设
- ✅ 多模态检测（视觉/音频）
- ✅ 上下文压缩与缓存优化
- ✅ 深色/浅色主题切换
- ✅ 便携版与安装版 EXE 打包

---

## 📄 许可证

MIT License © 2025

---

<div align="center">

**Web 版本 → [Mixture-of-Agents](https://github.com/bauerelizabeth07139/Mixture-of-Agents)**

</div>