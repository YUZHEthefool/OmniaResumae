/**
 * AI Provider 适配器（原生 fetch）
 *
 * - openaiCompatible: OpenAI / DeepSeek / 通义 / 智谱，均支持 response_format json_object
 * - anthropic: Claude，浏览器直连需 anthropic-dangerous-direct-browser-access header
 *
 * 统一接口：chat({ messages, json }) => string
 * 当 json=true 时，尽力返回可 JSON.parse 的字符串。
 */
import type { AIProviderConfig } from '@/types/ai'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  messages: ChatMessage[]
  /** 强制 JSON 输出 */
  json?: boolean
  /** 最多重试一次（解析失败时） */
  temperature?: number
}

/** 调用 AI，返回文本内容 */
export async function chat(config: AIProviderConfig, opts: ChatOptions): Promise<string> {
  if (config.kind === 'anthropic') return chatAnthropic(config, opts)
  return chatOpenAICompatible(config, opts)
}

/* ───────── OpenAI 兼容 ───────── */
async function chatOpenAICompatible(config: AIProviderConfig, opts: ChatOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
    stream: false,
  }
  if (opts.json) body.response_format = { type: 'json_object' }

  const res = await fetch(`${trimSlash(config.baseURL)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('空响应')
  return content
}

/* ───────── Anthropic ───────── */
async function chatAnthropic(config: AIProviderConfig, opts: ChatOptions): Promise<string> {
  // 把 system 抽出（Anthropic 独立字段）
  const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const messages = opts.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 4096,
    temperature: opts.temperature ?? 0.4,
    system,
    messages,
  }

  // Claude 用 tool_use 强制结构化；这里为简化，用 json 提示 + 响应解析
  if (opts.json) {
    body.tools = [{
      name: 'emit_json',
      description: 'Emit the structured JSON result.',
      input_schema: { type: 'object', additionalProperties: true } as Record<string, unknown>,
    }]
    body.tool_choice = { type: 'tool', name: 'emit_json' }
  }

  const res = await fetch(`${trimSlash(config.baseURL)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  // tool_use 优先
  for (const block of data?.content ?? []) {
    if (block.type === 'tool_use' && block.input) {
      return JSON.stringify(block.input)
    }
    if (block.type === 'text' && typeof block.text === 'string') {
      return block.text
    }
  }
  throw new Error('Anthropic 空响应')
}

/* ─── 工具 ─── */
function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

/** 从 AI 文本中尽力提取 JSON（兼容 ```json 代码块包裹） */
export function extractJSON(raw: string): string {
  let s = raw.trim()
  // 去代码块
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  // 找第一个 { ... 最后一个 }
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return s.slice(start, end + 1)
  }
  return s
}

/* ───────── 拉取可用模型列表 ───────── */

/** 调用 /models 端点，返回模型 id 列表。失败抛错（调用方捕获并提示）。 */
export async function listModels(config: AIProviderConfig): Promise<string[]> {
  if (config.kind === 'anthropic') return listModelsAnthropic(config)
  return listModelsOpenAICompatible(config)
}

async function listModelsOpenAICompatible(config: AIProviderConfig): Promise<string[]> {
  const res = await fetch(`${trimSlash(config.baseURL)}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText)
    throw new Error(`拉取模型失败 ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  // OpenAI: { data: [{ id }] }；各家兼容基本同形
  const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : []
  const ids = arr.map((m: { id?: string; model?: string; name?: string }) => m.id || m.model || m.name).filter(Boolean)
  return ids as string[]
}

async function listModelsAnthropic(config: AIProviderConfig): Promise<string[]> {
  const res = await fetch(`${trimSlash(config.baseURL)}/models?limit=100`, {
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText)
    throw new Error(`拉取模型失败 ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  const arr = Array.isArray(data?.data) ? data.data : []
  return arr.map((m: { id?: string }) => m.id).filter(Boolean) as string[]
}
