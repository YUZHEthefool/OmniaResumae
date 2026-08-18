/**
 * AI 接入类型
 *
 * Provider 抽象：两类适配器
 * - openai-compatible: 可配置 baseURL + model，覆盖 OpenAI / DeepSeek / 通义 / 智谱
 * - anthropic: Claude，浏览器直连需 dangerous-direct-browser-access header
 *
 * 所有 AI 产出均为"提案 (Proposal)"，经 zod 校验后由用户审阅接受，绝不自动覆盖。
 */

export type ProviderKind = 'openai-compatible' | 'anthropic'

/** 预置端点（用户也可自定义 baseURL） */
export interface PresetEndpoint {
  id: string
  label: string
  kind: ProviderKind
  baseURL: string
  defaultModel: string
  models: string[]
  apiKeyURL: string // 引导用户去拿 key 的地址
}

export const PRESET_ENDPOINTS: PresetEndpoint[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'o1-mini'],
    apiKeyURL: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compatible',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    apiKeyURL: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'qwen',
    label: '通义千问 (DashScope)',
    kind: 'openai-compatible',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
    apiKeyURL: 'https://dashscope.console.aliyun.com/apiKey',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    kind: 'openai-compatible',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4'],
    apiKeyURL: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    kind: 'anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-5',
    models: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001'],
    apiKeyURL: 'https://console.anthropic.com/settings/keys',
  },
]

export interface AIProviderConfig {
  kind: ProviderKind
  baseURL: string
  apiKey: string
  model: string
}

/** AI 能力请求参数 */
export interface OptimizeParams {
  /** 要优化的文本条目（highlights 等） */
  items: string[]
  /** 上下文：所属 section / 岗位方向，供 AI 风格对齐 */
  context?: string
  locale: 'zh' | 'en'
}

export interface TailorParams {
  /** 完份简历（精简后的可序列化形态） */
  resumeSnapshot: string
  /** 目标公司名 */
  company: string
  /** 岗位描述 / 公司背景 */
  jobDescription: string
  locale: 'zh' | 'en'
}

/** 目标公司定向包装提案 */
export interface TailorProposal {
  /** 建议主推的项目 id + 理由 */
  featuredProjects: { projectId: string; reason: string }[]
  /** 改写后的要点：projectId -> 新 highlights */
  rewrittenHighlights: { projectId: string; highlights: string[] }[]
  /** 生成的"招聘要求 ↔ 自我匹配"数组（喂粗野模板 match-list） */
  matches: { tag: string; body: string }[]
  /** 一句话核心优势包装（可写入 basics.summary） */
  pride: string
}

/** 优化提案：逐条原文 -> 改写 */
export interface OptimizeProposal {
  items: { original: string; rewritten: string }[]
}

/** 翻译提案：补全目标语言 */
export interface TranslateProposal {
  pairs: { source: string; target: string }[]
}

/** JD 关键词匹配提案：贴 JD → AI 提取关键词 → 与简历对比 → 匹配度 + 命中/缺失 */
export interface JDProposal {
  /** AI 从 JD 提取的全部关键词（技术栈/具体技能） */
  keywords: string[]
  /** 简历已命中的关键词 */
  matched: string[]
  /** 简历缺失的关键词 */
  missing: string[]
  /** 匹配百分比 0-100 */
  score: number
}
