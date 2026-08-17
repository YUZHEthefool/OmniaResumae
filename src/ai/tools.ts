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
import { isLocalized, mergeLoc, coerceHighlights, coerceItem, LOC_BASICS_KEYS, LOC_ITEM_KEYS } from '@/schema/coerce'
import type { Locale, Localized, Resume, SectionType } from '@/types/resume'
import type { Skill } from '@/skills/types'
import { listMyRepos, getRepoByName, getRepoDetail } from '@/github/client'

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
export function buildResumeTools(locale: Locale, skill?: Skill | null, expectedResumeId?: string): ToolDef[] {
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
            if (v === undefined) continue
            if (LOC_BASICS_KEYS.has(k)) {
              // Localized 字段：接受 {zh,en} 合并或字符串按当前语种写入（保留另一语言），
              // 绝不写裸字符串（否则 pick 返回 ''、名字消失、schema 拒绝）
              if (isLocalized(v)) b[k] = mergeLoc(b[k] as Localized | undefined, v as Localized)
              else if (typeof v === 'string') b[k] = mergeLoc(b[k] as Localized | undefined, { [locale]: v } as Localized)
            } else {
              b[k] = v
            }
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
        const { targetRole, keywords } = args as { targetRole?: Localized; keywords?: unknown[] }
        useResumeStore.getState().update((d) => {
          if (targetRole) {
            if (isLocalized(targetRole)) d.meta.targetRole = mergeLoc(d.meta.targetRole, targetRole)
            else if (typeof targetRole === 'string') d.meta.targetRole = mergeLoc(d.meta.targetRole, { [locale]: targetRole } as Localized)
          }
          if (keywords) {
            // 按当前语种值匹配旧条目以保留另一语言（模型重排序也不会把中英文交叉配错）；
            // 模型若直接给完整 {zh,en} 对象则原样采用。旧实现按索引合并，重排序会交叉。
            const prev = d.meta.keywords ?? []
            d.meta.keywords = (keywords as unknown[]).map((k): Localized => {
              if (isLocalized(k)) return { zh: k.zh, en: k.en }
              const str = typeof k === 'string' ? k : ''
              if (!str.trim()) return { zh: undefined, en: undefined }
              const old = prev.find((p) => (p?.[locale] ?? '') === str)
              return old ? { ...old, [locale]: str } : ({ [locale]: str } as Localized)
            })
          }
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
        const { type, layout, title } = args as { type: SectionType; layout?: 'main' | 'sidebar'; title?: Localized | string }
        const preset = SECTION_TITLE_PRESETS[type] ?? { zh: '自定义', en: 'Custom' }
        // 模型常把 title 传成裸字符串——强制为 {[locale]:title}，否则 title.zh 为 undefined 会静默回退到 preset
        const titleLoc = title ? (typeof title === 'string' ? { [locale]: title } as Localized : title) : undefined
        let newId = ''
        useResumeStore.getState().update((d) => {
          const sec = {
            id: uid('sec'),
            type,
            title: titleLoc ? { zh: titleLoc.zh ?? preset.zh, en: titleLoc.en ?? preset.en } : { ...preset },
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
        let found = false
        useResumeStore.getState().update((d) => {
          const before = d.sections.length
          d.sections = d.sections.filter((s) => s.id !== section_id)
          found = d.sections.length < before
        })
        return found ? 'ok' : '未找到 section'
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
        const { section_id, title, layout, visible } = args as { section_id: string; title?: Localized | string; layout?: 'main' | 'sidebar'; visible?: boolean }
        let found = false
        useResumeStore.getState().update((d) => {
          const s = d.sections.find((x) => x.id === section_id)
          if (!s) return
          found = true
          // 模型可能把 title 传成裸字符串（与 add_section 一致地强制为 {[locale]:title}），否则 title.zh 为 undefined 静默无效
          if (title) {
            const t = typeof title === 'string' ? { [locale]: title } as Localized : title
            s.title = { zh: t.zh ?? s.title.zh, en: t.en ?? s.title.en }
          }
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
          // 强制 item 字段为安全形态（字符串→Localized、highlights→数组、剥 stray id），
          // 再覆盖到 base 骨架上。旧实现仅 isLocalized(base[k])&&isLocalized(v) 合并——base 字段
          // 初始化为 {} 使 isLocalized 恒 false，合并分支是死代码；模型传裸字符串会原样写入致 pick 失效。
          const merged = { ...base, ...coerceItem(s.type, item, locale) } as Record<string, unknown>
          merged.id = base.id
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
            if (k === 'id' || v === undefined) continue
            if (LOC_ITEM_KEYS.has(k)) {
              if (isLocalized(v)) it[k] = mergeLoc(it[k] as Localized | undefined, v as Localized)
              else if (typeof v === 'string') it[k] = mergeLoc(it[k] as Localized | undefined, { [locale]: v } as Localized)
            } else if (k === 'highlights') {
              it[k] = coerceHighlights(v, locale, (it[k] as Localized[]) ?? [])
            } else {
              it[k] = v
            }
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
        const { section_id, item_id, highlights } = args as { section_id: string; item_id: string; highlights: unknown[] }
        let found = false
        useResumeStore.getState().update((d) => {
          const s = d.sections.find((x) => x.id === section_id)
          if (!s) return
          const it = s.items.find((x) => (x as { id: string }).id === item_id) as { highlights?: Localized[] } | undefined
          if (!it) return
          found = true
          it.highlights = coerceHighlights(highlights, locale, it.highlights ?? [])
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
        let found = false
        useResumeStore.getState().update((d) => {
          const s = d.sections.find((x) => x.id === section_id)
          if (!s) return
          const before = s.items.length
          s.items = s.items.filter((x) => (x as { id: string }).id !== item_id)
          found = s.items.length < before
        })
        return found ? 'ok' : '未找到 item'
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

  // 防止运行中切换/新建简历：工具执行时若当前简历已不是发起会话的那份，跳过编辑，
  // 避免 AI 改动落到另一份简历而撤销快照仍指向原简历（数据错位）。
  if (expectedResumeId) {
    for (const tool of tools) {
      const orig = tool.run
      tool.run = (args) => {
        if (useResumeStore.getState().current?.id !== expectedResumeId) return '会话所在简历已切换，本次编辑已跳过'
        return orig(args)
      }
    }
  }
  return tools
}

/* ─── GitHub 工具（只读）：让 AI 能查用户的真实仓库，据此填充项目段落 ─── */
/**
 * 构造 GitHub 工具集。PAT 为空时返回空数组——模型不会知道这些工具的存在，
 * 也就不会尝试调用；system prompt 另提示用户去「设置」配 PAT（按需披露，避免模型以为能用却失败）。
 * 工具只读（列仓库 / 读 README 与详情），不改仓库；PAT 仅发往 api.github.com，从不进入简历数据或导出。
 */
export function buildGithubTools(pat: string): ToolDef[] {
  if (!pat) return []
  return [
    {
      name: 'list_my_repos',
      description:
        '列出当前 GitHub 认证用户（PAT 持有者）的仓库：名称、描述、stars、主语言、topics、URL、最后更新时间。用于了解用户有哪些真实项目可写入简历。需先在「设置」配置 GitHub PAT。',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => {
        try {
          const repos = await listMyRepos(pat)
          if (!repos.length) return '没有找到非 fork、非归档的仓库'
          return JSON.stringify(
            repos.slice(0, 30).map((r) => ({
              full_name: r.full_name,
              description: (r.description ?? '').slice(0, 200),
              stars: r.stargazers_count,
              language: r.language,
              topics: (r.topics ?? []).slice(0, 10),
              url: r.html_url,
              updated_at: r.updated_at,
            })),
          )
        } catch (e) {
          return `GitHub 查询失败：${(e as Error).message}`
        }
      },
    },
    {
      name: 'get_repo_detail',
      description:
        '取某仓库的详情：语言列表、stars、topics、描述、README 内容。用于给项目段落填 keywords/stars/description/highlights。参数 owner/repo（如 "YUZHEthefool/OmniaResumae"）。',
      input_schema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者（用户名或组织名）' },
          repo: { type: 'string', description: '仓库名' },
        },
        required: ['owner', 'repo'],
        additionalProperties: false,
      },
      run: async (args) => {
        const { owner, repo } = args as { owner: string; repo: string }
        try {
          const r = await getRepoByName(owner, repo, pat)
          if (!r) return `未找到仓库 ${owner}/${repo}`
          const d = await getRepoDetail(r, pat)
          return JSON.stringify({
            full_name: r.full_name,
            description: d.description,
            stars: d.stars,
            languages: d.languages,
            topics: d.topics,
            url: d.url,
            homepage: r.homepage,
            // README 截断：够 AI 提取要点即可，避免长 README 撑爆对话上下文
            readme: d.readme.slice(0, 6000),
          })
        } catch (e) {
          return `GitHub 查询失败：${(e as Error).message}`
        }
      },
    },
  ]
}
