/**
 * 对话历史 store：按 resumeId 绑定每份简历的 AI 对话。
 * 内存态（不持久）——刷新清空，但简历内容仍由 resumeStore 持久。
 * 切换简历时加载对应历史；切回原简历恢复其对话。
 */
import { create } from 'zustand'
import type { NeutralMsg } from '@/ai/providers'
import type { Resume } from '@/types/resume'

export type ChatEntry =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string; reasoning?: string }
  | { id: string; kind: 'tool_call'; name: string; args: Record<string, unknown> }
  | { id: string; kind: 'tool_result'; name: string; result: string }
  | { id: string; kind: 'error'; message: string }
  | { id: string; kind: 'system'; text: string }

interface ChatSession {
  entries: ChatEntry[]
  messages: NeutralMsg[]
  prevSnapshot: Resume | null
}

interface ChatState {
  sessions: Record<string, ChatSession>
  /** 取某简历的会话（无则建空） */
  getSession: (resumeId: string) => ChatSession
  /** 写回会话（entries/messages/snapshot） */
  setSession: (resumeId: string, patch: Partial<ChatSession>) => void
  /** 清空某简历的会话 */
  clearSession: (resumeId: string) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: {},
  getSession: (resumeId) => {
    const cur = get().sessions[resumeId]
    if (cur) return cur
    const fresh: ChatSession = { entries: [], messages: [], prevSnapshot: null }
    set((s) => ({ sessions: { ...s.sessions, [resumeId]: fresh } }))
    return fresh
  },
  setSession: (resumeId, patch) =>
    set((s) => {
      const existing = s.sessions[resumeId] ?? { entries: [], messages: [], prevSnapshot: null }
      return { sessions: { ...s.sessions, [resumeId]: { ...existing, ...patch } } }
    }),
  clearSession: (resumeId) =>
    set((s) => {
      const next = { ...s.sessions }
      delete next[resumeId]
      return { sessions: next }
    }),
}))
