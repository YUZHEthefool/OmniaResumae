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
// 撤销检查点节流：距上次编辑 >1s 视为新编辑段，把"改前状态"压栈（避免每次按键都压栈）
let lastEditMs = 0
// init 的在途 Promise：React 18 StrictMode（dev）会双调用 effect，裸 `loaded` 守卫在异步
// resolve 前拦不住第二次调用，导致两调用都看到空 DB、各创建一份示例简历。用一个在途
// Promise 串行化，确保 init 全过程只跑一次。
let initPromise: Promise<void> | null = null

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
  // 撤销/重做历史（内存，不持久；切简历/增删/初始化时清空）
  past: Resume[]
  future: Resume[]
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
  // 撤销/重做 + 强制保存
  undo: () => void
  redo: () => void
  saveNow: () => Promise<void>
}

export const useResumeStore = create<ResumeState>((set, get) => ({
  current: null,
  list: [],
  loaded: false,
  saveStatus: 'idle',
  past: [],
  future: [],

  async init() {
    if (get().loaded) return
    if (initPromise) return initPromise
    initPromise = (async () => {
    // 跨标签同步监听
    if (bc) {
      bc.onmessage = (ev) => {
        const m = ev.data
        if (!m || typeof m !== 'object') return
        if (m.type === 'saved' && get().current?.id === m.id && !pendingDraft) {
          // 他标签改了同一简历：重载 current。但本标签若有未落盘草稿则跳过，避免丢本标签编辑。
          // 注意 get 是异步的：接收消息时无草稿 ≠ set 时仍无草稿——用户若在这个 IDB 读窗口内
          // 按了一个键，pendingDraft 已置；此时再 set 旧版会覆盖本地编辑致数据丢失。故 .then 内二次校验。
          // 跨标签重载等同"切换到 DB 版本"：清 past/future（否则本标签 undo 会把他标签编辑覆盖回去）。
          db.resumes.get(m.id as string).then((r) => {
            if (r && !pendingDraft && get().current?.id === m.id) { lastEditMs = 0; set({ current: r, past: [], future: [] }) }
          })
        } else if (m.type === 'list') {
          // 他标签增删简历：刷新顶栏列表，并协调 current——若当前简历已被他标签删除，
          // 须切到剩余的第一个（或新建），否则本标签仍指向已删 id，编辑写入会"复活"它。
          void (async () => {
            await get().refreshList()
            const c = get().current
            if (c && !get().list.some((e) => e.id === c.id)) {
              if (pendingDraft?.id === c.id) { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }; pendingDraft = null }
              const list = get().list
              if (list.length) {
                const r = await db.resumes.get(list[0].id)
                if (r) { lastEditMs = 0; set({ current: r, past: [], future: [] }) }
              } else {
                const r = createEmptyResume('我的简历')
                await putResume(r)
                lastEditMs = 0
                set({ current: r, list: [toEntry(r)], past: [], future: [] })
                notify({ type: 'list' })
              }
            }
          })()
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
        if (cleaned !== row || row.templateId !== r.templateId) void putResume(cleaned).catch((e) => console.error('[resumeStore] sanitize persist failed', e))
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
    })()
    await initPromise
  },

  async refreshList() {
    const resumes = await listResumes()
    set({ list: resumes.map(toEntry) })
  },

  async create(name) {
    await flushSave()
    const r = createEmptyResume(name ?? `简历 ${get().list.length + 1}`)
    await putResume(r)
    lastEditMs = 0
    set({ current: r, list: [toEntry(r), ...get().list], past: [], future: [] })
    notify({ type: 'list' })
    return r.id
  },

  async select(id) {
    await flushSave()
    const r = await db.resumes.get(id)
    if (r) { lastEditMs = 0; set({ current: r, past: [], future: [] }) }
  },

  async remove(id) {
    // 被删简历若有待写草稿：丢弃，避免删后复活；否则先把别的待写落盘
    if (pendingDraft?.id === id) {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
      pendingDraft = null
      // 仍要等已入队的 putResume(id) 落盘完成再删：savePromise 链可能被前一个慢 put 堵住，
      // doPut(id) 已入链但尚未执行；若直接 deleteResume(id)，IDB 事务先于排队中的 put 落盘，
      // 随后 put 才写回 → 已删简历复活。等链清空（被丢弃的 draft 不会再入链）再删即顺序正确。
      await savePromise
    } else {
      await flushSave()
    }
    await deleteResume(id)
    // 清孤儿对话快照（含整份 resume 深拷贝，释放内存）
    try { useChatStore.getState().deleteForResume(id) } catch { /* ignore */ }
    const list = get().list.filter((e) => e.id !== id)
    let current = get().current
    if (current?.id === id) {
      if (list.length === 0) {
        const r = createEmptyResume('我的简历')
        await putResume(r)
        lastEditMs = 0
        set({ current: r, list: [toEntry(r)], past: [], future: [] })
        notify({ type: 'list' })
        return
      }
      const next = await db.resumes.get(list[0].id)
      current = next ?? null
    }
    lastEditMs = 0
    set({ current, list, past: [], future: [] })
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
    notify({ type: 'list' }) // 改名影响顶栏列表，其它标签需 refreshList 才能看到新名
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
    lastEditMs = 0
    set({ current: copy, list: [toEntry(copy), ...get().list], past: [], future: [] })
    notify({ type: 'list' })
    return copy.id
  },

  update(fn) {
    const cur = get().current
    if (!cur) return
    // 撤销检查点：距上次编辑 >1s 视为新编辑段，把改前状态压栈（限 50，清 future）
    const now = Date.now()
    if (now - lastEditMs > 1000) {
      set((s) => ({ past: [...s.past, structuredClone(cur)].slice(-50), future: [] }))
    }
    lastEditMs = now
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

  undo() {
    const { past, current } = get()
    if (!past.length || !current) return
    const prev = past[past.length - 1]
    const restored = structuredClone(prev)
    restored.updatedAt = nowStamp()
    lastEditMs = 0 // 让紧接着的编辑把 restored 当作新检查点起点
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [current, ...s.future].slice(0, 50),
      current: restored,
      list: s.list.map((e) => (e.id === restored.id ? { id: restored.id, name: restored.name, updatedAt: restored.updatedAt } : e)),
    }))
    scheduleSave(restored)
  },

  redo() {
    const { future, current } = get()
    if (!future.length || !current) return
    const next = future[0]
    const restored = structuredClone(next)
    restored.updatedAt = nowStamp()
    lastEditMs = 0
    set((s) => ({
      future: s.future.slice(1),
      past: [...s.past, current].slice(-50),
      current: restored,
      list: s.list.map((e) => (e.id === restored.id ? { id: restored.id, name: restored.name, updatedAt: restored.updatedAt } : e)),
    }))
    scheduleSave(restored)
  },

  async saveNow() {
    set({ saveStatus: 'saving' })
    await flushSave()
    // doPut 失败时其 catch 会置 'error' 并吞掉 rejection（savePromise 仍 resolve），故此处不能
    // 无条件置 'saved'，否则落盘失败仍显示已保存、用户以为成功后关页丢数据。
    if (useResumeStore.getState().saveStatus !== 'error') set({ saveStatus: 'saved' })
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
          // keywords/languages/courses 运行时按数组用（模板 .join/.map、导出 .map）；旧 AI 产出可能
          // 是逗号字符串，致 (... ?? []).join() 对字符串求值不回退 → TypeError 崩全应用。兜底成数组。
          for (const f of ['keywords', 'languages', 'courses'] as const) {
            if (f in it && !Array.isArray(it[f])) { it[f] = []; changed = true }
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
