# Mixture of Agents — Desktop

Multi-model collaborative agent system desktop version. Based on Electron, supports 17+ model providers.

![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)
![Electron](https://img.shields.io/badge/electron-43-47848f)
![Node](https://img.shields.io/badge/node.js-18+-339933)
![License](https://img.shields.io/badge/license-MIT-green)

## Core Features

- Multi-model collaboration with intelligent task scheduling
- 17+ providers: OpenAI, DeepSeek, MiMo, SiliconFlow, StepFun, etc.
- Capability testing: 8 standardized tests
- Cost control slider (efficiency vs cost)
- Standalone Electron desktop window
- API pool: up to 50 keys per provider with auto-failover
- Dark/Light theme: Codex-style UI

## Quick Start

### Option 1: Download portable exe (Recommended)

1. Go to Releases and download latest version
2. Extract the zip file
3. Double-click Mixture-of-Agents-1.0.0-portable.exe
4. No dependencies needed

### Option 2: Build from source

Prerequisites: Node.js 18+

```bash
git clone https://github.com/bauerelizabeth07139/Mixture-of-Agents-Desktop.git
cd Mixture-of-Agents-Desktop
build-release.bat
```

### Option 3: Development mode

```bash
cd backend && npm install && npx tsc
cd ../frontend && npm install
cd .. && npm install && npm run dev
```

## Configure API Key

Manage API Keys via the Web UI:

1. Go to Providers page
2. Select a provider (MiMo, OpenAI, DeepSeek, etc.)
3. Add your API Key
4. Click Fetch Models to discover available models

## MIMO API Key Test Results

| Model | Status | Description |
|-------|--------|-------------|
| mimo-v2.5 | Available | Full-modal model with reasoning |
| mimo-v2.5-pro | Available | Reasoning flagship model |
| mimo-v2.5-tts | Available | Text-to-Speech |
| mimo-v2.5-asr | Available | Speech recognition |

API endpoint: https://api.xiaomimimo.com/v1

## Preset Providers (17)

OpenAI, DeepSeek, Zhipu AI, Moonshot, SiliconFlow, StepFun, Volcengine, MiniMax, Qwen, Baidu, iFlytek, Baichuan, LingYiwanWu, Tencent, MiMo, Anthropic, Local/Ollama

## Tech Stack

- Frontend: React 18 + TypeScript + Vite
- Backend: Express + TypeScript + WebSocket
- Desktop: Electron 43
- Packaging: electron-builder (NSIS + Portable)

## Project Structure

```text
Mixture-of-Agents-Desktop/
├── main.cjs                 # Electron main process
├── package.json             # Root config + electron-builder
├── build-release.bat        # One-click build script
├── dev.bat                  # Dev mode launcher
├── backend/                 # Express backend
│   └── src/
│       ├── orchestrator/    # Scheduling engine
│       ├── providers/       # API pool management
│       ├── services/        # LLM client, testing
│       └── routes/          # API routes
├── frontend/                # React frontend
│   └── src/
│       ├── App.tsx          # Main UI
│       └── styles/          # Codex-style themes
└── release/                 # Build output
```

## License

MIT

## v2.0 更新
- 文件上传：+ 按钮和拖拽上传
- 并行测试：快速(~2min)和标准(~10min)
- 多模态眼睛：自动VLM图片描述
- API池：每URL独立池，自动剔除失效key
- 中文测试界面


### v2.1 更新
- 失败key轮转到池尾而非停用
- 新增音频能力测试（TTS/语音识别）
- 模型区分视觉/音频多模态能力


### v2.2 - 测试界面中文化
- 后端英文prompt给模型评测
- 前端界面全部中文显示
- 修复chat-1b测试


### v2.3 - 测试结果中文化
- 测试名称全部中文显示
- 测试结果描述全部中文


### v2.4 - 拖拽修复+输入框加高
