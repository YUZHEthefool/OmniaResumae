/**
 * 简历状态 store
 * - current: 当前编辑的简历（内存中实时编辑）
 * - list: 顶栏切换用的简历清单
 * - update(fn): 结构化克隆当前简历 -> 修改 draft -> 提交，并触发节流自动保存到 Dexie
 */
import { create } from 'zustand'
import type { Resume, Section, SectionType, Layout } from '@/types/resume'
import { db, listResumes, putResume, deleteResume } from '@/db'
import { createEmptyResume, nowStamp, uid } from '@/schema/defaults'
import { SECTION_TITLE_PRESETS } from '@/schema/defaults'
import { createSampleResume } from '@/schema/seed'

type ListEntry = { id: string; name: string; updatedAt: number }

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(r: Resume) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void putResume(r)
  }, 600)
}

interface ResumeState {
  current: Resume | null
  list: ListEntry[]
  loaded: boolean
  // 生命周期
  init: () => Promise<void>
  refreshList: () => Promise<void>
  create: (name?: string) => Promise<string>
  select: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  // 编辑
  update: (fn: (draft: Resume) => void) => void
  addSection: (type: SectionType, layout: Layout) => void
  removeSection: (sectionId: string) => void
  toggleSectionVisible: (sectionId: string) => void
  moveSection: (sectionId: string, dir: -1 | 1) => void
}

export const useResumeStore = create<ResumeState>((set, get) => ({
  current: null,
  list: [],
  loaded: false,

  async init() {
    if (get().loaded) return
    let resumes = await listResumes()
    if (resumes.length === 0) {
      const r = createSampleResume(nowStamp())
      await putResume(r)
      resumes = [r]
    }
    // 修复旧版脏数据：清空值为 uid 格式（如 work_1_qgogeu）的本地化字段
    resumes = resumes.map((r) => {
      const cleaned = sanitizeResume(r)
      if (cleaned !== r) void putResume(cleaned)
      return cleaned
    })
    set({
      current: resumes[0],
      list: resumes.map(toEntry),
      loaded: true,
    })
  },

  async refreshList() {
    const resumes = await listResumes()
    set({ list: resumes.map(toEntry) })
  },

  async create(name) {
    const r = createEmptyResume(name ?? `简历 ${get().list.length + 1}`)
    await putResume(r)
    set({ current: r, list: [toEntry(r), ...get().list] })
    return r.id
  },

  async select(id) {
    const r = await db.resumes.get(id)
    if (r) set({ current: r })
  },

  async remove(id) {
    await deleteResume(id)
    const list = get().list.filter((e) => e.id !== id)
    let current = get().current
    if (current?.id === id) {
      if (list.length === 0) {
        const r = createEmptyResume('我的简历')
        await putResume(r)
        set({ current: r, list: [toEntry(r)] })
        return
      }
      const next = await db.resumes.get(list[0].id)
      current = next ?? null
    }
    set({ current, list })
  },

  async rename(id, name) {
    const r = await db.resumes.get(id)
    if (!r) return
    r.name = name
    r.updatedAt = nowStamp()
    await putResume(r)
    await get().refreshList()
    if (get().current?.id === id) set({ current: { ...r } })
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
}))

function toEntry(r: Resume): ListEntry {
  return { id: r.id, name: r.name, updatedAt: r.updatedAt }
}

/** uid 格式：prefix_num_xxxx（如 work_1_qgogeu），是内部主键，绝不该作为可见字段值 */
const UID_RE = /^[a-z]+_[0-9a-z]+_[a-z0-9]{4,}$/

/** 递归清空 Localized 字段中值为 uid 格式的脏数据；返回新 resume（无变更则返回原引用） */
function sanitizeResume(r: Resume): Resume {
  let changed = false
  const cleanLoc = (loc: { zh?: string; en?: string } | undefined): { zh?: string; en?: string } | undefined => {
    if (!loc) return loc
    const zh = loc.zh && UID_RE.test(loc.zh) ? '' : loc.zh
    const en = loc.en && UID_RE.test(loc.en) ? '' : loc.en
    if (zh !== loc.zh || en !== loc.en) {
      changed = true
      return { zh: zh || undefined, en: en || undefined }
    }
    return loc
  }
  // basics
  const b = r.basics
  cleanLoc(b.name); cleanLoc(b.label); cleanLoc(b.summary); cleanLoc(b.location)
  // meta
  if (r.meta.targetRole) cleanLoc(r.meta.targetRole)
  if (r.meta.keywords) r.meta.keywords.forEach((k) => cleanLoc(k))
  // sections
  for (const s of r.sections) {
    cleanLoc(s.title)
    for (const it of s.items as Array<Record<string, unknown>>) {
      for (const k of Object.keys(it)) {
        const v = it[k]
        if (v && typeof v === 'object' && ('zh' in v || 'en' in v)) {
          const cleaned = cleanLoc(v as { zh?: string; en?: string })
          if (cleaned && cleaned !== v) it[k] = cleaned
        }
        // highlights 数组
        if (Array.isArray(v)) {
          for (let i = 0; i < v.length; i++) {
            if (v[i] && typeof v[i] === 'object' && ('zh' in v[i] || 'en' in v[i])) {
              const cleaned = cleanLoc(v[i] as { zh?: string; en?: string })
              if (cleaned && cleaned !== v[i]) v[i] = cleaned
            }
          }
        }
      }
    }
  }
  return changed ? { ...r } : r
}

