/**
 * 简历状态 store
 * - current: 当前编辑的简历（内存中实时编辑）
 * - list: 顶栏切换用的简历清单
 * - update(fn): 结构化克隆当前简历 -> 修改 draft -> 提交，并触发节流自动保存到 Dexie
 *
 * 保存机制（健壮化）：
 * - 节流 600ms，但切换/删除/改名前 flushSave 落盘，卸载/隐藏页也冲写，避免丢最后一次编辑。
 * - putResume 串行化（savePromise 链），杜绝乱序覆盖；rejection 不静默丢（置 error）。
 * - 删除某简历时若其有待写草稿则丢弃而非落盘，避免"删除后复活"。
 * - BroadcastChannel 跨标签同步：他标签改了同一简历→重载 current；他标签增删→refreshList。
 */
import { create } from 'zustand'
import type { Resume, Section, SectionType, Layout } from '@/types/resume'
import { db, listResumes, putResume, deleteResume } from '@/db'
import { createEmptyResume, nowStamp, uid } from '@/schema/defaults'
import { SECTION_TITLE_PRESETS } from '@/schema/defaults'
import { createSampleResume } from '@/schema/seed'
import { getTemplate } from '@/templates/registry'
import { useChatStore } from '@/store/chatStore'

type ListEntry = { id: string; name: string; updatedAt: number }
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingDraft: Resume | null = null
let savePromise: Promise<void> = Promise.resolve()

/* ─── 跨标签广播（尽力而为；无 BroadcastChannel 时降级为 no-op） ─── */
let bc: BroadcastChannel | null = null
try {
  bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('omniaresumae') : null
} catch {
  bc = null
}
function notify(msg: unknown) {
  try { bc?.postMessage(msg) } catch { /* ignore */ }
}

/** 串行落盘：保证顺序、吞 rejection 不让 UI 崩、成功置 saved/失败置 error 并广播 */
function doPut(r: Resume) {
  savePromise = savePromise
    .then(() => putResume(r))
    .then(() => {
      useResumeStore.setState({ saveStatus: 'saved' })
      notify({ type: 'saved', id: r.id })
    })
    .catch((e) => {
      console.error('[resumeStore] save failed', e)
      useResumeStore.setState({ saveStatus: 'error' })
    })
}

function scheduleSave(r: Resume) {
  pendingDraft = r
  if (saveTimer) clearTimeout(saveTimer)
  useResumeStore.setState({ saveStatus: 'saving' })
  saveTimer = setTimeout(() => {
    saveTimer = null
    const draft = pendingDraft
    pendingDraft = null
    if (draft) doPut(draft)
  }, 600)
}

/** 把任何待写草稿立即落盘并等其完成（切换/删除/改名/卸载前调用） */
async function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  const d = pendingDraft
  pendingDraft = null
  if (d) doPut(d)
  await savePromise
}

interface ResumeState {
  current: Resume | null
  list: ListEntry[]
  loaded: boolean
  saveStatus: SaveStatus
  // 生命周期
  init: () => Promise<void>
  refreshList: () => Promise<void>
  create: (name?: string) => Promise<string>
  select: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  duplicate: (id?: string) => Promise<string | undefined>
  // 编辑
  update: (fn: (draft: Resume) => void) => void
  addSection: (type: SectionType, layout: Layout) => void
  removeSection: (sectionId: string) => void
  toggleSectionVisible: (sectionId: string) => void
  moveSection: (sectionId: string, dir: -1 | 1) => void
  moveSectionTo: (from: number, to: number) => void
  moveItemTo: (sectionId: string, from: number, to: number) => void
}

export const useResumeStore = create<ResumeState>((set, get) => ({
  current: null,
  list: [],
  loaded: false,
  saveStatus: 'idle',

  async init() {
    if (get().loaded) return

    // 跨标签同步监听
    if (bc) {
      bc.onmessage = (ev) => {
        const m = ev.data
        if (!m || typeof m !== 'object') return
        if (m.type === 'saved' && get().current?.id === m.id && !pendingDraft) {
          // 他标签改了同一简历：重载 current。本标签若有未落盘草稿则跳过，避免丢本标签编辑
          db.resumes.get(m.id as string).then((r) => { if (r) set({ current: r }) })
        } else if (m.type === 'list') {
          void get().refreshList()
        }
      }
    }

    let resumes = await listResumes()
    if (resumes.length === 0) {
      const r = createSampleResume(nowStamp())
      await putResume(r)
      resumes = [r]
    }
    // 逐项容错：单行坏数据不应让整个 init 卡死；顺带清理陈旧/已删模板 id。
    resumes = resumes.map((r) => {
      try {
        let row = r
        if (!getTemplate(row.templateId)) row = { ...row, templateId: 'serif-classic' }
        const cleaned = sanitizeResume(row)
        if (cleaned !== row || row.templateId !== r.templateId) void putResume(cleaned)
        return cleaned
      } catch (e) {
        console.error('[resumeStore] sanitize failed for', r?.id, e)
        return r
      }
    })
    set({
      current: resumes[0],
      list: resumes.map(toEntry),
      loaded: true,
    })

    // 卸载/隐藏页冲写，避免关页丢最后一次 <600ms 编辑
    window.addEventListener('pagehide', () => { void flushSave() })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushSave()
    })
  },

  async refreshList() {
    const resumes = await listResumes()
    set({ list: resumes.map(toEntry) })
  },

  async create(name) {
    await flushSave()
    const r = createEmptyResume(name ?? `简历 ${get().list.length + 1}`)
    await putResume(r)
    set({ current: r, list: [toEntry(r), ...get().list] })
    notify({ type: 'list' })
    return r.id
  },

  async select(id) {
    await flushSave()
    const r = await db.resumes.get(id)
    if (r) set({ current: r })
  },

  async remove(id) {
    // 被删简历若有待写草稿：丢弃，避免删后复活；否则先把别的待写落盘
    if (pendingDraft?.id === id) {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
      pendingDraft = null
    } else {
      await flushSave()
    }
    await deleteResume(id)
    // 清孤儿对话快照（含整份 resume 深拷贝，释放内存）
    try { useChatStore.getState().clearSession(id) } catch { /* ignore */ }
    const list = get().list.filter((e) => e.id !== id)
    let current = get().current
    if (current?.id === id) {
      if (list.length === 0) {
        const r = createEmptyResume('我的简历')
        await putResume(r)
        set({ current: r, list: [toEntry(r)] })
        notify({ type: 'list' })
        return
      }
      const next = await db.resumes.get(list[0].id)
      current = next ?? null
    }
    set({ current, list })
    notify({ type: 'list' })
  },

  async rename(id, name) {
    await flushSave()
    const cur = get().current
    const target = cur?.id === id ? cur : await db.resumes.get(id)
    if (!target) return
    const updated: Resume = { ...target, name, updatedAt: nowStamp() }
    await putResume(updated)
    await get().refreshList()
    if (get().current?.id === id) set({ current: updated })
    notify({ type: 'saved', id })
  },

  async duplicate(id) {
    await flushSave()
    const cur = get().current
    const src = id ? (cur?.id === id ? cur : await db.resumes.get(id)) : cur
    if (!src) return
    const copy = structuredClone(src) as Resume
    copy.id = uid('resume')
    copy.name = `${src.name} 副本`
    const t = nowStamp()
    copy.createdAt = t
    copy.updatedAt = t
    await putResume(copy)
    set({ current: copy, list: [toEntry(copy), ...get().list] })
    notify({ type: 'list' })
    return copy.id
  },

  update(fn) {
    const cur = get().current
    if (!cur) return
    const draft = structuredClone(cur) as Resume
    fn(draft)
    draft.updatedAt = nowStamp()
    scheduleSave(draft)
    set({ current: draft })
    // 同步 list 条目名/时间
    set((s) => ({
      list: s.list.map((e) =>
        e.id === draft.id ? { id: draft.id, name: draft.name, updatedAt: draft.updatedAt } : e,
      ),
    }))
  },

  addSection(type, layout) {
    const preset = SECTION_TITLE_PRESETS[type]
    get().update((d) => {
      d.sections.push({
        id: uid('sec'),
        type,
        title: { zh: preset.zh, en: preset.en },
        layout,
        items: [],
        visible: true,
      })
    })
  },

  removeSection(sectionId) {
    get().update((d) => {
      d.sections = d.sections.filter((s: Section) => s.id !== sectionId)
    })
  },

  toggleSectionVisible(sectionId) {
    get().update((d) => {
      const s = d.sections.find((x) => x.id === sectionId)
      if (s) s.visible = !s.visible
    })
  },

  moveSection(sectionId, dir) {
    get().update((d) => {
      const i = d.sections.findIndex((s) => s.id === sectionId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= d.sections.length) return
      ;[d.sections[i], d.sections[j]] = [d.sections[j], d.sections[i]]
    })
  },

  moveSectionTo(from, to) {
    get().update((d) => {
      if (from < 0 || to < 0 || from >= d.sections.length || to >= d.sections.length || from === to) return
      const [moved] = d.sections.splice(from, 1)
      d.sections.splice(to, 0, moved)
    })
  },

  moveItemTo(sectionId, from, to) {
    get().update((d) => {
      const s = d.sections.find((x) => x.id === sectionId)
      if (!s) return
      const items = s.items
      if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return
      const [moved] = items.splice(from, 1)
      items.splice(to, 0, moved)
    })
  },
}))

function toEntry(r: Resume): ListEntry {
  return { id: r.id, name: r.name, updatedAt: r.updatedAt }
}

/** uid 格式：prefix_num_xxxx（如 work_1_qgogeu），是内部主键，绝不该作为可见字段值 */
const UID_RE = /^[a-z]+_[0-9a-z]+_[a-z0-9]{4,}$/

/**
 * 递归清空 Localized 字段中值为 uid 格式的脏数据；防御性（缺字段不抛）；返回新 resume（无变更则原引用）。
 * 注意：对 basics/meta/title 也要赋回 cleanLoc 的返回值，否则迁移不生效（旧版 bug）。
 */
function sanitizeResume(r: Resume): Resume {
  let changed = false
  const cleanLoc = (loc: unknown): { zh?: string; en?: string } | undefined => {
    if (!loc || typeof loc !== 'object') return loc as { zh?: string; en?: string } | undefined
    const o = loc as { zh?: string; en?: string }
    const zh = typeof o.zh === 'string' && UID_RE.test(o.zh) ? '' : o.zh
    const en = typeof o.en === 'string' && UID_RE.test(o.en) ? '' : o.en
    if (zh !== o.zh || en !== o.en) {
      changed = true
      return { zh: zh || undefined, en: en || undefined }
    }
    return o
  }
  const assign = (obj: Record<string, unknown> | undefined, key: string) => {
    if (!obj) return
    const cur = obj[key]
    const c = cleanLoc(cur)
    if (c !== cur) obj[key] = c
  }
  if (r.basics) {
    assign(r.basics as unknown as Record<string, unknown>, 'name')
    assign(r.basics as unknown as Record<string, unknown>, 'label')
    assign(r.basics as unknown as Record<string, unknown>, 'summary')
    assign(r.basics as unknown as Record<string, unknown>, 'location')
  }
  if (r.meta) {
    assign(r.meta as unknown as Record<string, unknown>, 'targetRole')
    if (Array.isArray(r.meta.keywords)) {
      r.meta.keywords = r.meta.keywords.map((k) => cleanLoc(k) ?? k)
    }
  }
  if (Array.isArray(r.sections)) {
    for (const s of r.sections) {
      if (!s) continue
      assign(s as unknown as Record<string, unknown>, 'title')
      if (Array.isArray(s.items)) {
        for (const it of s.items as Array<Record<string, unknown>>) {
          if (!it) continue
          // 兜底：work/projects/education 条目的 highlights 必须是数组，旧数据/AI 产出可能缺失，
          // 缺失则下游模板 item.highlights.filter / 编辑器 LocalizedList 崩溃。
          if ((s.type === 'work' || s.type === 'projects' || s.type === 'education') && !Array.isArray(it.highlights)) {
            it.highlights = []
            changed = true
          }
          for (const k of Object.keys(it)) {
            const v = it[k]
            if (v && typeof v === 'object' && ('zh' in v || 'en' in v)) {
              const c = cleanLoc(v)
              if (c !== v) it[k] = c
            }
            if (Array.isArray(v)) {
              for (let i = 0; i < v.length; i++) {
                if (v[i] && typeof v[i] === 'object' && ('zh' in v[i] || 'en' in v[i])) {
                  const c = cleanLoc(v[i])
                  if (c !== v[i]) v[i] = c
                }
              }
            }
          }
        }
      }
    }
  }
  return changed ? { ...r } : r
}
