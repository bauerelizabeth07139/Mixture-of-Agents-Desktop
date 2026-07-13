# Mixture of Agents — Desktop

**基于 Claude Code 架构的多模型智能代理系统**

一个功能完整的 AI 桌面开发环境，集成多模型协作对话、代码编辑器、文件管理、终端、MCP/Skill 扩展系统，以及模型能力自动测试。支持 17+ 模型提供商，通过宏观调控模型智能调度子代理完成复杂任务。

![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)
![Electron](https://img.shields.io/badge/electron-28-47848f)
![Node](https://img.shields.io/badge/node.js-20+-339933)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 目录

- [核心特性](#核心特性)
- [快速开始](#快速开始)
- [功能详解](#功能详解)
- [架构说明](#架构说明)
- [扩展系统](#扩展系统)
- [模型能力测试](#模型能力测试)
- [开发指南](#开发指南)
- [更新日志](#更新日志)

---

## 核心特性

### 多模型协作对话
- **宏观调控模型**智能分析任务，自动分配子代理执行
- 支持全局思考强度调节（低/中/高/自动），自动模式由宏观模型决定子代理思考强度
- 调控模型和子代理思考强度独立配置
- 上下文压缩功能，长对话自动精简历史
- 对话历史本地持久化，支持多线程管理

### 代码编辑器（集成文件管理）
- **Monaco Editor**（VS Code 同款编辑器引擎）
- 内置文件树浏览器，支持右键菜单（新建、重命名、删除）
- 项目目录选择器，自由选择工作区位置
- 文件类型自动识别，新建文件时自动补全后缀（.py/.js/.ts/.html/.c/.cpp 等）
- **改动行高亮**：编辑时实时标记修改的行，显示变更行数
- 底部命令栏：直接在工作区执行 shell 命令，支持命令历史
- 一键运行文件（支持 Python/JavaScript/TypeScript/C/C++/Go/Rust/Java 等 15+ 语言）

### 模型提供商管理
- **17+ 预设提供商**：OpenAI、Anthropic、Google、Meta、DeepSeek、小米 MiMo、SiliconFlow、StepFun 等
- 每个提供商支持最多 50 个 API Key，自动轮询和故障转移
- 一键获取模型列表，自动探测模型能力（视觉/音频/多模态）
- 自定义提供商支持（任意 OpenAI 兼容 API）

### 模型能力测试
- **快速测试**（每维度 2 题，单题上限 3 分钟）和**标准测试**（每维度 2 题，单题上限 12 分钟）
- 8 个测试维度：编码、推理、数学、创意写作、指令遵循、工具使用、多语言、上下文处理
- 线性拟合评分：解题时间 50% 内满分，100% 为基准分，正确系数按正则匹配比例
- 10 分制评分，总分 80 分
- 自动检测模型多模态能力（视觉/音频），通过 API 测试图片和音频识别
- 测试结果实时同步到模型能力面板和提供商面板

### 扩展系统
- **MCP 服务器**：40+ 预设（文件系统、GitHub、数据库、搜索、AI 工具等）
- **技能服务器**：独立的技能执行环境，支持 stdio 和 HTTP 传输
- **技能库**：预设常用技能模板，支持自定义技能内容
- 所有扩展支持一键添加、测试、启用/禁用、删除

### 终端
- 内置 xterm.js 终端，支持命令历史和目录上下文
- 与编辑器工作区同步

### 界面特性
- 深色/浅色主题切换
- 文件拖放上传（支持图片、文本、代码文件）
- 多模态支持：图片附件自动识别，无视觉能力的模型自动路由到 VLM
- 响应式布局

---

## 快速开始

### 方式一：下载便携版（推荐）

1. 前往 [Releases](../../releases) 下载最新版本
2. 运行 `Mixture-of-Agents--portable.exe`
3. 无需安装任何依赖

### 方式二：下载安装版

1. 下载 `Mixture of Agents Setup 1.0.0.exe`
2. 运行安装程序，按提示完成安装
3. 从开始菜单启动

### 方式三：从源码构建

```bash
# 克隆仓库
git clone https://github.com/bauerelizabeth07139/Mixture-of-Agents-Desktop.git
cd Mixture-of-Agents-Desktop

# 安装依赖
npm install

# 构建前端和后端
npm run build:all

# 打包为 exe
npm run dist
```

### 开发模式

```bash
# 同时启动后端热重载、前端开发服务器、Electron 窗口
npm run dev
```

---

## 功能详解

### 1. 添加模型提供商

1. 打开**提供商**面板
2. 点击预设提供商卡片（如 OpenAI、DeepSeek、MiMo 等）添加
3. 输入 API Key（支持批量添加，每行一个）
4. 点击**获取模型**自动拉取可用模型列表
5. 系统自动探测模型能力标签（LLM/VLM/视觉/音频/TTS/STT）

### 2. 开始对话

1. 在聊天界面输入消息
2. 选择使用的模型（顶部设置栏）
3. 调节思考强度和成本效率滑块
4. 支持拖放图片和文件作为上下文
5. 宏观调控模型自动分析任务并调度子代理

### 3. 使用编辑器

1. 点击**编辑器**选项卡
2. 点击顶部**选择目录**设置工作区
3. 左侧文件树浏览和管理文件
4. 点击文件在 Monaco 编辑器中打开
5. 底部命令栏输入 shell 命令执行
6. 点击**运行**按钮一键执行当前文件

### 4. 运行代码项目

编辑器支持直接运行以下语言的文件：

| 语言 | 扩展名 | 运行方式 |
|------|--------|----------|
| Python | .py | python |
| JavaScript | .js | node |
| TypeScript | .ts | npx ts-node |
| C | .c | gcc 编译后执行 |
| C++ | .cpp/.cc | g++ 编译后执行 |
| Go | .go | go run |
| Rust | .rs | rustc 编译后执行 |
| Java | .java | javac + java |
| Ruby | .rb | ruby |
| PHP | .php | php |
| Shell | .sh | bash |
| PowerShell | .ps1 | powershell |

### 5. 模型能力测试

1. 打开**测试**面板
2. 选择**快速测试**（约 2 分钟/模型）或**标准测试**（约 12 分钟/模型）
3. 支持单个模型测试、按提供商测试、全部模型测试
4. 测试结果自动同步到模型能力面板
5. 同名模型自动绑定为同一模型，共享测试结果

### 6. 扩展管理

1. 打开**扩展**面板
2. **MCP 服务器**：添加文件系统、GitHub、数据库、搜索等工具
3. **技能服务器**：添加独立的技能执行环境
4. **技能**：管理预设和自定义技能内容
5. 所有扩展支持测试连接和启用/禁用

---

## 架构说明

```
Mixture-of-Agents-Desktop/
├── backend/                 # Express.js + TypeScript 后端
│   └── src/
│       ├── index.ts         # 服务入口（端口 3001）
│       ├── routes/
│       │   ├── chat.ts      # 对话 API + 上下文压缩
│       │   ├── coding.ts    # 代码执行 + 文件管理 + 终端
│       │   ├── providers.ts # 提供商管理 + API 池
│       │   ├── testing.ts   # 模型能力测试
│       │   ├── extensions.ts # MCP/Skill 扩展管理
│       │   ├── models.ts    # 模型注册表
│       │   └── projects.ts  # 项目管理
│       ├── services/
│       │   ├── coding-engine.ts  # AI 代码生成引擎
│       │   ├── file-runner.ts    # 多语言文件执行器
│       │   ├── llm-client.ts     # LLM API 客户端
│       │   ├── price-fetcher.ts  # 价格查询
│       │   └── extensions/       # 扩展管理器 + 预设
│       └── orchestrator/         # 宏观调控 + 子代理调度
├── frontend/                # React + Vite 前端
│   └── src/
│       ├── App.tsx          # 主应用（聊天、面板、设置）
│       ├── components/
│       │   ├── Editor.tsx   # 编辑器（集成文件管理 + 命令栏）
│       │   ├── Terminal.tsx # xterm.js 终端
│       │   └── Environment.tsx # 环境信息面板
│       └── services/
│           └── api.ts       # API 客户端
├── electron/                # Electron 主进程
├── release/                 # 打包输出
│   ├── Mixture-of-Agents--portable.exe  # 便携版
│   └── Mixture of Agents Setup 1.0.0.exe # 安装版
└── package.json             # 根配置
```

---

## 扩展系统

### MCP 服务器预设（40+）

| 分类 | 预设 |
|------|------|
| 工具 | Filesystem、GitHub、Fetch、Git、Puppeteer |
| 搜索 | Brave Search、Exa、Tavily、SearXNG |
| 数据库 | SQLite、PostgreSQL、MySQL、Redis、MongoDB |
| 云存储 | AWS S3、Supabase |
| 监控 | Sentry |
| 通讯 | Slack、Linear |
| 测试 | Everything、Playwright |
| 安全 | npm-audit、Snyk |
| 部署 | Vercel、Netlify、Terraform |
| 数据 | CSV、Excel、PDF |
| AI | LangChain、RAG、Embedding |
| 媒体 | Image、Video |
| 通讯 | Email、Telegram、Discord |

### 技能服务器

与 MCP 服务器同级的独立扩展，支持自定义技能执行环境。预设包含代码审查、文档生成、测试生成等常用开发技能。

### 自定义扩展

支持手动添加任意 MCP 服务器或技能，填写名称、传输方式（stdio/SSE/HTTP）、命令或 URL 即可。

---

## 模型能力测试

### 测试维度

| 维度 | 快速测试 | 标准测试 | 满分 |
|------|----------|----------|------|
| 编码 | 2 题 | 2 题 | 10 |
| 推理 | 2 题 | 2 题 | 10 |
| 数学 | 2 题 | 2 题 | 10 |
| 创意写作 | 2 题 | 2 题 | 10 |
| 指令遵循 | 2 题 | 2 题 | 10 |
| 工具使用 | 2 题 | 2 题 | 10 |
| 多语言 | 2 题 | 2 题 | 10 |
| 上下文处理 | 2 题 | 2 题 | 10 |
| **总分** | | | **80** |

### 评分规则

- 每题满分 5 分，每维度满分 10 分
- 基础分 2 分（解出即得）
- 时间系数：解题时间 ≤ 上限 50% → 系数 1.0（满分）；时间 = 上限 → 系数 0.4（基准分）
- 正确系数：按答案正则匹配比例计算
- 最终得分 = 基础分 + (满分 - 基础分) × 时间系数 × 正确系数

### 多模态能力检测

- **视觉能力**：向模型发送测试图片，检测是否能正确描述图片内容
- **音频能力**：向模型发送测试音频，检测是否能正确识别音频内容
- 检测结果以标签形式显示在提供商面板和模型列表中

---

## 开发指南

### 环境要求

- Node.js 20+
- npm 10+
- Windows 10/11 x64

### 开发命令

```bash
# 开发模式（热重载）
npm run dev

# 构建后端
npm run build:backend

# 构建前端
npm run build:frontend

# 构建全部
npm run build:all

# 打包便携版 exe
npm run dist

# 打包目录（不生成 exe）
npm run pack
```

### API 端点

| 路径 | 方法 | 说明 |
|------|------|------|
| /api/chat | POST | 发送对话消息 |
| /api/providers | GET | 获取所有提供商 |
| /api/providers/presets | GET | 获取提供商预设 |
| /api/coding/execute | POST | 执行编码任务 |
| /api/coding/shell | POST | 执行 shell 命令 |
| /api/coding/run-file | POST | 运行代码文件 |
| /api/coding/browse | POST | 浏览文件系统 |
| /api/testing/:pid/models/:mid/test-quick | POST | 快速测试模型 |
| /api/testing/:pid/models/:mid/test-full | POST | 标准测试模型 |
| /api/extensions/mcp | GET | 获取 MCP 服务器列表 |
| /api/extensions/skills | GET | 获取技能列表 |
| /api/extensions/skill-servers | GET | 获取技能服务器列表 |

---

## 更新日志

### v1.0.0 (2026-07-13)

**新功能**
- 编辑器集成文件管理器，支持项目目录选择、文件树浏览、右键菜单
- 编辑器底部命令栏，支持 shell 命令执行和命令历史
- 改动行高亮，实时标记编辑的行
- 模型能力自动测试（8 维度，10 分制）
- 多模态能力检测（视觉/音频）
- 扩展系统（MCP 服务器/技能服务器/技能库，40+ 预设）
- 深色/浅色主题切换
- 对话历史多线程管理
- 全局思考强度调节（低/中/高/自动）

**修复**
- 编码引擎使用 cmd.exe 替代 PowerShell，避免特殊字符解析问题
- npm install EBUSY 错误自动重试（指数退避 + 缓存清理）
- 项目入口点自动检测（npm run dev 失败时自动尝试其他入口）
- 同名模型自动绑定，共享测试结果
- 扩展面板按钮和标签全部接通

---

## 许可证

MIT License
