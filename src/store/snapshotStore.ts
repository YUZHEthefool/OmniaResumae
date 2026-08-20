/**
 * 简历快照 store：命名版本管理（多版本投递）。
 *
 * 模型：快照是一份简历在某个时点的命名深拷贝，独立于 resumes 表（不污染顶栏简历下拉）。
 * - snapshots: Record<id, Snapshot> —— 内存缓存，真相源是 Dexie snapshots 表
 * - 按简历隔离：listForResume(resumeId) 返回该简历的全部快照（按 createdAt 降序）
 *
 * 持久化：init 时从 Dexie 批量加载到内存；每个 mutator 既 set 内存又 fire-and-forget 写 Dexie。
 * 切换简历时由 SnapshotDialog 调 load(resumeId) 刷新本简历的快照视图。
 *
 * 与 chatStore 同构（zustand + Dexie 双写）。
 */
import { create } from 'zustand'
import type { Snapshot } from '@/types/resume'
import {
  listAllSnapshots, listSnapshotsByResume, putSnapshot, deleteSnapshotRow, deleteSnapshotsByResume,
} from '@/db'
import { uid, nowStamp } from '@/schema/defaults'

interface SnapshotState {
  /** 全部快照的内存缓存（key = snapshot id），真相源 Dexie */
  snapshots: Record<string, Snapshot>
  loaded: boolean

  /** 从 Dexie 加载全部快照到内存；幂等、有在途守卫 */
  init: () => Promise<void>
  /** 列出某 resume 的快照，按 createdAt 降序 */
  listForResume: (resumeId: string) => Snapshot[]
  /** 刷新某 resume 的快照（切换简历时调用，确保 Dexie 与内存一致） */
  load: (resumeId: string) => Promise<void>
  /** 新建快照：深拷贝 resume + 新 id + 命名。返回新快照 id */
  create: (resumeId: string, resume: Snapshot['resume'], name: string) => string
  /** 删除快照 */
  remove: (id: string) => void
  /** 删除某 resume 的全部快照（resume 被删时级联调用） */
  deleteForResume: (resumeId: string) => void
}

let initPromise: Promise<void> | null = null

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshots: {},
  loaded: false,

  init: () => {
    if (initPromise) return initPromise
    initPromise = (async () => {
      const all = await listAllSnapshots()
      const map: Record<string, Snapshot> = {}
      for (const s of all) map[s.id] = s
      set({ snapshots: map, loaded: true })
    })()
    return initPromise
  },

  listForResume: (resumeId) =>
    Object.values(get().snapshots)
      .filter((s) => s.resumeId === resumeId)
      .sort((a, b) => b.createdAt - a.createdAt),

  load: async (resumeId) => {
    // 从 Dexie 重读本简历快照，合并进内存（保留其他简历的缓存）
    const fresh = await listSnapshotsByResume(resumeId)
    set((s) => {
      const map = { ...s.snapshots }
      // 先移除本简历的旧缓存条目，再用 Dexie 最新结果覆盖
      for (const id of Object.keys(map)) if (map[id].resumeId === resumeId) delete map[id]
      for (const sn of fresh) map[sn.id] = sn
      return { snapshots: map }
    })
  },

  create: (resumeId, resume, name) => {
    const id = uid('snap')
    const snap: Snapshot = {
      id,
      resumeId,
      name: name.trim() || (resume.name + ' 快照'),
      resume: structuredClone(resume),
      createdAt: nowStamp(),
    }
    set((s) => ({ snapshots: { ...s.snapshots, [id]: snap } }))
    void putSnapshot(snap).catch((e) => console.warn('[snapshotStore] put failed', e))
    return id
  },

  remove: (id) => {
    set((s) => {
      const next = { ...s.snapshots }
      delete next[id]
      return { snapshots: next }
    })
    void deleteSnapshotRow(id).catch((e) => console.warn('[snapshotStore] delete failed', e))
  },

  deleteForResume: (resumeId) => {
    set((s) => {
      const next: Record<string, Snapshot> = {}
      for (const [id, sn] of Object.entries(s.snapshots)) {
        if (sn.resumeId !== resumeId) next[id] = sn
      }
      return { snapshots: next }
    })
    void deleteSnapshotsByResume(resumeId).catch((e) => console.warn('[snapshotStore] deleteForResume failed', e))
  },
}))
