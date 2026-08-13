/**
 * 字段级简历编辑工具（agent 实时操作当前简历）
 *
 * 每个工具的 run 在执行时从 useResumeStore.getState() 取最新简历，用 update() 实时写入，
 * 编辑器/预览即时更新。Localized 字段逐语种合并，绝不擦除另一语言。
 * baseItem 镜像 itemEditors.createItem，保证结构与编辑器新建条目一致。
 */
import type { ToolDef } from './agent'
import { useResumeStore } from '@/store/resumeStore'
import { uid, SECTION_TITLE_PRESETS } from '@/schema/defaults'
import type { Locale, Localized, Resume, SectionType } from '@/types/resume'
import type { Skill } from '@/skills/types'

/* ─── 辅助 ─── */
function isLocalized(v: unknown): v is Localized {
  return !!v && typeof v === 'object' && ('zh' in v || 'en' in v)
}
/** 逐语种合并 Localized（保留已有语言，补入新语言） */
function mergeLoc(base: Localized | undefined, patch: Localized | undefined): Localized | undefined {
  if (!patch) return base
  return { zh: patch.zh ?? base?.zh, en: patch.en ?? base?.en }
}

/** 镜像 createItem：按 type 给带 uid + 必填骨架的条目 */
function baseItem(type: string): Record<string, unknown> {
  switch (type) {
    case 'work': return { id: uid('work'), name: {}, position: {}, highlights: [] }
    case 'education': return { id: uid('edu'), institution: {}, area: {} }
    case 'projects': return { id: uid('proj'), name: {}, description: {}, highlights: [], badge: 'oss' }
    case 'skills': return { id: uid('skill'), name: {} }
    case 'awards': return { id: uid('award'), title: {} }
    case 'publications': return { id: uid('pub'), name: {} }
    case 'matches': return { id: uid('match'), tag: {}, body: {} }
    case 'domains': return { id: uid('domain'), icon: '', name: {}, sub: {} }
    case 'workflow': return { id: uid('wf'), label: {}, text: {} }
    case 'community': return { id: uid('comm'), platform: '', handle: '', url: '' }
    default: return { id: uid('item') }
  }
}

function defaultLayout(type: SectionType): 'main' | 'sidebar' {
  return ['matches', 'domains', 'awards', 'publications', 'community'].includes(type) ? 'sidebar' : 'main'
}

/** get_resume 的紧凑快照：全量条目，大简历截断 */
function snapshot(r: Resume, _locale: Locale): string {
  const sections = r.sections.map((s) => {
    const items = s.items.slice(0, 30).map((it) => {
      const src = it as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(src)) {
        if (k === 'highlights' && Array.isArray(v)) {
          out[k] = v.map((h) => {
            if (h && typeof h === 'object') {
              const lh = h as Localized
              return {
                zh: (lh.zh ?? '').slice(0, 300),
                en: (lh.en ?? '').slice(0, 300),
              }
            }
            return String(h).slice(0, 300)
          })
        } else {
          out[k] = v
        }
      }
      return out
    })
    return {
      id: s.id,
      type: s.type,
      title: s.title,
      layout: s.layout,
      visible: s.visible,
      itemCount: s.items.length,
      items,
    }
  })
  return JSON.stringify({
    name: r.name,
    templateId: r.templateId,
    basics: r.basics,
    meta: r.meta,
    locale: r.locale,
    sections,
  })
}

/* ─── 工具构造 ─── */
export function buildResumeTools(locale: Locale, skill?: Skill | null): ToolDef[] {
  const tools: ToolDef[] = [
    {
      name: 'get_resume',
      description: '查看用户当前简历的完整结构（含所有段落与条目 id）。每次修改前先调用了解现状。',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => {
        const r = useResumeStore.getState().current
        return r ? snapshot(r, locale) : '当前没有打开的简历'
      },
    },
    {
      name: 'set_basics',
      description: '更新简历基本信息。Localizable 字段（name/label/summary/location）按语种合并，不覆盖另一语言。',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'object', properties: { zh: { type: 'string' }, en: { type: 'string' } } },
          label: { type: 'object', properties: { zh: { type: 'string' }, en: { type: 'string' } } },
          summary: { type: 'object', properties: { zh: { type: 'string' }, en: { type: 'string' } } },
          location: { type: 'object', properties: { zh: { type: 'string' }, en: { type: 'string' } } },
          nameRomanized: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          url: { type: 'string' },
        },
        additionalProperties: false,
      },
      run: (args) => {
        const patch = args as Record<string, unknown>
        useResumeStore.getState().update((d) => {
          const b = d.basics as unknown as Record<string, unknown>
          for (const [k, v] of Object.entries(patch)) {
            if (isLocalized(b[k]) && isLocalized(v)) b[k] = mergeLoc(b[k] as Localized, v as Localized)
            else if (v !== undefined) b[k] = v
          }
        })
        return 'ok: basics 已更新'
      },
    },
    {
      name: 'set_meta',
      description: '更新 meta：targetRole（Localized）或 keywords（Localized 数组）。',
      input_schema: {
        type: 'object',
        properties: {
          targetRole: { type: 'object', properties: { zh: { type: 'string' }, en: { type: 'string' } } },
          keywords: { type: 'array', items: { type: 'object', properties: { zh: { type: 'string' }, en: { type: 'string' } } } },
        },
        additionalProperties: false,
      },
      run: (args) => {
        const { targetRole, keywords } = args as { targetRole?: Localized; keywords?: Localized[] }
        useResumeStore.getState().update((d) => {
          if (targetRole) d.meta.targetRole = mergeLoc(d.meta.targetRole, targetRole)
          if (keywords) d.meta.keywords = keywords
        })
        return 'ok: meta 已更新'
      },
    },
    {
      name: 'add_section',
      description: '新增一个段落（如 skills/projects/work 等）。返回新段 id 供后续 add_item 用。',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['skills', 'projects', 'work', 'education', 'awards', 'publications', 'matches', 'domains', 'workflow', 'community', 'custom'] },
          layout: { type: 'string', enum: ['main', 'sidebar'] },
          title: { type: 'object', properties: { zh: { type: 'string' }, en: { type: 'string' } } },
        },
        required: ['type'],
        additionalProperties: false,
      },
      run: (args) => {
        const { type, layout, title } = args as { type: SectionType; layout?: 'main' | 'sidebar'; title?: Localized }
        const preset = SECTION_TITLE_PRESETS[type] ?? { zh: '自定义', en: 'Custom' }
        let newId = ''
        useResumeStore.getState().update((d) => {
          const sec = {
            id: uid('sec'),
            type,
            title: title ? { zh: title.zh ?? preset.zh, en: title.en ?? preset.en } : { ...preset },
            layout: layout ?? defaultLayout(type),
            items: [],
            visible: true,
          }
          newId = sec.id
          d.sections.push(sec as never)
        })
        return JSON.stringify({ section_id: newId })
      },
    },
    {
      name: 'remove_section',
      description: '按 section_id 删除整个段落。',
      input_schema: { type: 'object', properties: { section_id: { type: 'string' } }, required: ['section_id'], additionalProperties: false },
      run: (args) => {
        const { section_id } = args as { section_id: string }
        useResumeStore.getState().update((d) => {
          d.sections = d.sections.filter((s) => s.id !== section_id)
        })
        return 'ok'
      },
    },
    {
      name: 'update_section',
      description: '更新段落的标题、布局或可见性。',
      input_schema: {
        type: 'object',
        properties: {
          section_id: { type: 'string' },
          title: { type: 'object', properties: { zh: { type: 'string' }, en: { type: 'string' } } },
          layout: { type: 'string', enum: ['main', 'sidebar'] },
          visible: { type: 'boolean' },
        },
        required: ['section_id'],
        additionalProperties: false,
      },
      run: (args) => {
        const { section_id, title, layout, visible } = args as { section_id: string; title?: Localized; layout?: 'main' | 'sidebar'; visible?: boolean }
        let found = false
        useResumeStore.getState().update((d) => {
          const s = d.sections.find((x) => x.id === section_id)
          if (!s) return
          found = true
          if (title) s.title = { zh: title.zh ?? s.title.zh, en: title.en ?? s.title.en }
          if (layout) s.layout = layout
          if (visible !== undefined) s.visible = visible
        })
        return found ? 'ok' : '未找到 section'
      },
    },
    {
      name: 'add_item',
      description: '向某段落添加一个条目。item 字段按 type 形态提供（不含 id，系统自动生成）。返回新条目 id。',
      input_schema: {
        type: 'object',
        properties: {
          section_id: { type: 'string' },
          item: { type: 'object', description: '条目对象，字段对应 section 的 type 形态' },
        },
        required: ['section_id', 'item'],
        additionalProperties: false,
      },
      run: (args) => {
        const { section_id, item } = args as { section_id: string; item: Record<string, unknown> }
        let newId = ''
        useResumeStore.getState().update((d) => {
          const s = d.sections.find((x) => x.id === section_id)
          if (!s) return
          const base = baseItem(s.type)
          const merged = { ...base, ...item } as Record<string, unknown>
          merged.id = base.id // 忽略 agent 传的 id
          // Localized 字段逐语种合并
          for (const [k, v] of Object.entries(item)) {
            if (isLocalized(base[k]) && isLocalized(v)) merged[k] = mergeLoc(base[k] as Localized, v as Localized)
          }
          s.items.push(merged as never)
          newId = base.id as string
        })
        return newId ? JSON.stringify({ item_id: newId }) : '未找到 section'
      },
    },
    {
      name: 'update_item',
      description: '按 section_id + item_id 局部更新一个条目。Localized 字段逐语种合并，其余替换。不改 id。',
      input_schema: {
        type: 'object',
        properties: {
          section_id: { type: 'string' },
          item_id: { type: 'string' },
          patch: { type: 'object', description: '要更新的字段（部分条目字段）' },
        },
        required: ['section_id', 'item_id', 'patch'],
        additionalProperties: false,
      },
      run: (args) => {
        const { section_id, item_id, patch } = args as { section_id: string; item_id: string; patch: Record<string, unknown> }
        let found = false
        useResumeStore.getState().update((d) => {
          const s = d.sections.find((x) => x.id === section_id)
          if (!s) return
          const it = s.items.find((x) => (x as { id: string }).id === item_id) as Record<string, unknown> | undefined
          if (!it) return
          found = true
          for (const [k, v] of Object.entries(patch)) {
            if (k === 'id') continue
            if (isLocalized(it[k]) && isLocalized(v)) it[k] = mergeLoc(it[k] as Localized, v as Localized)
            else it[k] = v
          }
        })
        return found ? 'ok' : '未找到 item'
      },
    },
    {
      name: 'replace_highlights',
      description: '整体替换某条目的要点列表（highlights）。精修要点的高频操作。highlights 为 Localized 数组。',
      input_schema: {
        type: 'object',
        properties: {
          section_id: { type: 'string' },
          item_id: { type: 'string' },
          highlights: { type: 'array', items: { type: 'object', properties: { zh: { type: 'string' }, en: { type: 'string' } } } },
        },
        required: ['section_id', 'item_id', 'highlights'],
        additionalProperties: false,
      },
      run: (args) => {
        const { section_id, item_id, highlights } = args as { section_id: string; item_id: string; highlights: Localized[] }
        let found = false
        useResumeStore.getState().update((d) => {
          const s = d.sections.find((x) => x.id === section_id)
          if (!s) return
          const it = s.items.find((x) => (x as { id: string }).id === item_id) as { highlights?: Localized[] } | undefined
          if (!it) return
          found = true
          it.highlights = highlights.map((h) => ({ zh: h.zh, en: h.en }))
        })
        return found ? 'ok' : '未找到 item'
      },
    },
    {
      name: 'remove_item',
      description: '按 section_id + item_id 删除一个条目。',
      input_schema: {
        type: 'object',
        properties: { section_id: { type: 'string' }, item_id: { type: 'string' } },
        required: ['section_id', 'item_id'],
        additionalProperties: false,
      },
      run: (args) => {
        const { section_id, item_id } = args as { section_id: string; item_id: string }
        useResumeStore.getState().update((d) => {
          const s = d.sections.find((x) => x.id === section_id)
          if (!s) return
          s.items = s.items.filter((x) => (x as { id: string }).id !== item_id)
        })
        return 'ok'
      },
    },
  ]

  if (skill) {
    tools.push({
      name: 'read_reference',
      description: '读取当前 skill 的补充规则片段。name 为 reference 名称。',
      input_schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        additionalProperties: false,
      },
      run: (args) => {
        const name = String((args as { name?: string }).name ?? '')
        const ref = skill.references.find((r) => r.name === name)
        return ref ? ref.content : `未找到 reference: ${name}`
      },
    })
  }

  return tools
}
