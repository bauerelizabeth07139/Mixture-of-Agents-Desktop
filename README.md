# Mixture of Agents — Desktop

Multi-model collaborative agent system desktop version. Based on Electron, supports 17+ model providers.

![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)
![Electron](https://img.shields.io/badge/electron-43-47848f)
![Node](https://img.shields.io/badge/node.js-18+-339933)
![License](https://img.shields.io/badge/license-MIT-green)

## Core Features

- **Multi-model collaboration** with intelligent task scheduling
- **17+ providers**: OpenAI, DeepSeek, MiMo, SiliconFlow, StepFun, etc.
- **Chat API** with file upload, drag-drop, and multimodal support
- **Capability testing**: Quick (~2min) and Standard (~10min) test suites
- **Model notes**: Pre-filled Chinese notes for 20+ popular models
- **Chat threads**: Create, rename, delete conversation history
- **Cost control slider** (efficiency vs cost)
- **Standalone Electron desktop window**
- **API pool**: up to 50 keys per provider, 25 pools max, auto-failover
- **Chinese testing UI**: All test names and details displayed in Chinese

## Quick Start

### Option 1: Download portable exe (Recommended)

1. Go to [Releases](../../releases) and download latest version
2. Extract the zip file
3. Double-click `Mixture-of-Agents.exe`
4. No dependencies needed

### Option 2: Build from source

```bash
npm install
npm run build:all
npm run pack
```

## Architecture

- **Backend**: Express.js + TypeScript — API pool, capability testing, orchestrator
- **Frontend**: React + Vite — Chat UI, model panel, testing dashboard
- **Desktop**: Electron — Standalone window, backend auto-start

## Recent Updates

- Added `/api/chat` route for end-to-end chat functionality
- Fixed file drag-drop and upload button
- Chinese test UI: all test names and evaluation details in Chinese
- Expanded model notes with vendor-specific annotations
- Improved DETAIL_CN mapping for test evaluation strings
