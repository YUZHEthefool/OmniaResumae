/**
 * AI 结构化导入：原始文本（来自 MD/LaTeX/PDF 或粘贴）→ LLM → 结构化 Resume 片段
 *
 * 用 JSON mode 强制输出，zod 校验，失败重试一次。
 * 返回完整可合并的 Resume 草稿（不含 id 时间戳，由调用方补）。
 */
import { chat, extractJSON } from './providers'
import type { AIProviderConfig } from '@/types/ai'
import type { Locale, Resume, SectionType } from '@/types/resume'
import { uid, nowStamp } from '@/schema/defaults'

export const SCHEMA_HINT = `{
  "basics": {
    "name": {"zh":"","en":""}, "nameRomanized":"",
    "label": {"zh":"","en":""}, "summary": {"zh":"","en":""},
    "email":"", "phone":"", "url":"", "location": {"zh":"","en":""}
  },
  "sections": [
    {
      "type": "skills|projects|work|education|awards|publications|matches|domains|workflow|community",
      "title": {"zh":"","en":""},
      "layout": "main|sidebar",
      "items": [ ... 该 type 对应条目 ... ]
    }
  ]
}
条目形态：
- work: {name:{zh,en}, position:{zh,en}, startDate:"YYYY-MM", endDate:"YYYY-MM", highlights:[{zh,en}]}
- education: {institution:{zh,en}, area:{zh,en}, studyType:{zh,en}, startDate, endDate, highlights:[{zh,en}]}
- projects: {name:{zh,en}, description:{zh,en}, url:"", repoUrl:"", keywords:[""], stars:0, highlights:[{zh,en}]}
- skills: {name:{zh,en}, level:{zh,en}, keywords:[""]}
- awards: {title:{zh,en}, date:"", awarder:{zh,en}}
- publications: {name:{zh,en}, date:"", url:""}
- matches: {tag:{zh,en}, body:{zh,en}}
- domains: {icon:"emoji", name:{zh,en}, sub:{zh,en}}
- workflow: {label:{zh,en}, text:{zh,en}}
- community: {platform:"", handle:"", url:""}`

/** 把原始文本交给 AI，返回结构化 Resume（草稿） */
export async function structureViaAI(
  config: AIProviderConfig,
  rawText: string,
  locale: Locale,
): Promise<Resume> {
  const system = `你是一名简历解析助手。把用户提供的简历原始文本（可能来自 PDF 文本提取，顺序可能错乱、含页眉页脚噪音）解析成严格符合给定 JSON schema 的结构化对象。
规则：
- 通读全文后再填字段，综合上下文判断段落归属（标题、公司、日期、要点）。
- 文本可能带结构提示：行首 [pN] 表示第 N 页；(name) 是最大字号（通常是姓名）；(h2) 是二级标题（分节，如"教育经历""工作经历"）；(h3) 是三级标题（条目名）。利用这些提示，但也要结合内容判断。
- 文本字段填入 {zh,en}；若原文为中文，zh 为主、en 可空；若原文为英文反之。
- 日期统一 "YYYY-MM"，未知留空字符串。
- 只输出 JSON，不要解释。schema 如下：
${SCHEMA_HINT}`

  const user = `解析以下简历原始文本（当前主语言 ${locale}），输出 JSON：

---
${rawText.slice(0, 24000)}
---`

  const content = await chat(config, {
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    json: true,
    temperature: 0.2,
  })

  const jsonStr = extractJSON(content)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    // 重试一次，附带错误提示
    const retry = await chat(config, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
        { role: 'assistant', content },
        { role: 'user', content: '上一段不是合法 JSON，请只输出严格合法的 JSON 对象。' },
      ],
      json: true,
      temperature: 0.1,
    })
    parsed = JSON.parse(extractJSON(retry))
  }

  return normalizeToResume(parsed, locale)
}

/** 把 AI 返回的松散对象规范化成合法 Resume（补 id/时间戳，确保字段完整） */
export function normalizeToResume(data: unknown, locale: Locale): Resume {
  const d = (data ?? {}) as Record<string, unknown>
  const b = (d.basics ?? {}) as Record<string, unknown>
  const t = nowStamp()
  return {
    id: uid('resume'),
    name: 'AI 导入的简历',
    templateId: 'brutalist',
    meta: { keywords: [] },
    basics: {
      name: asLoc(b.name) ?? { zh: '', en: '' },
      nameRomanized: asStr(b.nameRomanized),
      label: asLoc(b.label),
      image: asStr(b.image),
      email: asStr(b.email),
      phone: asStr(b.phone),
      url: asStr(b.url),
      location: asLoc(b.location),
      summary: asLoc(b.summary),
    },
    sections: Array.isArray(d.sections)
      ? (d.sections as Array<Record<string, unknown>>).map((s) => normalizeSection(s))
      : [],
    locale,
    createdAt: t,
    updatedAt: t,
  }
}

function normalizeSection(s: Record<string, unknown>): Resume['sections'][number] {
  return {
    id: uid('sec'),
    type: ((s.type as string) || 'custom') as SectionType,
    title: asLoc(s.title) ?? { zh: '', en: '' },
    layout: (s.layout as 'main' | 'sidebar') === 'sidebar' ? 'sidebar' : 'main',
    items: Array.isArray(s.items) ? (s.items as never[]).map((it) => ({ id: uid('item'), ...(it as object) })) : [],
    visible: true,
  }
}

function asStr(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}
function asLoc(v: unknown): { zh?: string; en?: string } | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as { zh?: string; en?: string }
  return { zh: o.zh || undefined, en: o.en || undefined }
}
