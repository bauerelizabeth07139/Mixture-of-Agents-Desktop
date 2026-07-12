import { McpPreset, SkillPreset, SkillServerPreset } from '../../types';

export const MCP_PRESETS: McpPreset[] = [
  // === 工具类 ===
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: '文件系统读写操作，支持创建、编辑、删除文件和目录',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    category: '工具',
    icon: '📂',
    npmPackage: '@modelcontextprotocol/server-filesystem',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub仓库管理，Issues、PR、代码搜索等',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    category: '工具',
    icon: '🐙',
    npmPackage: '@modelcontextprotocol/server-github',
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'HTTP请求工具，支持GET/POST/PUT/DELETE等',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    category: '工具',
    icon: '🌐',
    npmPackage: '@modelcontextprotocol/server-fetch',
  },
  {
    id: 'git',
    name: 'Git',
    description: 'Git版本控制操作，提交、分支、日志、差异对比',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    category: '工具',
    icon: '🔀',
    npmPackage: '@modelcontextprotocol/server-git',
  },
  {
    id: 'everything',
    name: 'Everything',
    description: 'MCP功能测试服务器，包含所有核心功能示例',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
    category: '测试',
    icon: '⭐',
    npmPackage: '@modelcontextprotocol/server-everything',
  },
  // === 搜索类 ===
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: '网络搜索，获取实时互联网信息',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    category: '搜索',
    icon: '🔍',
    npmPackage: '@modelcontextprotocol/server-brave-search',
  },
  {
    id: 'exa',
    name: 'Exa Search',
    description: 'Exa AI搜索引擎，语义搜索和内容获取',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'exa-mcp-server'],
    env: { EXA_API_KEY: '' },
    category: '搜索',
    icon: '🔎',
    npmPackage: 'exa-mcp-server',
  },
  {
    id: 'tavily',
    name: 'Tavily Search',
    description: 'Tavily AI搜索API，专为AI代理优化的实时网络搜索',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'tavily-mcp@latest'],
    env: { TAVILY_API_KEY: '' },
    category: '搜索',
    icon: '🌍',
    npmPackage: 'tavily-mcp',
  },
  {
    id: 'searxng',
    name: 'SearXNG',
    description: '开源元搜索引擎，聚合多个搜索引擎结果',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'searxng-mcp'],
    env: { SEARXNG_URL: 'http://localhost:8888' },
    category: '搜索',
    icon: '🕵️',
    npmPackage: 'searxng-mcp',
  },
  // === 数据库类 ===
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'SQLite数据库操作，支持查询、创建表等',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', 'memory.db'],
    category: '数据库',
    icon: '🗃️',
    npmPackage: '@modelcontextprotocol/server-sqlite',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'PostgreSQL数据库连接和操作',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: { DATABASE_URL: '' },
    category: '数据库',
    icon: '🐘',
    npmPackage: '@modelcontextprotocol/server-postgres',
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: 'MySQL数据库连接和SQL执行',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@benborla29/mcp-server-mysql'],
    env: { MYSQL_HOST: 'localhost', MYSQL_PORT: '3306', MYSQL_USER: 'root', MYSQL_PASS: '', MYSQL_DB: '' },
    category: '数据库',
    icon: '🐬',
    npmPackage: '@benborla29/mcp-server-mysql',
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'Redis缓存数据库操作，键值读写、发布订阅',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-redis'],
    env: { REDIS_URL: 'redis://localhost:6379' },
    category: '数据库',
    icon: '🔴',
    npmPackage: '@modelcontextprotocol/server-redis',
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'MongoDB文档数据库操作，CRUD和聚合查询',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mongodb-mcp-server'],
    env: { MDB_MCP_CONNECTION_STRING: 'mongodb://localhost:27017' },
    category: '数据库',
    icon: '🍃',
    npmPackage: 'mongodb-mcp-server',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Supabase后端即服务，数据库、认证、存储',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase@latest'],
    env: { SUPABASE_ACCESS_TOKEN: '' },
    category: '数据库',
    icon: '⚡',
    npmPackage: '@supabase/mcp-server-supabase',
  },
  // === 浏览器类 ===
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: '浏览器自动化，网页截图、PDF生成、爬虫',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    category: '浏览器',
    icon: '🎭',
    npmPackage: '@modelcontextprotocol/server-puppeteer',
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Playwright浏览器自动化，跨浏览器测试',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    category: '浏览器',
    icon: '🎪',
    npmPackage: '@playwright/mcp',
  },
  // === 推理/存储 ===
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: '链式思维工具，增强模型推理能力',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    category: '推理',
    icon: '🔗',
    npmPackage: '@modelcontextprotocol/server-sequential-thinking',
  },
  {
    id: 'memory',
    name: 'Memory',
    description: '持久化记忆存储，基于知识图谱的长期记忆',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    category: '存储',
    icon: '🧠',
    npmPackage: '@modelcontextprotocol/server-memory',
  },
  // === 文档/协作 ===
  {
    id: 'context7',
    name: 'Context7',
    description: '实时文档获取，获取最新框架和库文档',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp@latest'],
    category: '文档',
    icon: '📚',
    npmPackage: '@upstash/context7-mcp',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Notion工作区管理，页面读写、数据库查询',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/notion-mcp-server@latest'],
    env: { NOTION_API_KEY: '' },
    category: '协作',
    icon: '📝',
    npmPackage: '@anthropic/notion-mcp-server',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Slack消息和频道管理，发送消息、搜索历史',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/slack-mcp-server@latest'],
    env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' },
    category: '协作',
    icon: '💬',
    npmPackage: '@anthropic/slack-mcp-server',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Google Drive文件管理，搜索、读取、创建文档',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/google-drive-mcp-server@latest'],
    env: { GOOGLE_APPLICATION_CREDENTIALS: '' },
    category: '协作',
    icon: '📁',
    npmPackage: '@anthropic/google-drive-mcp-server',
  },
  // === 设计/媒体 ===
  {
    id: 'figma',
    name: 'Figma',
    description: 'Figma设计文件访问和操作',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/figma-mcp-server@latest'],
    env: { FIGMA_ACCESS_TOKEN: '' },
    category: '设计',
    icon: '🎨',
    npmPackage: '@anthropic/figma-mcp-server',
  },
  // === 云服务 ===
  {
    id: 'aws',
    name: 'AWS',
    description: 'AWS云服务操作，S3、Lambda、EC2等',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/aws-mcp-server@latest'],
    env: { AWS_REGION: 'us-east-1' },
    category: '云服务',
    icon: '☁️',
    npmPackage: '@anthropic/aws-mcp-server',
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Docker容器管理，镜像构建、容器运行',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/docker-mcp-server@latest'],
    category: '云服务',
    icon: '🐳',
    npmPackage: '@anthropic/docker-mcp-server',
  },
  // === 安全/监控 ===
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Sentry错误监控，查看和分析应用错误',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/sentry-mcp-server@latest'],
    env: { SENTRY_AUTH_TOKEN: '', SENTRY_ORG: '' },
    category: '监控',
    icon: '🐛',
    npmPackage: '@anthropic/sentry-mcp-server',
  },
  // === 专用模型 ===
  {
    id: 'elevenlabs',
    name: 'ElevenLabs TTS',
    description: 'ElevenLabs语音合成，高质量文本转语音',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/elevenlabs-mcp-server@latest'],
    env: { ELEVENLABS_API_KEY: '' },
    category: '媒体',
    icon: '🔊',
    npmPackage: '@anthropic/elevenlabs-mcp-server',
  },
];

export const SKILL_PRESETS: SkillPreset[] = [
  // === 编程专家 ===
  {
    id: 'code-review',
    name: '代码审查专家',
    description: '专业代码审查，安全漏洞、性能、可读性全面检查',
    category: '编程',
    icon: '🔍',
    content: `你是一个资深的代码审查专家。审查代码时请关注：
1. 代码质量和可读性（命名规范、结构清晰）
2. 潜在的安全漏洞（注入、XSS、CSRF、敏感信息泄露）
3. 性能问题（算法复杂度、内存泄漏、N+1查询）
4. 错误处理（边界条件、异常捕获、降级策略）
5. 最佳实践和设计模式（SOLID原则、DRY、KISS）
6. 测试覆盖（单元测试、边界测试、集成测试）

对每个问题给出严重级别（🔴高/🟡中/🟢低）和具体修复建议，附带代码示例。`,
  },
  {
    id: 'architect',
    name: '架构顾问',
    description: '系统架构设计，技术选型和架构决策建议',
    category: '设计',
    icon: '🏗️',
    content: `你是一个系统架构顾问。设计架构时请考虑：
1. 需求分析和约束识别（功能/非功能需求）
2. 架构风格选择（微服务/单体/Serverless/事件驱动）
3. 数据架构设计（数据库选型、数据流、缓存策略）
4. API设计（RESTful/GraphQL/gRPC）
5. 可扩展性（水平/垂直扩展、负载均衡）
6. 安全架构（认证授权、数据加密、网络安全）
7. 部署策略（CI/CD、容器化、蓝绿/金丝雀发布）
8. 技术选型对比和理由

输出架构图（Mermaid格式）和详细的技术文档。`,
  },
  {
    id: 'debug-assistant',
    name: '调试助手',
    description: '错误诊断和调试助手，快速定位和修复Bug',
    category: '编程',
    icon: '🐛',
    content: `你是一个调试专家。面对错误和Bug时：
1. 分析错误信息和堆栈跟踪，定位关键线索
2. 重现步骤和最小复现条件
3. 定位根本原因（不是表面症状）
4. 提供修复方案（附带代码diff）
5. 建议预防措施（防止同类问题再次发生）
6. 补充相关测试用例

调试时善用：二分法定位、日志分析、断点调试、代码溯源。`,
  },
  {
    id: 'refactor-expert',
    name: '重构专家',
    description: '代码重构指导，提升代码质量和可维护性',
    category: '编程',
    icon: '♻️',
    content: `你是一个代码重构专家。重构时遵循：
1. 识别代码异味（过长函数、重复代码、过大类、过度耦合）
2. 选择合适的重构手法（提取方法/类、内联、搬移、替换条件多态）
3. 保持行为不变（小步修改，频繁测试）
4. 应用设计模式（策略/观察者/工厂/装饰器等）
5. 改善命名和结构
6. 提升类型安全性
7. 确保测试覆盖重构后代码

输出：重构前→重构后的代码对比和理由说明。`,
  },
  // === AI/ML 专家 ===
  {
    id: 'prompt-engineer',
    name: '提示工程专家',
    description: 'Prompt设计和优化，提升AI输出质量',
    category: 'AI',
    icon: '💡',
    content: `你是一个Prompt工程专家。优化Prompt时：
1. 明确目标和预期输出格式
2. 提供清晰的上下文和约束
3. 使用结构化的指令（角色、任务、格式、约束）
4. 添加示例（few-shot）和反例
5. 设定角色和语气
6. 迭代优化，评估输出质量
7. 处理边界情况和安全防护（注入攻击防御）

输出：优化前→优化后的Prompt对比、改进理由、预期效果。`,
  },
  {
    id: 'ml-engineer',
    name: 'ML工程师',
    description: '机器学习模型开发、训练和部署指导',
    category: 'AI',
    icon: '🤖',
    content: `你是一个机器学习工程师。在ML项目中：
1. 数据探索和预处理（清洗、特征工程、数据增强）
2. 模型选择和基线建立
3. 超参数调优和交叉验证
4. 模型评估（准确率、精确率、召回率、F1、AUC）
5. 模型优化（量化、蒸馏、剪枝）
6. 部署方案（ONNX、TensorRT、TorchServe）
7. 监控和漂移检测
8. A/B测试和迭代

使用PyTorch/TensorFlow/scikit-learn，输出可复现的代码。`,
  },
  // === 数据专家 ===
  {
    id: 'data-analyst',
    name: '数据分析专家',
    description: '数据分析和可视化，统计分析和报告生成',
    category: '分析',
    icon: '📊',
    content: `你是一个数据分析专家。分析数据时：
1. 理解数据结构和字段含义（数据字典）
2. 进行探索性数据分析（EDA）：分布、相关性、异常值
3. 识别模式、趋势和异常
4. 提供统计分析结果（假设检验、置信区间）
5. 建议可视化方案（图表选型、交互式仪表板）
6. 给出业务洞察和建议

使用Python（pandas/numpy/matplotlib/seaborn/plotly），输出带可视化的分析报告。`,
  },
  {
    id: 'sql-expert',
    name: 'SQL专家',
    description: 'SQL查询优化、数据库设计和性能调优',
    category: '数据',
    icon: '🗃️',
    content: `你是一个SQL和数据库专家。工作时：
1. 编写高效的SQL查询（避免全表扫描、合理使用索引）
2. 数据库表设计（范式化/反范式化权衡、主键/外键策略）
3. 查询性能优化（EXPLAIN分析、索引建议、查询重写）
4. 数据迁移和ETL流程设计
5. 数据库安全（权限控制、SQL注入防护）
6. 支持MySQL/PostgreSQL/SQLite/SQL Server语法

输出SQL时注明目标数据库类型和版本。`,
  },
  // === 测试/质量专家 ===
  {
    id: 'test-engineer',
    name: '测试工程师',
    description: '测试策略设计，单元测试、集成测试、E2E测试',
    category: '质量',
    icon: '✅',
    content: `你是一个测试工程师。设计测试时：
1. 分析被测对象，确定测试策略（金字塔模型）
2. 编写单元测试（边界条件、异常路径、等价类划分）
3. 设计集成测试场景（接口测试、组件交互）
4. 创建端到端测试用例（用户场景模拟）
5. 考虑性能测试需求（负载、压力、稳定性）
6. 提供测试覆盖率目标和报告
7. 使用合适的mock、fixture和测试工具

支持Jest/Pytest/Mocha/Playwright/Cypress等框架。`,
  },
  {
    id: 'security-audit',
    name: '安全审计专家',
    description: '代码安全审计，漏洞扫描和安全加固建议',
    category: '安全',
    icon: '🛡️',
    content: `你是一个安全审计专家。进行安全检查时：
1. OWASP Top 10漏洞检查（注入、失效认证、敏感数据泄露等）
2. 输入验证和注入防护（SQL/NoSQL/命令注入、XSS）
3. 认证和授权机制审查（JWT安全、Session管理、RBAC）
4. 敏感数据保护（加密、脱敏、密钥管理）
5. 依赖库漏洞检查（CVE扫描、供应链安全）
6. 配置安全审查（HTTPS、CORS、CSP、安全头）
7. 给出修复优先级（CVSS评分）和具体修复方案`,
  },
  // === DevOps 专家 ===
  {
    id: 'devops',
    name: 'DevOps工程师',
    description: 'CI/CD流水线设计，容器化、部署和监控',
    category: '运维',
    icon: '🚀',
    content: `你是一个DevOps工程师。在基础设施和部署方面：
1. CI/CD流水线设计（GitHub Actions/GitLab CI/Jenkins）
2. Docker容器化方案（多阶段构建、镜像优化）
3. Kubernetes编排配置（Deployment/Service/Ingress/HPA）
4. 监控和告警设置（Prometheus/Grafana/ELK）
5. 日志收集和分析（结构化日志、分布式追踪）
6. 安全加固和密钥管理（Vault/Sealed Secrets）
7. 基础设施即代码（Terraform/Pulumi/Ansible）
8. 自动化脚本编写

输出可直接使用的配置文件和脚本。`,
  },
  // === 写作/文档专家 ===
  {
    id: 'tech-writer',
    name: '技术写作专家',
    description: '技术文档撰写，API文档、用户指南、README',
    category: '文档',
    icon: '📝',
    content: `你是一个技术写作专家。撰写文档时：
1. 了解目标读者的技术水平（开发者/用户/管理者）
2. 使用清晰简洁的语言，避免歧义
3. 结构化组织内容（层次标题、目录、交叉引用）
4. 提供代码示例和使用场景
5. 包含故障排除和FAQ部分
6. 维护版本变更记录
7. 使用Markdown等标准格式
8. 配合架构图和流程图（Mermaid）

输出结构完整、可直接使用的文档。`,
  },
  // === 前端专家 ===
  {
    id: 'frontend-expert',
    name: '前端专家',
    description: 'React/Vue/Angular前端开发，UI/UX最佳实践',
    category: '前端',
    icon: '🎨',
    content: `你是一个前端开发专家。开发前端时：
1. 组件设计（原子设计、组合模式、Hooks最佳实践）
2. 状态管理（Context/Zustand/Redux/Pinia选型）
3. 性能优化（懒加载、虚拟滚动、memo化、Bundle优化）
4. 响应式设计和无障碍访问（WCAG标准）
5. TypeScript类型安全
6. CSS架构（CSS Modules/Tailwind/CSS-in-JS）
7. 测试策略（组件测试/E2E测试）
8. 构建工具链（Vite/Webpack/Turbopack）

支持React/Vue/Svelte/Angular，输出生产级代码。`,
  },
  {
    id: 'backend-expert',
    name: '后端专家',
    description: 'Node.js/Python/Go后端开发，API和微服务',
    category: '后端',
    icon: '⚙️',
    content: `你是一个后端开发专家。开发后端时：
1. API设计（RESTful/GraphQL、版本控制、分页）
2. 认证授权（JWT/OAuth2/API Key、RBAC/ABAC）
3. 数据库设计和ORM使用（Prisma/Drizzle/SQLAlchemy）
4. 缓存策略（Redis/CDN、缓存失效策略）
5. 消息队列（RabbitMQ/Kafka/Redis Pub/Sub）
6. 错误处理和日志（结构化日志、错误码体系）
7. 安全防护（限流、CORS、Helmet、输入校验）
8. 性能优化和可扩展性

支持Node.js/Express/Fastify/Python/FastAPI/Go/Gin。`,
  },
  // === 产品/商业专家 ===
  {
    id: 'product-manager',
    name: '产品经理顾问',
    description: '产品规划、需求分析和用户故事编写',
    category: '产品',
    icon: '📋',
    content: `你是一个产品经理顾问。工作时：
1. 需求分析（用户痛点、市场机会、竞品分析）
2. 用户故事编写（As a... I want... So that...）
3. 功能优先级排序（RICE/MoSCoW/Kano模型）
4. MVP定义和迭代规划
5. 数据指标定义（北极星指标、AARRR漏斗）
6. PRD文档撰写（用户故事地图、验收标准）
7. 技术可行性评估（与开发团队协作）

输出结构化的PRD、用户故事和优先级矩阵。`,
  },
];

// ============ Skill Server Presets ============
export const SKILL_SERVER_PRESETS: SkillServerPreset[] = [
  // === 官方 Skill Servers ===
  {
    id: 'claude-skills',
    name: 'Claude Skills',
    description: 'Anthropic官方Claude技能服务，提供文档分析、代码理解等核心能力',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/claude-skills@latest'],
    category: '官方',
    icon: '🤖',
    npmPackage: '@anthropic/claude-skills',
  },
  {
    id: 'openai-agents',
    name: 'OpenAI Agents',
    description: 'OpenAI Agents SDK技能服务，代理编排和工具调用',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'openai-agents-mcp@latest'],
    category: '官方',
    icon: '🧠',
    npmPackage: 'openai-agents-mcp',
  },
  // === 代码分析类 ===
  {
    id: 'ast-grep',
    name: 'AST Grep',
    description: '基于AST的代码搜索和重构，支持多语言语法树分析',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/ast-grep-mcp@latest'],
    category: '代码分析',
    icon: '🌳',
    npmPackage: '@anthropic/ast-grep-mcp',
  },
  {
    id: 'semgrep',
    name: 'Semgrep',
    description: '代码安全扫描和模式匹配，支持30+语言的静态分析',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'semgrep-mcp@latest'],
    env: { SEMGREP_APP_TOKEN: '' },
    category: '代码分析',
    icon: '🔬',
    npmPackage: 'semgrep-mcp',
  },
  {
    id: 'tree-sitter',
    name: 'Tree-sitter',
    description: '增量语法分析器，代码结构解析和AST操作',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'tree-sitter-mcp@latest'],
    category: '代码分析',
    icon: '🌲',
    npmPackage: 'tree-sitter-mcp',
  },
  // === 自动化测试类 ===
  {
    id: 'jest-runner',
    name: 'Jest Runner',
    description: 'Jest测试运行器，自动执行和分析JavaScript/TypeScript测试',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'jest-mcp@latest'],
    category: '测试',
    icon: '🃏',
    npmPackage: 'jest-mcp',
  },
  {
    id: 'pytest-runner',
    name: 'Pytest Runner',
    description: 'Pytest测试运行器，Python测试执行和覆盖率分析',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'pytest-mcp@latest'],
    category: '测试',
    icon: '🧪',
    npmPackage: 'pytest-mcp',
  },
  {
    id: 'cypress',
    name: 'Cypress E2E',
    description: 'Cypress端到端测试，浏览器自动化测试和截图对比',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'cypress-mcp@latest'],
    category: '测试',
    icon: '🌲',
    npmPackage: 'cypress-mcp',
  },
  // === 文档/知识类 ===
  {
    id: 'readme-generator',
    name: 'README Generator',
    description: '自动分析项目结构生成README文档',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'readme-mcp@latest'],
    category: '文档',
    icon: '📖',
    npmPackage: 'readme-mcp',
  },
  {
    id: 'changelog-generator',
    name: 'Changelog Generator',
    description: '基于Git提交历史自动生成CHANGELOG',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'changelog-mcp@latest'],
    category: '文档',
    icon: '📋',
    npmPackage: 'changelog-mcp',
  },
  {
    id: 'openapi-generator',
    name: 'OpenAPI Generator',
    description: 'API规范生成器，从代码生成OpenAPI/Swagger文档',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'openapi-mcp@latest'],
    category: '文档',
    icon: '📐',
    npmPackage: 'openapi-mcp',
  },
  // === 包管理/依赖类 ===
  {
    id: 'npm-audit',
    name: 'NPM Audit',
    description: 'NPM依赖审计，漏洞扫描和安全修复建议',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'npm-audit-mcp@latest'],
    category: '安全',
    icon: '📦',
    npmPackage: 'npm-audit-mcp',
  },
  {
    id: 'snyk',
    name: 'Snyk Security',
    description: 'Snyk安全扫描，依赖漏洞检测和修复建议',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'snyk-mcp@latest'],
    env: { SNYK_TOKEN: '' },
    category: '安全',
    icon: '🔒',
    npmPackage: 'snyk-mcp',
  },
  // === 部署/运维类 ===
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Vercel部署管理，项目部署、域名配置、环境变量',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'vercel-mcp@latest'],
    env: { VERCEL_TOKEN: '' },
    category: '部署',
    icon: '▲',
    npmPackage: 'vercel-mcp',
  },
  {
    id: 'netlify',
    name: 'Netlify',
    description: 'Netlify站点管理，部署、表单、函数配置',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'netlify-mcp@latest'],
    env: { NETLIFY_AUTH_TOKEN: '' },
    category: '部署',
    icon: '🔷',
    npmPackage: 'netlify-mcp',
  },
  {
    id: 'terraform',
    name: 'Terraform',
    description: 'Terraform基础设施即代码，云资源管理和编排',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'terraform-mcp@latest'],
    category: '部署',
    icon: '🏗️',
    npmPackage: 'terraform-mcp',
  },
  // === 数据处理类 ===
  {
    id: 'csv-tools',
    name: 'CSV Tools',
    description: 'CSV文件处理工具，解析、转换、合并和分析',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'csv-mcp@latest'],
    category: '数据',
    icon: '📊',
    npmPackage: 'csv-mcp',
  },
  {
    id: 'excel-tools',
    name: 'Excel Tools',
    description: 'Excel/电子表格读写操作，支持xlsx/csv格式',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'excel-mcp-server@latest'],
    category: '数据',
    icon: '📗',
    npmPackage: 'excel-mcp-server',
  },
  {
    id: 'pdf-tools',
    name: 'PDF Tools',
    description: 'PDF文件解析和生成，文本提取、合并、拆分',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'pdf-mcp-server@latest'],
    category: '数据',
    icon: '📕',
    npmPackage: 'pdf-mcp-server',
  },
  // === AI/模型辅助类 ===
  {
    id: 'langchain',
    name: 'LangChain',
    description: 'LangChain链式调用工具，RAG、Agent、Chain编排',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'langchain-mcp@latest'],
    category: 'AI',
    icon: '🦜',
    npmPackage: 'langchain-mcp',
  },
  {
    id: 'rag-server',
    name: 'RAG Server',
    description: '检索增强生成服务，文档索引和语义搜索',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'rag-mcp-server@latest'],
    category: 'AI',
    icon: '📚',
    npmPackage: 'rag-mcp-server',
  },
  {
    id: 'embedding-server',
    name: 'Embedding Server',
    description: '文本嵌入服务，向量化和语义相似度计算',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'embedding-mcp@latest'],
    category: 'AI',
    icon: '🔢',
    npmPackage: 'embedding-mcp',
  },
  // === 图像/媒体处理 ===
  {
    id: 'image-tools',
    name: 'Image Tools',
    description: '图像处理工具，裁剪、缩放、格式转换、OCR识别',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'image-mcp-server@latest'],
    category: '媒体',
    icon: '🖼️',
    npmPackage: 'image-mcp-server',
  },
  {
    id: 'video-tools',
    name: 'Video Tools',
    description: '视频处理工具，转码、裁剪、截图、字幕生成',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'video-mcp-server@latest'],
    category: '媒体',
    icon: '🎬',
    npmPackage: 'video-mcp-server',
  },
  // === 通知/通讯 ===
  {
    id: 'email-sender',
    name: 'Email Sender',
    description: '邮件发送服务，SMTP/API发送，模板支持',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'email-mcp-server@latest'],
    env: { SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' },
    category: '通讯',
    icon: '📧',
    npmPackage: 'email-mcp-server',
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    description: 'Telegram机器人技能，消息收发、群组管理',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'telegram-mcp-server@latest'],
    env: { TELEGRAM_BOT_TOKEN: '' },
    category: '通讯',
    icon: '✈️',
    npmPackage: 'telegram-mcp-server',
  },
  {
    id: 'discord',
    name: 'Discord Bot',
    description: 'Discord机器人技能，服务器管理、消息发送',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'discord-mcp-server@latest'],
    env: { DISCORD_BOT_TOKEN: '' },
    category: '通讯',
    icon: '🎮',
    npmPackage: 'discord-mcp-server',
  },
];
