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
- **Plan → Act → Observe → Replan** loop — same core as Claude Code / Codex
- **Global thinking intensity**: Low / Medium / High / Auto (orchestrator decides for sub-agents)
- Orchestrator and sub-agent thinking strength configured independently
- **Stateless verification sub-agents** check project completeness
- **Context compression** — DeepSeek-style cache-friendly message formatting
- Local conversation persistence with multi-thread management

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

### 🏗 Agent Orchestration
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
npx electron-builder --win dir
# EXE in release/win-unpacked/
```

### Development Mode

```bash
npm run dev
```

---

## 📸 Screenshots

| Chat | Providers | Models |
|:----:|:---------:|:------:|
| Multi-model collaborative chat | 17+ preset providers | Model capability overview |
| Orchestrator dispatches sub-agents | Auto model detection | 10-point test scores |

| Testing | Editor | Extensions |
|:-------:|:------:|:----------:|
| 8-dimension model testing | Monaco code editor | MCP / Skill servers |
| Multimodal detection | File tree + terminal | Expert library |

---

## 🏗 Architecture

```
Mixture-of-Agents-Desktop/
├── frontend/                     # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx               # Main application
│   │   ├── components/           # Chat, Editor, FileTree, Terminal, Testing, Extensions
│   │   ├── services/api.ts       # API client with SSE support
│   │   └── types.ts
│   ├── electron-main.cjs         # Electron main process
│   └── dist/                     # Built frontend
│
├── backend/                      # Express.js + TypeScript
│   ├── src/
│   │   ├── index.ts              # Server entry point
│   │   ├── providers/            # API pool + 17 presets
│   │   ├── routes/               # REST + SSE endpoints
│   │   └── services/             # LLM client, project service
│   ├── public/                   # Static frontend files
│   ├── data/                     # Runtime data
│   └── dist/                     # Compiled TypeScript
│
├── package.json                  # Electron app config
├── electron-builder.yml          # Build configuration
└── README.md
```

### Orchestration Flow

```
User Message
    ↓
┌─────────────────────────────────────────┐
│  1. THINK — Orchestrator creates plan   │
│  2. ACT — Write files, run commands     │
│  3. OBSERVE — Check errors, verify      │
│  4. FIX — If errors, generate fixes     │
│  5. REPEAT (up to 12 rounds)            │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  VERIFY — Stateless sub-agent checks    │
│  project completeness & correctness     │
└─────────────────────────────────────────┘
    ↓
Done → Auto-serve & open browser
```

---

## 🧩 Extension System

### MCP Servers (28 presets)

| Category | Examples |
|----------|----------|
| **Filesystem** | File read/write, directory traversal |
| **Code** | GitHub integration, code search |
| **Database** | SQLite, PostgreSQL, Redis |
| **Search** | Web search, document retrieval |
| **AI Tools** | Image generation, TTS, STT |

### Skill Servers (27 presets)

Independent skill execution environments covering web automation, data analysis, system management, code review, and more.

### Expert Library (15 presets)

Pre-configured expert knowledge templates for common development workflows.

---

## 🧪 Model Testing

### Test Dimensions

| Dimension | Icon | Content |
|-----------|------|---------|
| **Coding** | 💻 | Algorithm implementation, data structures |
| **Reasoning** | 🧠 | Logical reasoning, multi-step deduction |
| **Math** | 🔢 | Mathematical computation, proofs |
| **Creative Writing** | ✍️ | Format compliance, creative constraints |
| **Instruction Following** | 📋 | Complex instruction adherence |
| **Tool Use** | 🛠️ | API calls, structured output |
| **Multilingual** | 🌐 | Cross-language understanding |
| **Context** | 📚 | Long context retention, multi-turn dialogue |

### Scoring System

- Each dimension: **10 points** (2 questions × 5 points each)
- **Time-based linear scoring**: ≤50% of time limit = 5 points, linear decay to 2 points at time limit
- **Correctness coefficient**: multi-regex matching with partial credit
- **Quick test**: 3 minutes per question
- **Standard test**: 12 minutes per question, higher difficulty
- **Multimodal detection**: automatic vision/audio capability tagging

---

## 📝 Code Editor

| Feature | Description |
|---------|-------------|
| **Monaco Engine** | VS Code editor, full IntelliSense |
| **File Tree** | Browse, create, rename, delete files and folders |
| **Smart Templates** | Auto-fill templates for 14 languages |
| **Change Highlighting** | Visual markers on modified lines |
| **Command Bar** | Execute shell commands from the workspace |
| **One-Click Run** | Run any supported file instantly |
| **Project Selector** | Choose any directory as workspace root |

---

## 📝 Supported Languages

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
| HTML | `.html` | Browser |
| CSS | `.css` | — |
| JSON | `.json` | — |
| Markdown | `.md` | — |

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server port |

### API Key Pool

- **Deduplication** — duplicate keys automatically removed
- **Concurrency limit** — max 80 concurrent requests per key
- **Auto-rotation** — switches to next key when limit reached
- **Failover** — 401/403 keys automatically removed from pool
- **Balance sorting** — keys with remaining quota used first

---

## 🛠 Development

### Prerequisites

- Node.js 20+
- npm 9+
- Windows x64

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript 5, Vite, Monaco Editor, xterm.js |
| Backend | Express.js, TypeScript, WebSocket (ws), Node.js |
| Desktop | Electron 28 |
| Styling | CSS Variables, dark/light themes |
| State | React Hooks, localStorage persistence |

### Build Commands

```bash
npm install           # Install dependencies
npm run build:all     # Build frontend + backend
npm run dev           # Development mode
npx electron-builder --win dir  # Package as EXE
```

---

## 📋 Changelog

### v1.0.0 (Latest)
- ✅ Multi-model collaborative chat with orchestrator
- ✅ 17 preset providers with API pool management
- ✅ Monaco editor + file management
- ✅ 14-language code execution engine
- ✅ 8-dimension model capability testing (10-point scale)
- ✅ 28 MCP + 27 Skill + 15 Expert presets
- ✅ Multimodal detection (Vision / Audio)
- ✅ Context compression & cache optimization
- ✅ Dark / Light theme toggle
- ✅ Portable and installer EXE packaging

---

## 📄 License

MIT License © 2025

---

<div align="center">

**Web version → [Mixture-of-Agents](https://github.com/bauerelizabeth07139/Mixture-of-Agents)**

</div>

---
---

<a id="chinese-doc"></a>

# ⚛️ Mixture of Agents — Desktop

### 基于 Claude Code 架构的多模型智能代理桌面系统

<div align="center">

![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue?style=for-the-badge)
![Electron](https://img.shields.io/badge/electron-28-47848f?style=for-the-badge)
![Node](https://img.shields.io/badge/node.js-20+-339933?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

</div>

[◀ 返回英文版 / Back to English](#top)

---

## 📑 目录

- [核心特性](#-核心特性)
- [快速开始](#-快速开始)
- [截图预览](#-截图预览)
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
- **宏观调控模型** 分析任务，制定分步计划，分配子代理执行
- **计划→执行→观察→重规划** 循环 —— 与 Claude Code / Codex 核心一致
- **全局思考强度**：低 / 中 / 高 / 自动（由宏观模型决定子代理强度）
- 调控模型和子代理思考强度独立配置
- **无记忆验证代理** 检查项目完整性
- **上下文压缩** —— DeepSeek 风格缓存友好消息格式
- 本地对话持久化，多线程管理

### 📝 代码编辑器（集成文件管理）
- **Monaco 编辑器** —— 与 VS Code 相同的编辑引擎
- 内置文件树，右键菜单（新建/重命名/删除）
- **项目目录选择器** —— 选择任意工作区位置
- **智能文件创建** —— 自动追加正确的文件扩展名
- **改动高亮** —— 修改行的实时可视化标记
- 底部命令栏，支持 shell 命令执行与历史
- 一键运行，支持 14+ 种语言

### 🔌 提供商与模型管理
- **17 个预设提供商**：OpenAI、DeepSeek、智谱AI、Moonshot、SiliconFlow、StepFun、火山引擎、MiniMax、通义千问、百度、讯飞、百川、零一万物、腾讯、MiMo、Anthropic、本地/Ollama
- 每个提供商最多 50 个 API 密钥，自动轮换与故障转移
- **API 池并发控制** —— 单密钥最大 80 并发
- 429/401/403 速率限制自动处理
- 一键获取模型列表并自动探测能力（视觉/音频/多模态）
- 自定义提供商支持（任何 OpenAI 兼容 API）

### 🧪 模型能力测试
- **快速测试**（~3 分钟）和 **标准测试**（~12 分钟）
- 8 个维度：编码、推理、数学、创意写作、指令遵循、工具使用、多语言、上下文
- **10 分制评分**，线性时间拟合 + 正确系数
- 自动多模态检测（视觉 / 音频）

### 🧩 扩展系统
- **28 个 MCP 服务器**预设（文件系统、GitHub、数据库、搜索、AI 工具等）
- **27 个技能服务器**预设（独立技能执行环境）
- **15 个专家库**预设（预配置技能模板）
- 所有扩展：一键添加、测试、启用/禁用、删除

### 🏗 智能代理编排
- 参考 Claude Code、Codex、Trae、OpenHands、Cline、OpenSpec 设计
- 子代理可使用 **不同模型** 执行不同任务类型
- 任务验证循环 —— 调控模型分配无记忆子代理检查完成度
- 自动错误恢复与重试

---

## 🚀 快速开始

### 方式一：下载便携版（推荐）

1. 前往 [Releases](../../releases) 下载最新 Windows x64 包
2. 解压后运行 `Mixture of Agents.exe`
3. 无需安装

### 方式二：下载安装版

1. 下载 `Mixture of Agents Setup 1.0.0.exe`
2. 运行安装程序，按提示操作
3. 从开始菜单启动

### 方式三：从源码构建

```bash
git clone https://github.com/bauerelizabeth07139/Mixture-of-Agents-Desktop.git
cd Mixture-of-Agents-Desktop
npm install
npm run build:all
npx electron-builder --win dir
# EXE 位于 release/win-unpacked/
```

### 开发模式

```bash
npm run dev
```

---

## 📸 截图预览

| 对话 | 提供商 | 模型 |
|:----:|:------:|:----:|
| 多模型协作对话 | 17+ 预设提供商 | 模型能力总览 |
| 调控模型分配子代理 | 自动模型检测 | 10 分制测试评分 |

| 测试 | 编辑器 | 扩展 |
|:----:|:------:|:----:|
| 8 维度模型测试 | Monaco 代码编辑器 | MCP / 技能服务器 |
| 多模态检测 | 文件树 + 终端 | 专家库 |

---

## 🏗 架构说明

```
Mixture-of-Agents-Desktop/
├── frontend/                     # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx               # 主应用
│   │   ├── components/           # 聊天、编辑器、文件树、终端、测试、扩展
│   │   ├── services/api.ts       # API 客户端（支持 SSE）
│   │   └── types.ts
│   ├── electron-main.cjs         # Electron 主进程
│   └── dist/                     # 构建产物
│
├── backend/                      # Express.js + TypeScript
│   ├── src/
│   │   ├── index.ts              # 服务入口
│   │   ├── providers/            # API 池 + 17 个预设
│   │   ├── routes/               # REST + SSE 端点
│   │   └── services/             # LLM 客户端、项目服务
│   ├── public/                   # 静态前端文件
│   ├── data/                     # 运行时数据
│   └── dist/                     # 编译后的 TypeScript
│
├── package.json                  # Electron 应用配置
├── electron-builder.yml          # 打包配置
└── README.md
```

### 编排流程

```
用户消息
    ↓
┌─────────────────────────────────────────┐
│  1. 思考 — 调控模型创建计划              │
│  2. 执行 — 写入文件、运行命令             │
│  3. 观察 — 检查错误、验证结果             │
│  4. 修复 — 有错误则生成修复方案           │
│  5. 重复（最多 12 轮）                   │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  验证 — 无记忆子代理检查项目完整性        │
└─────────────────────────────────────────┘
    ↓
完成 → 自动启动服务器并打开浏览器
```

---

## 🧩 扩展系统

### MCP 服务器（28 个预设）

| 类别 | 示例 |
|------|------|
| **文件系统** | 文件读写、目录遍历 |
| **代码** | GitHub 集成、代码搜索 |
| **数据库** | SQLite、PostgreSQL、Redis |
| **搜索** | 网络搜索、文档检索 |
| **AI 工具** | 图像生成、TTS、STT |

### 技能服务器（27 个预设）

预配置的技能执行环境，覆盖 Web 自动化、数据分析、系统管理、代码审查等场景。

### 专家库（15 个预设）

常用开发工作流的即用型专家知识模板。

---

## 🧪 模型能力测试

### 测试维度

| 维度 | 图标 | 内容 |
|------|------|------|
| **编码** | 💻 | 算法实现、数据结构 |
| **推理** | 🧠 | 逻辑推理、多步推导 |
| **数学** | 🔢 | 数学计算、证明 |
| **创意写作** | ✍️ | 格式遵循、创意约束 |
| **指令遵循** | 📋 | 复杂指令遵从 |
| **工具使用** | 🛠️ | API 调用、结构化输出 |
| **多语言** | 🌐 | 跨语言理解 |
| **上下文** | 📚 | 长上下文保持、多轮对话 |

### 评分系统

- 每个维度 **10 分制**，总分 80 分
- **线性时间评分**：≤50% 时间 = 5 分，线性递减至上限时 2 分
- **正确系数**：多模式正则匹配，支持部分得分
- **快速测试**：每题上限 3 分钟
- **标准测试**：每题上限 12 分钟（难度更高）
- **多模态检测**：自动视觉/音频能力标签

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

## 📝 支持语言

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

### API 密钥池

- **去重** —— 重复密钥自动移除
- **并发上限** —— 单密钥最大 80 并发
- **自动轮换** —— 达到上限自动切换下一个密钥
- **故障转移** —— 401/403 密钥自动从池中移除
- **余额排序** —— 按剩余余额优先使用

---

## 🛠 开发指南

### 前置条件

- Node.js 20+
- npm 9+
- Windows x64

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18、TypeScript 5、Vite、Monaco Editor、xterm.js |
| 后端 | Express.js、TypeScript、WebSocket (ws)、Node.js |
| 桌面 | Electron 28 |
| 样式 | CSS Variables、深色/浅色主题 |
| 状态 | React Hooks、localStorage 持久化 |

### 构建命令

```bash
npm install           # 安装依赖
npm run build:all     # 构建前后端
npm run dev           # 开发模式
npx electron-builder --win dir  # 打包为 EXE
```

---

## 📋 更新日志

### v1.0.0（最新）
- ✅ 多模型协作对话，宏观调控智能调度
- ✅ 17 个预设提供商，API 池管理
- ✅ Monaco 编辑器 + 文件管理
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