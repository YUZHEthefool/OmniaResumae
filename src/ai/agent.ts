/**
 * 可观测 agent 运行时（浏览器内，BYO 密钥）
 *
 * runAgentStream 驱动多轮工具调用，每步通过 onEvent 发事件，供 UI 实时渲染 transcript。
 * 消息历史由调用方持有并传入（跨轮复用）；运行时只推进下一 N 步。
 * provider 差异（OpenAI tool_calls / Anthropic tool_use）由 providers.chatWithTools 隔离。
 */
import { chatWithTools, type NeutralMsg, type ToolCall, type ToolSpec } from './providers'
import type { AIProviderConfig } from '@/types/ai'

export interface ToolDef extends ToolSpec {
  /** 执行工具，返回字符串结果回传给模型（可异步：编辑工具需读写 store） */
  run: (args: Record<string, unknown>) => Promise<string> | string
}

export type AgentEvent =
  | { type: 'assistant'; content: string; reasoningContent?: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; callId: string; name: string; result: string }
  | { type: 'done'; finalText: string }
  | { type: 'error'; message: string }

export async function runAgentStream(
  config: AIProviderConfig,
  opts: {
    /** 调用方持有的历史；[0] 应为 system 消息，调用前已推入本轮 user 消息 */
    messages: NeutralMsg[]
    tools: ToolDef[]
    maxSteps?: number
    temperature?: number
    onEvent: (e: AgentEvent) => void
    signal?: AbortSignal
  },
): Promise<{ toolCalls: ToolCall[]; finalText: string; messages: NeutralMsg[] }> {
  const maxSteps = opts.maxSteps ?? 12
  const temp = opts.temperature ?? 0.4
  const allCalls: ToolCall[] = []
  let finalText = ''

  for (let step = 0; step < maxSteps; step++) {
    if (opts.signal?.aborted) break
    const res = await chatWithTools(config, opts.messages, opts.tools, temp)

    if (res.toolCalls.length === 0) {
      finalText = res.content
      if (finalText || res.reasoningContent) {
        opts.messages.push({
          role: 'assistant',
          content: finalText || undefined,
          reasoningContent: res.reasoningContent,
        })
        opts.onEvent({ type: 'assistant', content: finalText, reasoningContent: res.reasoningContent })
      }
      break
    }

    // 有工具调用：记录 assistant 这一轮（含 reasoning_content，DeepSeek 多轮需回传）
    opts.messages.push({
      role: 'assistant',
      content: res.content || undefined,
      toolCalls: res.toolCalls,
      reasoningContent: res.reasoningContent,
    })
    if (res.content || res.reasoningContent) {
      opts.onEvent({ type: 'assistant', content: res.content, reasoningContent: res.reasoningContent })
    }

    for (const tc of res.toolCalls) {
      if (opts.signal?.aborted) break
      opts.onEvent({ type: 'tool_call', call: tc })
      const tool = opts.tools.find((t) => t.name === tc.name)
      const result = tool ? await safeRunAsync(tool.run, tc.args) : `工具 ${tc.name} 不存在`
      // 部分端点缺 tool_call id，兜底生成以维持 tool_result 配对
      const callId = tc.id || `call_${step}_${tc.name}`
      opts.messages.push({ role: 'tool', toolCallId: callId, name: tc.name, content: result })
      opts.onEvent({ type: 'tool_result', callId, name: tc.name, result })
      allCalls.push(tc)
    }
    finalText = res.content

    if (step === maxSteps - 1) {
      opts.onEvent({ type: 'done', finalText: '(达到步数上限)' })
      return { toolCalls: allCalls, finalText, messages: opts.messages }
    }
  }

  if (opts.signal?.aborted) {
    opts.onEvent({ type: 'done', finalText: '(已停止)' })
  } else {
    opts.onEvent({ type: 'done', finalText })
  }
  return { toolCalls: allCalls, finalText, messages: opts.messages }
}

async function safeRunAsync(
  fn: (args: Record<string, unknown>) => Promise<string> | string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    return await fn(args)
  } catch (e) {
    return `工具执行出错: ${(e as Error).message}`
  }
}
