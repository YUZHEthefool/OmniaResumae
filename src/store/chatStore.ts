/**
 * 对话历史 store：多对话 + 持久化。
 *
 * 模型：conversation（对话）是一等实体，每份 resume 可有多个对话。
 * - conversations: Record<convId, ChatConversation> —— 持久化（entries + messages + meta）
 * - activeConvId: 当前激活的对话 —— 持久化
 * - snapshots: Record<convId, Resume | null> —— 「撤销本轮」快照，内存态不持久（重载后无法
 *   跨会话撤销，且快照是整份简历深拷贝、体积大）。
 *
 * 持久化用 localStorage（zustand persist），quota 异常时吞掉仅告警，不崩应用。
 * messages 含完整 agent 历史（含 get_resume 快照等），长对话可能较大；v1 不截断，
 * 超限再考虑迁 Dexie。
 */
import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { NeutralMsg } from '@/ai/providers'
import type { Resume } from '@/types/resume'

export type ChatEntry =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string; reasoning?: string }
  | { id: string; kind: 'tool_call'; name: string; args: Record<string, unknown> }
  | { id: string; kind: 'tool_result'; name: string; result: string }
  | { id: string; kind: 'error'; message: string }
  | { id: string; kind: 'system'; text: string }

export interface ChatConversation {
  id: string
  resumeId: string
  title: string
  entries: ChatEntry[]
  messages: NeutralMsg[]
  createdAt: number
  updatedAt: number
}

interface ChatState {
  conversations: Record<string, ChatConversation>
  activeConvId: string | null
  snapshots: Record<string, Resume | null> // 撤销快照，内存态不持久

  /** 列出某 resume 的全部对话，按 updatedAt 降序 */
  listForResume: (resumeId: string) => ChatConversation[]
  /** 新建对话（绑定 resumeId），设为激活，返回 id */
  createConversation: (resumeId: string, title?: string) => string
  /** 局部更新某对话（同时刷 updatedAt） */
  updateConversation: (id: string, patch: Partial<ChatConversation>) => void
  /** 删除某对话 */
  deleteConversation: (id: string) => void
  /** 删除某 resume 的全部对话（resume 被删时调用） */
  deleteForResume: (resumeId: string) => void
  /** 设激活对话 */
  setActive: (id: string | null) => void
  /** 重命名 */
  renameConversation: (id: string, title: string) => void
  /** 撤销快照读写 */
  getSnapshot: (id: string) => Resume | null
  setSnapshot: (id: string, resume: Resume | null) => void
}

/** localStorage 的 quota 安全包装：超限只告警不抛，避免崩整个应用 */
const safeLocalStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch (e) {
      console.warn('[chatStore] 持久化失败（可能 localStorage 超限），对话仍可用但不跨刷新保留', e)
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: {},
      activeConvId: null,
      snapshots: {},

      listForResume: (resumeId) =>
        Object.values(get().conversations)
          .filter((c) => c.resumeId === resumeId)
          .sort((a, b) => b.updatedAt - a.updatedAt),

      createConversation: (resumeId, title) => {
        const now = Date.now()
        const id = `conv_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        const conv: ChatConversation = {
          id,
          resumeId,
          title: title ?? '',
          entries: [],
          messages: [],
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ conversations: { ...s.conversations, [id]: conv }, activeConvId: id }))
        return id
      },

      updateConversation: (id, patch) =>
        set((s) => {
          const c = s.conversations[id]
          if (!c) return s
          return {
            conversations: {
              ...s.conversations,
              [id]: { ...c, ...patch, updatedAt: Date.now() },
            },
          }
        }),

      deleteConversation: (id) =>
        set((s) => {
          const next = { ...s.conversations }
          delete next[id]
          const snaps = { ...s.snapshots }
          delete snaps[id]
          const active = s.activeConvId === id ? null : s.activeConvId
          return { conversations: next, snapshots: snaps, activeConvId: active }
        }),

      deleteForResume: (resumeId) =>
        set((s) => {
          const next: Record<string, ChatConversation> = {}
          const snaps: Record<string, Resume | null> = {}
          let active = s.activeConvId
          for (const [id, c] of Object.entries(s.conversations)) {
            if (c.resumeId === resumeId) {
              if (id === active) active = null
              continue
            }
            next[id] = c
            if (s.snapshots[id] !== undefined) snaps[id] = s.snapshots[id]
          }
          return { conversations: next, snapshots: snaps, activeConvId: active }
        }),

      setActive: (id) => set({ activeConvId: id }),

      renameConversation: (id, title) => get().updateConversation(id, { title }),

      getSnapshot: (id) => get().snapshots[id] ?? null,
      setSnapshot: (id, resume) =>
        set((s) => ({ snapshots: { ...s.snapshots, [id]: resume } })),
    }),
    {
      name: 'omniaresumae-chat',
      storage: createJSONStorage(() => safeLocalStorage),
      // 仅持久化对话数据与激活 id；snapshots（撤销快照）是内存态，不持久
      partialize: (s) => ({ conversations: s.conversations, activeConvId: s.activeConvId }),
    },
  ),
)
