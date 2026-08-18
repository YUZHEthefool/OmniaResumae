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
    /** 输出 token 上限（仅 Anthropic 生效）；长输出（完整简历 emit_resume）应调高避免截断 */
    maxTokens?: number
  },
): Promise<{ toolCalls: ToolCall[]; finalText: string; messages: NeutralMsg[] }> {
  const maxSteps = opts.maxSteps ?? 12
  const temp = opts.temperature ?? 0.4
  const allCalls: ToolCall[] = []
  let finalText = ''

  // 整个循环 + 收尾包进 try/catch：chatWithTools 在 fetch 进行中被 abort 会抛 AbortError，
  // 若无 try/catch 会直接逃逸、跳过下方 finalizeMessages，导致 messages 以 tool/user 结尾落库，
  // 下次发送 Anthropic 报 400 锁死会话。catch 内先补齐未配对的 tool_result + 收尾 assistant，
  // 再决定是否 rethrow（AbortError 不 rethrow，CopilotPanel 已吞；其余 rethrow 让 UI 显示红错）。
  try {
    for (let step = 0; step < maxSteps; step++) {
      if (opts.signal?.aborted) break
      const res = await chatWithTools(config, opts.messages, opts.tools, temp, opts.signal, opts.maxTokens)

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
      // 归一化 tool_call id：部分端点缺 id，若不补则 assistant.tool_use.id 与 tool_result.toolCallId
      // 不一致；含同名工具多次调用时旧兜底 `call_${step}_${name}` 会撞 id。这里带序号保证唯一且两侧一致。
      const calls = res.toolCalls.map((tc, i) => ({ ...tc, id: tc.id || `call_${step}_${i}_${tc.name}` }))
      opts.messages.push({
        role: 'assistant',
        content: res.content || undefined,
        toolCalls: calls,
        reasoningContent: res.reasoningContent,
      })
      if (res.content || res.reasoningContent) {
        opts.onEvent({ type: 'assistant', content: res.content, reasoningContent: res.reasoningContent })
      }

      for (const tc of calls) {
        if (opts.signal?.aborted) break
        opts.onEvent({ type: 'tool_call', call: tc })
        const tool = opts.tools.find((t) => t.name === tc.name)
        const result = tool ? await safeRunAsync(tool.run, tc.args) : `工具 ${tc.name} 不存在`
        opts.messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: result })
        opts.onEvent({ type: 'tool_result', callId: tc.id, name: tc.name, result })
        allCalls.push(tc)
      }
      finalText = res.content

      if (step === maxSteps - 1) {
        finalizeMessages(opts.messages, '(达到步数上限)')
        opts.onEvent({ type: 'done', finalText: '(达到步数上限)' })
        return { toolCalls: allCalls, finalText, messages: opts.messages }
      }
    }

    if (opts.signal?.aborted) {
      finalizeMessages(opts.messages, '(已停止)')
      opts.onEvent({ type: 'done', finalText: '(已停止)' })
    } else {
      finalizeMessages(opts.messages, '(已完成)')
      opts.onEvent({ type: 'done', finalText })
    }
    return { toolCalls: allCalls, finalText, messages: opts.messages }
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError' || !!opts.signal?.aborted
    // 异常路径同样要补齐未配对的 tool_result + 收尾，否则下次发送会被 400 锁死。
    finalizeMessages(opts.messages, aborted ? '(已停止)' : '(出错)')
    if (aborted) {
      // AbortError：CopilotPanel 的 catch 已吞（显示"已停止"），此处只发 done 不 rethrow。
      opts.onEvent({ type: 'done', finalText: '(已停止)' })
      return { toolCalls: allCalls, finalText, messages: opts.messages }
    }
    // 非 abort：rethrow 让 CopilotPanel catch 显示红色错误条目。finalize 已保证下次发送不锁死。
    throw e
  }
}

/**
 * 运行非正常结束（中止 / 达步数上限 / 空响应）时，消息历史可能含未配对的 tool_use
 * （中止在工具批中途，剩余工具未执行）或以 tool 结尾，下次发送会让 Anthropic（要求
 * 角色交替 + 每个 tool_use 必须有 tool_result）与 OpenAI 报 400，锁死 Copilot 会话。
 * 这里补齐：为每个无 tool_result 的 tool_call 合成一个提示性结果，并在以 tool 结尾时
 * 补一条 assistant 收尾。正常完成（以 assistant 文本收尾）时为 no-op。
 */
function finalizeMessages(messages: NeutralMsg[], note: string): void {
  const have = new Set<string>()
  for (const m of messages) if (m.role === 'tool') have.add(m.toolCallId)
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.toolCalls) continue
    for (const tc of m.toolCalls) {
      if (!have.has(tc.id)) {
        messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: note })
        have.add(tc.id)
      }
    }
  }
  const last = messages[messages.length - 1]
  // 以 tool 结尾（工具轮后未出文本）或以 user 结尾（首轮即中止/空响应，尚无 assistant 回复）
  // 都补一条 assistant，否则下次发送会出现连续两条 user/tool 而 Anthropic 报 400。
  if (last && (last.role === 'tool' || last.role === 'user')) messages.push({ role: 'assistant', content: note })
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
