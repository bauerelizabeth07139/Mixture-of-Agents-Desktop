import { McpPreset, SkillPreset } from '../../types';

export const MCP_PRESETS: McpPreset[] = [
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
    id: 'supabase',
    name: 'Supabase',
    description: 'Supabase数据库和认证操作',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase@latest'],
    env: { SUPABASE_ACCESS_TOKEN: '' },
    category: '数据库',
    icon: '⚡',
    npmPackage: '@supabase/mcp-server-supabase',
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Figma设计文件访问，获取设计稿信息',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/figma-mcp-server'],
    env: { FIGMA_ACCESS_TOKEN: '' },
    category: '设计',
    icon: '🎨',
    npmPackage: '@anthropic/figma-mcp-server',
  },
];

export const SKILL_PRESETS: SkillPreset[] = [
  {
    id: 'code-review',
    name: '代码审查',
    description: '自动代码审查，检查代码质量、安全漏洞、最佳实践',
    category: '编程',
    icon: '🔍',
    content: `你是一个专业的代码审查专家。审查代码时请关注：
1. 代码质量和可读性
2. 潜在的安全漏洞
3. 性能问题
4. 错误处理
5. 最佳实践和设计模式
6. 测试覆盖

对每个问题给出严重级别（高/中/低）和修复建议。`,
  },
  {
    id: 'architecture-advisor',
    name: '架构顾问',
    description: '系统架构设计建议，技术选型和方案评估',
    category: '设计',
    icon: '🏗️',
    content: `你是一个资深架构师。在评估和设计架构时：
1. 分析需求，识别核心约束
2. 评估技术选型的优劣
3. 考虑可扩展性、可维护性、性能
4. 给出架构图和组件说明
5. 识别风险点并给出缓解策略
6. 提供分阶段实施计划`,
  },
  {
    id: 'debug-assistant',
    name: '调试助手',
    description: '错误诊断和调试助手，快速定位和修复Bug',
    category: '编程',
    icon: '🐛',
    content: `你是一个调试专家。面对错误和Bug时：
1. 分析错误信息和堆栈
2. 重现步骤
3. 定位根本原因
4. 提供修复方案
5. 建议预防措施
6. 如有相关测试，补充测试用例`,
  },
  {
    id: 'data-analyst',
    name: '数据分析',
    description: '数据分析和可视化建议，统计分析和报告生成',
    category: '分析',
    icon: '📊',
    content: `你是一个数据分析专家。分析数据时：
1. 理解数据结构和字段含义
2. 进行探索性数据分析(EDA)
3. 识别模式、趋势和异常
4. 提供统计分析结果
5. 建议可视化方案
6. 给出业务洞察和建议`,
  },
  {
    id: 'api-designer',
    name: 'API设计',
    description: 'RESTful/GraphQL API设计，接口规范和文档生成',
    category: '编程',
    icon: '🔌',
    content: `你是一个API设计专家。设计API时遵循：
1. RESTful最佳实践或GraphQL规范
2. 清晰的资源命名和层次结构
3. 适当的HTTP方法和状态码
4. 一致的请求/响应格式
5. 完善的错误处理
6. 分页、过滤、排序支持
7. 安全考虑（认证、限流、CORS）
8. 生成OpenAPI/Swagger文档`,
  },
  {
    id: 'test-engineer',
    name: '测试工程',
    description: '测试策略设计，单元测试、集成测试、E2E测试',
    category: '质量',
    icon: '✅',
    content: `你是一个测试工程专家。设计测试时：
1. 分析被测对象，确定测试策略
2. 编写单元测试（边界条件、异常路径）
3. 设计集成测试场景
4. 创建端到端测试用例
5. 考虑性能测试需求
6. 提供测试覆盖率目标
7. 使用合适的mock和fixture`,
  },
  {
    id: 'devops',
    name: 'DevOps',
    description: 'CI/CD流水线设计，容器化、部署和监控',
    category: '运维',
    icon: '🚀',
    content: `你是一个DevOps专家。在基础设施和部署方面：
1. 设计CI/CD流水线
2. Docker容器化方案
3. Kubernetes编排配置
4. 监控和告警设置
5. 日志收集和分析
6. 安全加固和密钥管理
7. 自动化脚本编写`,
  },
  {
    id: 'prompt-engineer',
    name: '提示工程',
    description: 'Prompt设计和优化，提升AI输出质量',
    category: 'AI',
    icon: '💡',
    content: `你是一个Prompt工程专家。优化Prompt时：
1. 明确目标和预期输出格式
2. 提供清晰的上下文和约束
3. 使用结构化的指令
4. 添加示例（few-shot）
5. 设定角色和语气
6. 迭代优化，评估输出质量
7. 处理边界情况和安全防护`,
  },
  {
    id: 'tech-writer',
    name: '技术写作',
    description: '技术文档撰写，API文档、用户指南、README',
    category: '文档',
    icon: '📝',
    content: `你是一个技术写作专家。撰写文档时：
1. 了解目标读者的技术水平
2. 使用清晰简洁的语言
3. 结构化组织内容
4. 提供代码示例和使用场景
5. 包含故障排除部分
6. 维护版本变更记录
7. 使用Markdown等标准格式`,
  },
  {
    id: 'security-audit',
    name: '安全审计',
    description: '代码安全审计，漏洞扫描和安全加固建议',
    category: '安全',
    icon: '🛡️',
    content: `你是一个安全审计专家。进行安全审查时：
1. OWASP Top 10漏洞检查
2. 输入验证和注入防护
3. 认证和授权机制审查
4. 敏感数据保护
5. 依赖库漏洞检查
6. 配置安全审查
7. 给出修复优先级和具体方案`,
  },
];
