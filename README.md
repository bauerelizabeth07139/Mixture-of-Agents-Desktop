<div align="center">

<a id="top"></a>

# ⚛️ Mixture of Agents — Desktop

### Intelligent Multi-Model Agent System · Built on Claude Code Architecture

<br>

![Platform](https://img.shields.io/badge/Platform-Windows%20x64-blue?style=for-the-badge&logo=windows&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-28-47848f?style=for-the-badge&logo=electron&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-00ff00?style=for-the-badge)

<br>

A full-featured AI development desktop environment with multi-model collaboration, code editing, file management, terminal, MCP/Skill extensions, and automated model testing.

For the Web version → [**Mixture-of-Agents**](https://github.com/bauerelizabeth07139/Mixture-of-Agents)

**[English](#top) · [中文版](#chinese-doc)**

</div>

---

<a id="toc"></a>

## 📑 Table of Contents

| Section | Description |
|:--------|:------------|
| [✨ Features](#features) | Chat, editor, providers, testing, extensions |
| [🚀 Quick Start](#quickstart) | Download or build from source |
| [📸 Screenshots](#screenshots) | Visual overview |
| [🏗 Architecture](#architecture) | Project structure, orchestration flow |
| [🧩 Extensions](#extensions) | MCP, Skills, Expert library |
| [🧪 Testing](#testing) | 8-dimension model benchmarking |
| [📝 Editor](#editor) | Monaco editor features |
| [💻 Languages](#languages) | 14 supported languages |
| [⚙️ Config](#config) | Environment, API pool |
| [🛠 Dev](#dev) | Prerequisites, build commands |
| [📋 Changelog](#changelog) | Version history |

---

<a id="features"></a>

## ✨ Features

<br>

### 🤖 Multi-Model Collaborative Chat

> The orchestrator analyzes tasks, creates plans, then dispatches sub-agents — each potentially using a different model.

- **Plan → Act → Observe → Replan** loop (up to 12 rounds) — same core as Claude Code / Codex
- **Global thinking intensity**: `Low` / `Medium` / `High` / `Auto`
- Orchestrator and sub-agent thinking strength configured independently
- **Stateless verification sub-agents** check project completeness
- **Context compression** — DeepSeek-style cache-friendly message formatting
- Local conversation persistence with multi-thread management

---

### 📝 Code Editor

> Monaco Editor (same engine as VS Code) with integrated file management.

- Built-in file tree with right-click context menu (New / Rename / Delete)
- **Project directory selector** — choose any workspace location
- **Smart file creation** — auto-appends correct file extension
- **Change highlighting** — real-time visual markers on modified lines
- Bottom command bar for shell execution with history
- One-click file runner supporting 14+ languages

---

### 🔌 Provider & Model Management

> 17 preset providers with intelligent API pool management.

| Provider | Provider | Provider |
|:---------|:---------|:---------|
| OpenAI | DeepSeek | Zhipu AI |
| Moonshot | SiliconFlow | StepFun |
| Volcengine | MiniMax | Qwen |
| Baidu | iFlytek | Baichuan |
| LingYiwanWu | Tencent | MiMo |
| Anthropic | Local/Ollama | |

- Up to 50 API keys per provider with automatic round-robin
- **Concurrency control** — max 80 concurrent requests per key
- Rate limit handling (429/401/403) with automatic key rotation
- One-click model fetch with capability detection (Vision / Audio / Multimodal)

---

### 🧪 Model Capability Testing

> Automated benchmarking across 8 dimensions.

- **Quick Test** (~3 min) and **Standard Test** (~12 min)
- **8 dimensions**: Coding, Reasoning, Math, Creative Writing, Instruction Following, Tool Use, Multilingual, Context
- **10-point scale** with time-based scoring and correctness coefficients
- Automatic multimodal detection (Vision / Audio)

---

### 🧩 Extension System

| Category | Count | Highlights |
|:---------|:------|:-----------|
| **MCP Servers** | 28 presets | Filesystem, GitHub, Database, Search, AI Tools |
| **Skill Servers** | 27 presets | Web automation, data analysis, system management |
| **Expert Library** | 15 presets | Development workflow templates |

---

### 🏗 Agent Orchestration

> Inspired by Claude Code, Codex, Trae, OpenHands, Cline, and OpenSpec.

- Sub-agents can use **different models** for different task types
- Task verification loop — orchestrators assign stateless sub-agents to check completion
- Automatic error recovery and retry (up to 10 rounds)

---

<a id="quickstart"></a>

## 🚀 Quick Start

### Option 1: Download Portable (Recommended)

1. Go to [Releases](../../releases) and download the latest Windows x64 package
2. Extract and run `Mixture of Agents.exe`
3. No installation required

### Option 2: Download Installer

1. Download `Mixture of Agents Setup 1.0.0.exe`
2. Run the installer and follow the prompts
3. Launch from Start Menu

### Option 3: Build from Source

```bash
git clone https://github.com/bauerelizabeth07139/Mixture-of-Agents-Desktop.git
cd Mixture-of-Agents-Desktop
npm install
npm run build:all
npx electron-builder --win dir
# EXE → release/win-unpacked/
```

### Development Mode

```bash
npm run dev
```

---

<a id="screenshots"></a>

## 📸 Screenshots

| Chat | Providers | Models |
|:----:|:---------:|:------:|
| Multi-model chat | 17+ providers | Capability overview |
| Orchestrator dispatch | Auto detection | 10-point scores |

| Testing | Editor | Extensions |
|:-------:|:------:|:----------:|
| 8-dimension test | Monaco editor | MCP / Skills |
| Multimodal detection | File tree + terminal | Expert library |

---

<a id="architecture"></a>

## 🏗 Architecture

```
Mixture-of-Agents-Desktop/
├── frontend/                     # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx               # Main application
│   │   ├── components/           # Chat, Editor, FileTree, Terminal
│   │   ├── services/api.ts       # API client (SSE)
│   │   └── types.ts
│   ├── electron-main.cjs         # Electron main process
│   └── dist/                     # Built frontend
│
├── backend/                      # Express.js + TypeScript
│   ├── src/
│   │   ├── index.ts              # Server entry
│   │   ├── providers/            # API pool + 17 presets
│   │   ├── routes/               # REST + SSE endpoints
│   │   └── services/             # LLM client, project service
│   ├── public/                   # Static frontend
│   ├── data/                     # Runtime data
│   └── dist/                     # Compiled TypeScript
│
├── package.json
└── README.md
```

### Orchestration Flow

```
┌──────────────────────────────────────────────────────────┐
│                    USER SENDS MESSAGE                     │
└──────────────────────┬───────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────┐
│  1. THINK    Orchestrator creates plan                    │
│  2. ACT      Write files, run commands                    │
│  3. OBSERVE  Check errors, capture output                 │
│  4. FIX      Generate targeted fixes                      │
│  5. REPEAT   Loop (up to 12 rounds)                       │
└──────────────────────┬───────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────┐
│  VERIFY → FIX → DONE                                     │
│  Auto-install → Auto-serve → Open browser                 │
└──────────────────────────────────────────────────────────┘
```

---

<a id="extensions"></a>

## 🧩 Extension System

### MCP Servers (28 presets)

| Category | Servers |
|:---------|:--------|
| **Filesystem** | Read/write, directory traversal |
| **Code** | GitHub, code search, git |
| **Database** | SQLite, PostgreSQL, Redis, MongoDB |
| **Search** | Web search, document retrieval |
| **AI Tools** | Image gen, TTS, STT, translation |

### Skill Servers (27 presets)

Independent skill execution environments for web automation, data analysis, system management, and more.

### Expert Library (15 presets)

Pre-configured expert knowledge templates for common workflows.

---

<a id="testing"></a>

## 🧪 Model Testing

### Dimensions

| Dimension | Icon | Content |
|:----------|:-----|:--------|
| Coding | 💻 | Algorithms, data structures |
| Reasoning | 🧠 | Logic, multi-step deduction |
| Math | 🔢 | Computation, proofs |
| Creative Writing | ✍️ | Format, creative constraints |
| Instruction Following | 📋 | Complex instructions |
| Tool Use | 🛠️ | API calls, structured output |
| Multilingual | 🌐 | Cross-language understanding |
| Context | 📚 | Long context, multi-turn |

### Scoring

| Parameter | Value |
|:----------|:------|
| Per dimension | **10 pts** (2 × 5) |
| Total | **80 pts** |
| Quick limit | 3 min/question |
| Standard limit | 12 min/question |
| Time scoring | ≤50% → 5pts, linear → 2pts at 100% |
| Correctness | Multi-regex, partial credit |

---

<a id="editor"></a>

## 📝 Code Editor

| Feature | Description |
|:--------|:------------|
| **Monaco Engine** | VS Code editor, full IntelliSense |
| **File Tree** | Browse, create, rename, delete |
| **Smart Templates** | 14-language auto-fill |
| **Change Highlighting** | Visual markers on modified lines |
| **Command Bar** | Shell execution from workspace |
| **One-Click Run** | Run any supported file |
| **Project Selector** | Choose workspace root |

---

<a id="languages"></a>

## 💻 Supported Languages

| Language | Extension | Runner |
|:---------|:----------|:-------|
| Python | `.py` | `python` |
| JavaScript | `.js` | `node` |
| TypeScript | `.ts` | `npx tsx` |
| C | `.c` | `gcc` |
| C++ | `.cpp` | `g++` |
| Go | `.go` | `go run` |
| Rust | `.rs` | `rustc` |
| Java | `.java` | `javac` + `java` |
| Ruby | `.rb` | `ruby` |
| Shell | `.sh` | `bash` |
| HTML | `.html` | Browser |
| CSS | `.css` | — |
| JSON | `.json` | — |
| Markdown | `.md` | — |

---

<a id="config"></a>

## ⚙️ Configuration

### API Key Pool

| Feature | Behavior |
|:--------|:---------|
| **Deduplication** | Duplicate keys removed |
| **Concurrency** | Max 80 per key |
| **Auto-rotation** | Switch on limit |
| **Failover** | 401/403 removed |
| **Balance sorting** | Remaining quota first |

---

<a id="dev"></a>

## 🛠 Development

### Prerequisites

- Node.js 20+, npm 9+, Windows x64

### Tech Stack

| Layer | Technology |
|:------|:-----------|
| Frontend | React 18, TypeScript 5, Vite, Monaco, xterm.js |
| Backend | Express.js, TypeScript, WebSocket (ws) |
| Desktop | Electron 28 |
| Styling | CSS Variables, dark/light themes |

### Commands

```bash
npm install           # Install deps
npm run build:all     # Build all
npm run dev           # Dev mode
npx electron-builder --win dir  # Package EXE
```

---

<a id="changelog"></a>

## 📋 Changelog

### v1.0.0 — Latest

| Feature | Status |
|:--------|:------:|
| Multi-model chat with orchestrator | ✅ |
| Plan → Act → Observe → Replan | ✅ |
| Stateless verification sub-agents | ✅ |
| 17 providers with API pool | ✅ |
| Monaco editor + file management | ✅ |
| 14-language code execution | ✅ |
| 8-dimension testing (10-point) | ✅ |
| 28 MCP + 27 Skill + 15 Expert | ✅ |
| Multimodal detection | ✅ |
| Context compression | ✅ |
| Dark / Light theme | ✅ |
| Portable + Installer EXE | ✅ |

---

<div align="center">

**Web version → [Mixture-of-Agents](https://github.com/bauerelizabeth07139/Mixture-of-Agents)**

[⬆ Back to Top](#top)

</div>

---
---

<a id="chinese-doc"></a>

# ⚛️ Mixture of Agents — Desktop

### 基于 Claude Code 架构的多模型智能代理桌面系统

<br>

![Platform](https://img.shields.io/badge/Platform-Windows%20x64-blue?style=for-the-badge&logo=windows&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-28-47848f?style=for-the-badge&logo=electron&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-00ff00?style=for-the-badge)

<br>

全功能 AI 开发桌面环境，支持多模型协作、代码编辑、文件管理、终端、MCP/Skill 扩展和自动模型测试。

Web 版 → [**Mixture-of-Agents**](https://github.com/bauerelizabeth07139/Mixture-of-Agents)

**[English](#top) · [中文版](#chinese-doc)**

---

### 📑 目录

| 章节 | 说明 |
|:-----|:-----|
| [✨ 核心特性](#zh-features) | 对话、编辑器、提供商、测试、扩展 |
| [🚀 快速开始](#zh-quickstart) | 下载或从源码构建 |
| [📸 截图预览](#zh-screenshots) | 界面概览 |
| [🏗 架构说明](#zh-architecture) | 项目结构、编排流程 |
| [🧩 扩展系统](#zh-extensions) | MCP、技能、专家库 |
| [🧪 模型测试](#zh-testing) | 8 维度基准测试 |
| [📝 编辑器](#zh-editor) | Monaco 编辑器功能 |
| [💻 支持语言](#zh-languages) | 14 种编程语言 |
| [⚙️ 配置说明](#zh-config) | 环境变量、API 池 |
| [🛠 开发指南](#zh-dev) | 前置条件、构建命令 |
| [📋 更新日志](#zh-changelog) | 版本历史 |

---

<a id="zh-features"></a>

## ✨ 核心特性

<br>

### 🤖 多模型协作对话

> 宏观调控模型分析任务，制定计划，分配子代理执行——每个子代理可使用不同的模型。

- **计划→执行→观察→重规划** 循环（最多 12 轮）—— 与 Claude Code / Codex 核心一致
- **全局思考强度**：`低` / `中` / `高` / `自动`
- 调控模型和子代理思考强度独立配置
- **无记忆验证代理** 检查项目完整性
- **上下文压缩** —— DeepSeek 风格缓存友好消息格式
- 本地对话持久化，多线程管理

---

### 📝 代码编辑器

> Monaco 编辑器（与 VS Code 相同引擎），集成文件管理。

- 内置文件树，右键菜单（新建/重命名/删除）
- **项目目录选择器** —— 选择任意工作区位置
- **智能文件创建** —— 自动追加正确扩展名
- **改动高亮** —— 修改行的实时可视化标记
- 底部命令栏，支持 shell 执行与历史
- 一键运行，支持 14+ 种语言

---

### 🔌 提供商与模型管理

> 17 个预设提供商，智能 API 池管理。

| 提供商 | 提供商 | 提供商 |
|:-------|:-------|:-------|
| OpenAI | DeepSeek | 智谱AI |
| Moonshot | SiliconFlow | StepFun |
| 火山引擎 | MiniMax | 通义千问 |
| 百度 | 讯飞 | 百川 |
| 零一万物 | 腾讯 | MiMo |
| Anthropic | 本地/Ollama | |

- 每个提供商最多 50 个 API 密钥，自动轮换
- **并发控制** —— 单密钥最大 80 并发
- 429/401/403 速率限制自动处理
- 一键获取模型列表并探测能力（视觉/音频/多模态）

---

### 🧪 模型能力测试

> 跨 8 个维度的自动基准测试。

- **快速测试**（~3 分钟）和 **标准测试**（~12 分钟）
- **8 个维度**：编码、推理、数学、创意写作、指令遵循、工具使用、多语言、上下文
- **10 分制评分**，时间拟合 + 正确系数
- 自动多模态检测（视觉/音频）

---

### 🧩 扩展系统

| 类别 | 数量 | 亮点 |
|:-----|:-----|:-----|
| **MCP 服务器** | 28 个预设 | 文件系统、GitHub、数据库、搜索、AI 工具 |
| **技能服务器** | 27 个预设 | Web 自动化、数据分析、系统管理 |
| **专家库** | 15 个预设 | 开发工作流模板 |

---

### 🏗 智能代理编排

> 参考 Claude Code、Codex、Trae、OpenHands、Cline、OpenSpec 设计。

- 子代理可使用 **不同模型** 执行不同任务类型
- 任务验证循环 —— 分配无记忆子代理检查完成度
- 自动错误恢复与重试（最多 10 轮）

---

<a id="zh-quickstart"></a>

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
# EXE → release/win-unpacked/
```

### 开发模式

```bash
npm run dev
```

---

<a id="zh-screenshots"></a>

## 📸 截图预览

| 对话 | 提供商 | 模型 |
|:----:|:------:|:----:|
| 多模型协作对话 | 17+ 预设提供商 | 能力总览 |
| 调控模型分配 | 自动检测 | 10 分制评分 |

| 测试 | 编辑器 | 扩展 |
|:----:|:------:|:----:|
| 8 维度测试 | Monaco 编辑器 | MCP / 技能 |
| 多模态检测 | 文件树 + 终端 | 专家库 |

---

<a id="zh-architecture"></a>

## 🏗 架构说明

```
Mixture-of-Agents-Desktop/
├── frontend/                     # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx               # 主应用
│   │   ├── components/           # 聊天、编辑器、文件树、终端
│   │   ├── services/api.ts       # API 客户端（SSE）
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
│   ├── public/                   # 静态前端
│   ├── data/                     # 运行时数据
│   └── dist/                     # 编译后 TypeScript
│
├── package.json
└── README.md
```

### 编排流程

```
┌──────────────────────────────────────────────────────────┐
│                      用户发送消息                          │
└──────────────────────┬───────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────┐
│  1. 思考    调控模型创建计划                               │
│  2. 执行    写入文件、运行命令                              │
│  3. 观察    检查错误、捕获输出                              │
│  4. 修复    有针对性地修复错误                              │
│  5. 重复    循环（最多 12 轮）                              │
└──────────────────────┬───────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────┐
│  验证 → 修复 → 完成                                       │
│  自动安装 → 自动启动 → 打开浏览器                           │
└──────────────────────────────────────────────────────────┘
```

---

<a id="zh-extensions"></a>

## 🧩 扩展系统

### MCP 服务器（28 个预设）

| 类别 | 服务器 |
|:-----|:-------|
| **文件系统** | 读写、目录遍历 |
| **代码** | GitHub、代码搜索、git |
| **数据库** | SQLite、PostgreSQL、Redis、MongoDB |
| **搜索** | 网络搜索、文档检索 |
| **AI 工具** | 图像生成、TTS、STT、翻译 |

### 技能服务器（27 个预设）

预配置技能执行环境，覆盖 Web 自动化、数据分析、系统管理等场景。

### 专家库（15 个预设）

常用开发工作流的即用型专家知识模板。

---

<a id="zh-testing"></a>

## 🧪 模型能力测试

### 维度

| 维度 | 图标 | 内容 |
|:-----|:-----|:-----|
| 编码 | 💻 | 算法、数据结构 |
| 推理 | 🧠 | 逻辑、多步推导 |
| 数学 | 🔢 | 计算、证明 |
| 创意写作 | ✍️ | 格式、创意约束 |
| 指令遵循 | 📋 | 复杂指令 |
| 工具使用 | 🛠️ | API 调用、结构化输出 |
| 多语言 | 🌐 | 跨语言理解 |
| 上下文 | 📚 | 长上下文、多轮 |

### 评分

| 参数 | 值 |
|:-----|:---|
| 每维度 | **10 分**（2 × 5） |
| 总分 | **80 分** |
| 快速时限 | 3 分钟/题 |
| 标准时限 | 12 分钟/题 |
| 时间评分 | ≤50% → 5分，线性 → 2分 |
| 正确系数 | 多正则匹配，部分得分 |

---

<a id="zh-editor"></a>

## 📝 代码编辑器

| 功能 | 描述 |
|:-----|:-----|
| **Monaco 引擎** | VS Code 编辑器 |
| **文件树** | 浏览、创建、重命名、删除 |
| **智能模板** | 14 种语言自动填充 |
| **改动高亮** | 修改行可视化标记 |
| **命令栏** | 工作区 shell 执行 |
| **一键运行** | 运行任何支持的文件 |
| **项目选择器** | 选择工作区根目录 |

---

<a id="zh-languages"></a>

## 💻 支持语言

| 语言 | 扩展名 | 运行方式 |
|:-----|:-------|:---------|
| Python | `.py` | `python` |
| JavaScript | `.js` | `node` |
| TypeScript | `.ts` | `npx tsx` |
| C | `.c` | `gcc` |
| C++ | `.cpp` | `g++` |
| Go | `.go` | `go run` |
| Rust | `.rs` | `rustc` |
| Java | `.java` | `javac` + `java` |
| Ruby | `.rb` | `ruby` |
| Shell | `.sh` | `bash` |
| HTML | `.html` | 浏览器 |
| CSS | `.css` | — |
| JSON | `.json` | — |
| Markdown | `.md` | — |

---

<a id="zh-config"></a>

## ⚙️ 配置说明

### API 密钥池

| 功能 | 行为 |
|:-----|:-----|
| **去重** | 重复密钥自动移除 |
| **并发** | 单密钥最大 80 并发 |
| **自动轮换** | 达到上限切换 |
| **故障转移** | 401/403 自动移除 |
| **余额排序** | 剩余额度优先 |

---

<a id="zh-dev"></a>

## 🛠 开发指南

### 前置条件

Node.js 20+、npm 9+、Windows x64

### 技术栈

| 层级 | 技术 |
|:-----|:-----|
| 前端 | React 18、TypeScript 5、Vite、Monaco、xterm.js |
| 后端 | Express.js、TypeScript、WebSocket (ws) |
| 桌面 | Electron 28 |
| 样式 | CSS Variables、深色/浅色主题 |

### 构建命令

```bash
npm install           # 安装依赖
npm run build:all     # 构建全部
npm run dev           # 开发模式
npx electron-builder --win dir  # 打包 EXE
```

---

<a id="zh-changelog"></a>

## 📋 更新日志

### v1.0.0 — 最新

| 功能 | 状态 |
|:-----|:----:|
| 多模型协作对话 | ✅ |
| 计划→执行→观察→重规划 | ✅ |
| 无记忆验证子代理 | ✅ |
| 17 个提供商 API 池 | ✅ |
| Monaco 编辑器 | ✅ |
| 14 种语言执行引擎 | ✅ |
| 8 维度测试（10 分制） | ✅ |
| 28 MCP + 27 Skill + 15 专家 | ✅ |
| 多模态检测 | ✅ |
| 上下文压缩 | ✅ |
| 深色/浅色主题 | ✅ |
| 便携版 + 安装版 EXE | ✅ |

---

<div align="center">

**Web 版 → [Mixture-of-Agents](https://github.com/bauerelizabeth07139/Mixture-of-Agents)**

[⬆ 返回顶部](#top)

</div>