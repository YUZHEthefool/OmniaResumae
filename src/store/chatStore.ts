/**
 * 对话历史 store：多对话 + Dexie 持久化。
 *
 * 模型：conversation（对话）是一等实体，每份 resume 可有多个对话。
 * - conversations: Record<convId, ChatConversation> —— 内存缓存，真相源是 Dexie
 * - activeConvId: 当前激活的对话 —— 用 localStorage 单独存（很小，不必进 Dexie）
 * - snapshots: Record<convId, Resume | null> —— 「撤销本轮」快照，内存态不持久
 *
 * 持久化：init 时从 Dexie 批量加载到内存；每个 mutator 既 set 内存又 fire-and-forget
 * 写 Dexie（IndexedDB quota 几乎无限，长对话不再撑爆 localStorage）。
 * reactive 订阅走内存 zustand，同步 API 不变，调用方无需改。
 */
import { create } from 'zustand'
import type { NeutralMsg } from '@/ai/providers'
import type { Resume } from '@/types/resume'
import {
  listConversations, putConversation, deleteConversationRow, deleteConversationsByResume,
} from '@/db'

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

const ACTIVE_KEY = 'omniaresumae-chat-active'

/** 读写激活对话 id（localStorage，单独存，不进 Dexie） */
function loadActive(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}
function saveActive(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

interface ChatState {
  conversations: Record<string, ChatConversation>
  activeConvId: string | null
  loaded: boolean
  snapshots: Record<string, Resume | null> // 撤销快照，内存态不持久

  /** 从 Dexie 加载全部对话到内存（含一次性旧 localStorage 迁移）；幂等、有在途守卫 */
  init: () => Promise<void>
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

let initPromise: Promise<void> | null = null

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: {},
  activeConvId: null,
  loaded: false,
  snapshots: {},

  init: () => {
    if (initPromise) return initPromise
    initPromise = (async () => {
      let all = await listConversations()
      // 一次性迁移：Dexie 空且 localStorage 有旧 persist 数据（上一版本存的）则迁入 Dexie 后清掉
      if (all.length === 0) {
        const old = localStorage.getItem('omniaresumae-chat')
        if (old) {
          try {
            const parsed = JSON.parse(old)
            const state = parsed?.state ?? parsed
            const oldConvs = (state?.conversations ?? {}) as Record<string, ChatConversation>
            for (const c of Object.values(oldConvs)) {
              if (c?.id) await putConversation(c)
            }
            // 旧 activeConvId 迁到新 key
            if (typeof state?.activeConvId === 'string') saveActive(state.activeConvId)
            all = await listConversations()
            localStorage.removeItem('omniaresumae-chat')
          } catch (e) {
            console.warn('[chatStore] 旧 localStorage 迁移失败，忽略', e)
          }
        }
      }
      const active = loadActive()
      // merge 语义：保留 init 期间（竞态）新建的对话，Dexie 的补入（不覆盖新建的）
      set((s) => {
        const map = { ...s.conversations }
        for (const c of all) if (!map[c.id]) map[c.id] = c
        const validActive = active && map[active] ? active : null
        return { conversations: map, activeConvId: s.activeConvId ?? validActive, loaded: true }
      })
    })()
    return initPromise
  },

  listForResume: (resumeId) =>
    Object.values(get().conversations)
      .filter((c) => c.resumeId === resumeId)
      .sort((a, b) => b.updatedAt - a.updatedAt),

  createConversation: (resumeId, title) => {
    const now = Date.now()
    const id = `conv_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const conv: ChatConversation = {
      id, resumeId, title: title ?? '', entries: [], messages: [], createdAt: now, updatedAt: now,
    }
    set((s) => ({ conversations: { ...s.conversations, [id]: conv }, activeConvId: id }))
    saveActive(id)
    void putConversation(conv).catch((e) => console.warn('[chatStore] put failed', e))
    return id
  },

  updateConversation: (id, patch) => {
    let next: ChatConversation | null = null
    set((s) => {
      const c = s.conversations[id]
      if (!c) return s
      next = { ...c, ...patch, updatedAt: Date.now() }
      return { conversations: { ...s.conversations, [id]: next } }
    })
    if (next) void putConversation(next).catch((e) => console.warn('[chatStore] put failed', e))
  },

  deleteConversation: (id) => {
    set((s) => {
      const next = { ...s.conversations }
      delete next[id]
      const snaps = { ...s.snapshots }
      delete snaps[id]
      const active = s.activeConvId === id ? null : s.activeConvId
      if (s.activeConvId === id) saveActive(null)
      return { conversations: next, snapshots: snaps, activeConvId: active }
    })
    void deleteConversationRow(id).catch((e) => console.warn('[chatStore] delete failed', e))
  },

  deleteForResume: (resumeId) => {
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
      if (active !== s.activeConvId) saveActive(active)
      return { conversations: next, snapshots: snaps, activeConvId: active }
    })
    void deleteConversationsByResume(resumeId).catch((e) => console.warn('[chatStore] deleteForResume failed', e))
  },

  setActive: (id) => {
    set({ activeConvId: id })
    saveActive(id)
  },

  renameConversation: (id, title) => get().updateConversation(id, { title }),

  getSnapshot: (id) => get().snapshots[id] ?? null,
  setSnapshot: (id, resume) =>
    set((s) => ({ snapshots: { ...s.snapshots, [id]: resume } })),
}))
