<div align="center">

# ⚛️ Mixture of Agents — Desktop

### Intelligent Multi-Model Agent System Built on Claude Code Architecture

### 基于 Claude Code 架构的多模型智能代理桌面系统

---

![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue?style=for-the-badge)
![Electron](https://img.shields.io/badge/electron-28-47848f?style=for-the-badge)
![Node](https://img.shields.io/badge/node.js-20+-339933?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

*A full-featured AI development desktop environment with multi-model collaboration, code editing, file management, terminal, MCP/Skill extension system, and automated model capability testing.*

*功能完整的 AI 桌面开发环境，集成多模型协作对话、代码编辑器、文件管理、终端、MCP/Skill 扩展系统，以及模型能力自动测试。*

<br/>

[English](#-features) · [中文](#-核心特性) · [Quick Start / 快速开始](#-quick-start--快速开始) · [Architecture / 架构](#-architecture--架构说明) · [Screenshots / 界面预览](#-screenshots--界面预览)

</div>

---

## 📑 Table of Contents / 目录

| English | 中文 |
|---------|------|
| [Features](#-features) | [核心特性](#-核心特性) |
| [Quick Start](#-quick-start--快速开始) | [快速开始](#-quick-start--快速开始) |
| [Screenshots](#-screenshots--界面预览) | [界面预览](#-screenshots--界面预览) |
| [Architecture](#-architecture--架构说明) | [架构说明](#-architecture--架构说明) |
| [Extension System](#-extension-system--扩展系统) | [扩展系统](#-extension-system--扩展系统) |
| [Model Testing](#-model-testing--模型能力测试) | [模型能力测试](#-model-testing--模型能力测试) |
| [Editor](#-code-editor--代码编辑器) | [代码编辑器](#-code-editor--代码编辑器) |
| [Supported Languages](#-supported-languages--支持语言) | [支持语言](#-supported-languages--支持语言) |
| [Configuration](#-configuration--配置说明) | [配置说明](#-configuration--配置说明) |
| [Development](#-development--开发指南) | [开发指南](#-development--开发指南) |
| [Changelog](#-changelog--更新日志) | [更新日志](#-changelog--更新日志) |
| [License](#-license) | [许可证](#-license) |

---

## ✨ Features

### 🤖 Multi-Model Collaborative Chat
- **Orchestrator Model** analyzes tasks and dispatches sub-agents with different models
- **Global thinking intensity** control: Low / Medium / High / Auto (orchestrator decides)
- Orchestrator and sub-agent thinking strength configured independently
- **Context compression** — automatically condenses long conversation history for efficiency
- Local conversation persistence with multi-thread management
- DeepSeek-style cache-friendly message formatting for improved cache hit rates

### 📝 Code Editor (Integrated File Management)
- **Monaco Editor** — the same engine powering VS Code
- Built-in file tree browser with right-click context menu (New / Rename / Delete)
- **Project directory selector** — choose any workspace location
- **Smart file creation** — auto-appends correct file extension (.py / .js / .ts / .html / .c / .cpp etc.)
- **Change highlighting** — real-time visual markers on modified lines
- Bottom command bar for shell command execution with history
- One-click file runner supporting 14+ languages

### 🔌 Model Provider Management
- **17 preset providers**: OpenAI, DeepSeek, Zhipu AI, Moonshot, SiliconFlow, StepFun, Volcengine, MiniMax, Qwen, Baidu, iFlytek, Baichuan, LingYiwanWu, Tencent, MiMo, Anthropic, Local/Ollama
- Up to 50 API keys per provider with automatic round-robin and failover
- **API pool concurrency control** — max 80 concurrent requests per key, automatic key rotation
- Rate limit handling (429/401/403) with automatic key pool management
- One-click model list fetch with automatic capability detection (Vision / Audio / Multimodal)
- Custom provider support (any OpenAI-compatible API)

### 🧪 Model Capability Testing
- **Quick Test** (~3 min, 2 questions per dimension) and **Standard Test** (~12 min, 2 questions per dimension)
- 8 testing dimensions: Coding, Reasoning, Math, Creative Writing, Instruction Following, Tool Use, Multilingual, Context Handling
- **10-point scale** scoring with linear time-based fitting
- Correctness coefficient via multi-pattern regex matching
- **Automatic multimodal detection** — tests image and audio recognition via API
- Results sync in real-time to model capability panels and provider cards

### 🧩 Extension System
- **28 MCP Server presets** — Filesystem, GitHub, Database, Search, AI tools, and more
- **27 Skill Server presets** — Independent skill execution environments (stdio / HTTP)
- **15 Expert/Skill presets** — Pre-configured skill templates with custom content
- All extensions: one-click add, test, enable/disable, and delete

### ⚡ Agent Orchestration
- Inspired by Claude Code, Codex, Trae, and open-source agents (OpenHands, Cline, OpenSpec)
- Sub-agents can use **different models** for different task types
- Task verification loop — orchestrator assigns sub-agents to check completion status
- Automatic error recovery and retry logic

---

## 🚀 Quick Start / 快速开始

### Option 1: Download Portable (Recommended / 推荐)

1. Go to [Releases](../../releases) and download the latest portable exe
2. Run `Mixture-of-Agents--portable.exe`
3. No installation required — start using immediately

### Option 2: Download Installer

1. Download `Mixture of Agents Setup 1.0.0.exe`
2. Run the installer and follow the prompts
3. Launch from the Start Menu

### Option 3: Build from Source / 从源码构建

```bash
# Clone the repository / 克隆仓库
git clone https://github.com/bauerelizabeth07139/Mixture-of-Agents-Desktop.git
cd Mixture-of-Agents-Desktop

# Install dependencies / 安装依赖
npm install

# Build frontend and backend / 构建前端和后端
npm run build:all

# Package as EXE / 打包为 EXE
npm run dist
```

### Development Mode / 开发模式

```bash
# Start backend hot-reload, frontend dev server, and Electron window
npm run dev
```

---

## 🖼 Screenshots / 界面预览

| Chat / 对话 | Providers / 提供商 | Models / 模型 |
|:-----------:|:------------------:|:-------------:|
| *Multi-model collaborative chat with orchestrator* | *17+ preset providers with auto model detection* | *Model capability overview with test scores* |
| *多模型协作对话，宏观调控智能调度* | *17+ 预设提供商，自动探测模型能力* | *模型能力总览，测试评分可视化* |

| Testing / 测试 | Editor / 编辑器 | Extensions / 扩展 |
|:---------------:|:---------------:|:-----------------:|
| *8-dimension model testing with 10-point scoring* | *Monaco Editor with file tree and terminal* | *MCP + Skill servers with one-click setup* |
| *8 维度模型测试，10 分制评分* | *Monaco 编辑器 + 文件树 + 终端* | *MCP + Skill 服务器，一键配置* |

---

## 🏗 Architecture / 架构说明

```
Mixture-of-Agents-Desktop/
├── frontend/                    # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx              # Main application (1500+ lines)
│   │   ├── components/
│   │   │   ├── Editor.tsx       # Monaco Editor + File Tree + Terminal
│   │   │   ├── FileManager.tsx  # File operations UI
│   │   │   ├── Terminal.tsx     # xterm.js terminal
│   │   │   └── Environment.tsx  # Environment info panel
│   │   ├── services/
│   │   │   └── api.ts           # Backend API client
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
│   │       ├── project-manager.ts   # File system operations
│   │       ├── ws-manager.ts        # WebSocket broadcast
│   │       ├── coding-engine.ts     # Multi-language code runner
│   │       └── extensions/
│   │           ├── extension-manager.ts  # Extension lifecycle
│   │           └── presets.ts            # 28 MCP + 27 Skill + 15 Expert presets
│   └── public/                  # Static frontend files
│
├── electron/                    # Electron main process
├── package.json
└── README.md
```

### Key Design Principles / 核心设计原则

| Principle / 原则 | Description / 描述 |
|------------------|---------------------|
| **Orchestrator Pattern / 调控模式** | A macro model analyzes tasks and dispatches sub-agents — similar to Claude Code's agent architecture |
| **API Pool / API 池** | Round-robin key rotation with concurrency control (max 80/key), automatic failover on 429/401/403 |
| **Cache Optimization / 缓存优化** | DeepSeek-style message formatting for improved API cache hit rates |
| **Context Compression / 上下文压缩** | Automatic history condensation to prevent context overflow |
| **Real-time Sync / 实时同步** | WebSocket-based live updates from backend to frontend |

---

## 🧩 Extension System / 扩展系统

### MCP Servers (28 presets)

| Category / 类别 | Servers |
|----------------|---------|
| 🔧 **Tools / 工具** | Filesystem, GitHub, Git, Fetch, Everything |
| 🔍 **Search / 搜索** | Brave Search, Exa, Google Maps |
| 🗄️ **Database / 数据库** | PostgreSQL, MySQL, SQLite, Redis |
| 📊 **Data / 数据** | Pandoc, Excel, CSV |
| 🎨 **Creative / 创意** | Replicate (Image Gen), Figma, Puppeteer |
| 🤖 **AI / 人工智能** | OpenAI, Brave Search with AI, Context7 |
| ☁️ **Cloud / 云服务** | AWS S3, Cloudflare, Linear |
| 📱 **Social / 社交** | Discord, Slack, Twitter |
| 🧪 **Testing / 测试** | Everything (MCP feature demo) |

### Skill Servers (27 presets)

Pre-configured skill execution environments for web automation, data analysis, system administration, code review, and more.

### Expert Library / 专家库 (15 presets)

Ready-to-use expert configurations for common development workflows.

---

## 🧪 Model Testing / 模型能力测试

### Testing Dimensions / 测试维度

| Dimension / 维度 | What It Tests / 测试内容 |
|-----------------|------------------------|
| 💻 **Coding** | Algorithm implementation, data structures |
| 🧠 **Reasoning** | Logical deduction, multi-step reasoning |
| 🔢 **Math** | Mathematical computation, proofs |
| ✍️ **Creative Writing** | Format adherence, creative constraints |
| 📋 **Instruction Following** | Complex instruction compliance |
| 🔧 **Tool Use** | API calls, structured output |
| 🌍 **Multilingual** | Cross-language understanding |
| 📚 **Context Handling** | Long-context retention, multi-turn |

### Scoring System / 评分系统

- **10-point scale** per dimension, 80 points total
- Time-based linear scoring: **≤50% of limit = 10 points**, linear decay to **2 points at limit**
- **Quick test**: 3-minute limit per question
- **Standard test**: 12-minute limit per question (harder problems)
- **Correctness coefficient**: Multi-pattern regex matching with partial credit

### Multimodal Detection / 多模态检测

- **Visual**: Sends test image via API, detects image understanding capability
- **Audio**: Sends test audio via API (MiMo format), detects audio comprehension
- Tags displayed on model cards: `🖼️ Vision` / `🎵 Audio` / `🔊 Speech`
- Vision and audio scores shown separately from main capability scores

---

## 📝 Code Editor / 代码编辑器

| Feature / 功能 | Description / 描述 |
|---------------|---------------------|
| **Monaco Engine** | VS Code's editor engine with full IntelliSense |
| **File Tree** | Browse, create, rename, delete files and folders |
| **Smart Templates** | Auto-fill templates for 14 languages on file creation |
| **Change Highlighting** | Visual markers on modified lines with change count |
| **Command Bar** | Execute shell commands directly in the workspace |
| **One-Click Run** | Run any supported file with a single button |
| **Project Selector** | Choose any directory as the workspace root |

---

## 💻 Supported Languages / 支持语言

| Language / 语言 | Extension / 扩展名 | Runner / 运行方式 |
|----------------|--------------------|--------------------|
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

## ⚙️ Configuration / 配置说明

### Environment Variables / 环境变量

| Variable / 变量 | Default / 默认值 | Description / 描述 |
|----------------|-----------------|---------------------|
| `PORT` | `3001` | Backend server port / 后端服务端口 |

### Key Pool Behavior / 密钥池行为

- **Deduplication** — duplicate keys are automatically removed / 重复密钥自动去重
- **Max concurrency** — 80 concurrent requests per key / 单密钥最大并发 80
- **Auto-rotation** — switches to next key when limit reached / 达到上限自动切换
- **Invalid key removal** — 401/403 keys are removed from pool / 失效密钥自动移除
- **Balance-based ordering** — keys with remaining balance prioritized / 按余额排序

---

## 🛠 Development / 开发指南

### Prerequisites / 前置条件

- **Node.js** 20+ / Node.js 20+
- **npm** 9+ / npm 9+
- **Windows** x64 / Windows x64

### Project Structure / 项目结构

```bash
npm install           # Install all dependencies / 安装依赖
npm run build:all     # Build frontend + backend / 构建前后端
npm run dev           # Development mode / 开发模式
npm run dist          # Package as EXE / 打包 EXE
```

### Tech Stack / 技术栈

| Layer / 层 | Technology / 技术 |
|-----------|-------------------|
| Frontend / 前端 | React 18, TypeScript 5, Vite, Monaco Editor, xterm.js |
| Backend / 后端 | Express.js, TypeScript, WebSocket (ws), Node.js |
| Desktop / 桌面 | Electron 28 |
| Styling / 样式 | CSS Variables, Dark/Light Theme |
| State / 状态 | React Hooks, localStorage persistence |

---

## 📋 Changelog / 更新日志

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

**Built with ⚛️ by the Mixture of Agents team**

*Crafted with care for developers who want AI-powered coding assistance*

---

*为追求 AI 辅助编程的开发者精心打造*

</div>