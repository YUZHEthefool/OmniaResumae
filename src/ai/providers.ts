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

/* ───────── Tool calling（agent 循环用） ───────── */
/** 工具规格（不含 run，run 在 agent.ts 的 ToolDef 里补） */
export interface ToolSpec {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

/** 中性消息：agent 循环内部的历史格式，chatWithTools 按 provider 翻译 */
export type NeutralMsg =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; toolCalls?: ToolCall[]; reasoningContent?: string }
  | { role: 'tool'; toolCallId: string; name: string; content: string }

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolCallResult {
  content: string
  toolCalls: ToolCall[]
  /** DeepSeek-Reasoner 思考模式：必须回传给 API，否则多轮报 400 */
  reasoningContent?: string
}

/** 带 tools 的 AI 调用：返回末轮文本 + 本轮工具调用（agent 循环消费）。不改现有 chat()。 */
export async function chatWithTools(
  config: AIProviderConfig,
  messages: NeutralMsg[],
  tools: ToolSpec[],
  temperature = 0.4,
): Promise<ToolCallResult> {
  if (config.kind === 'anthropic') return chatWithToolsAnthropic(config, messages, tools, temperature)
  return chatWithToolsOpenAI(config, messages, tools, temperature)
}

async function chatWithToolsOpenAI(
  config: AIProviderConfig,
  messages: NeutralMsg[],
  tools: ToolSpec[],
  temperature: number,
): Promise<ToolCallResult> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: toOpenAIMessages(messages),
    temperature,
    stream: false,
    tools: tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    })),
  }
  const res = await fetch(`${trimSlash(config.baseURL)}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  const msg = data?.choices?.[0]?.message
  const content = typeof msg?.content === 'string' ? msg.content : ''
  // DeepSeek-Reasoner 思考模式返回 reasoning_content，多轮必须原样回传，否则 API 报 400
  const reasoningContent = typeof msg?.reasoning_content === 'string' ? msg.reasoning_content : undefined
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc: { id: string; function: { name: string; arguments: string } }) => {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(tc.function.arguments || '{}')
    } catch {
      args = {}
    }
    return { id: tc.id, name: tc.function.name, args }
  })
  return { content, toolCalls, reasoningContent }
}

async function chatWithToolsAnthropic(
  config: AIProviderConfig,
  messages: NeutralMsg[],
  tools: ToolSpec[],
  temperature: number,
): Promise<ToolCallResult> {
  const { system, msgs } = toAnthropicMessages(messages)
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 4096,
    temperature,
    system,
    messages: msgs,
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
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
  const content: string[] = []
  const toolCalls: ToolCall[] = []
  for (const block of data?.content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string') content.push(block.text)
    else if (block.type === 'tool_use' && block.input) {
      toolCalls.push({ id: block.id, name: block.name, args: block.input as Record<string, unknown> })
    }
  }
  return { content: content.join('\n'), toolCalls }
}

/** 中性消息 → OpenAI messages（含 tool_calls / role:tool 结果） */
function toOpenAIMessages(messages: NeutralMsg[]): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === 'system' || m.role === 'user') return { role: m.role, content: m.content }
    if (m.role === 'assistant') {
      const out: Record<string, unknown> = { role: 'assistant' }
      if (m.content) out.content = m.content
      // DeepSeek-Reasoner：回传 reasoning_content（仅当存在，其它 provider 不输出）
      if (m.reasoningContent) out.reasoning_content = m.reasoningContent
      if (m.toolCalls?.length) {
        out.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }))
      }
      return out
    }
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
  })
}

/** 中性消息 → Anthropic messages + 抽 system（tool_use / tool_result 块） */
function toAnthropicMessages(messages: NeutralMsg[]): {
  system: string
  msgs: Record<string, unknown>[]
} {
  const system: string[] = []
  const msgs: Record<string, unknown>[] = []
  for (const m of messages) {
    if (m.role === 'system') {
      system.push(m.content)
      continue
    }
    if (m.role === 'user') {
      msgs.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const blocks: Record<string, unknown>[] = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const tc of m.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
      }
      msgs.push({ role: 'assistant', content: blocks.length ? blocks : '' })
    } else {
      // tool 结果 → user 角色的 tool_result 块
      const last = msgs[msgs.length - 1]
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        ;(last.content as Record<string, unknown>[]).push(block)
      } else {
        msgs.push({ role: 'user', content: [block] })
      }
    }
  }
  return { system: system.join('\n\n'), msgs }
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
