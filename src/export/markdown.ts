/**
 * 导出为 Markdown：把 Resume 序列化为可读 Markdown（适合 GitHub README / LapisCV 风格）。
 * 纯数据序列化（不经 DOM），按当前 locale 取 Localized 文本。
 */
import type {
  Resume, Locale, Localized, Section,
  WorkItem, EducationItem, ProjectItem, SkillItem,
  AwardItem, PublicationItem, MatchItem, DomainItem, WorkflowStep, CommunityItem,
} from '@/types/resume'
import { pick } from '@/types/resume'

const L = (v: Localized | undefined, loc: Locale) => pick(v, loc)

/** 把 Resume 转成 Markdown 字符串 */
export function resumeToMarkdown(resume: Resume, locale: Locale): string {
  const out: string[] = []
  const b = resume.basics
  const name = L(b.name, locale) || resume.name
  out.push(`# ${name}`)
  if (b.nameRomanized) out.push(`*${b.nameRomanized}*`)
  const contact = [
    b.email,
    b.phone,
    b.url && b.url.replace(/^https?:\/\//, ''),
    L(b.location, locale),
  ].filter(Boolean).join(' · ')
  if (contact) out.push('', contact)
  if (L(b.label, locale)) out.push('', `**${L(b.label, locale)}**`)
  if (L(b.summary, locale)) out.push('', L(b.summary, locale))

  for (const s of resume.sections.filter((x) => x.visible)) {
    const title = L(s.title, locale) || s.type
    out.push('', `## ${title}`, '')
    const body = sectionToMd(s, locale)
    if (body) out.push(body)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function bullets(items: Localized[], loc: Locale): string {
  return items.map((h) => `- ${L(h, loc)}`).filter((l) => l !== '- ').join('\n')
}

function sectionToMd(s: Section, loc: Locale): string {
  switch (s.type) {
    case 'work':
      return (s.items as WorkItem[]).map((w) => {
        const head = [L(w.position, loc), L(w.name, loc)].filter(Boolean).join(' · ')
        const date = [w.startDate, w.endDate].filter(Boolean).join(' — ')
        const lines = [`### ${head}${date ? `  \n*${date}*` : ''}`]
        if (L(w.location, loc)) lines.push(`*${L(w.location, loc)}*`)
        const bl = bullets(w.highlights ?? [], loc)
        if (bl) lines.push(bl)
        return lines.join('\n')
      }).join('\n\n')
    case 'education':
      return (s.items as EducationItem[]).map((e) => {
        const head = [L(e.institution, loc), L(e.studyType, loc)].filter(Boolean).join(' · ')
        const date = [e.startDate, e.endDate].filter(Boolean).join(' — ')
        const lines = [`### ${head}${date ? `  \n*${date}*` : ''}`]
        if (L(e.area, loc)) lines.push(L(e.area, loc))
        const bl = bullets(e.highlights ?? [], loc)
        if (bl) lines.push(bl)
        return lines.join('\n')
      }).join('\n\n')
    case 'projects':
      return (s.items as ProjectItem[]).map((p) => {
        const head = L(p.name, loc)
        const meta = [p.stars !== undefined ? `★ ${p.stars}` : '', (p.languages ?? []).join('/')].filter(Boolean).join(' · ')
        const lines = [`### ${head}${meta ? `  \n*${meta}*` : ''}`]
        if (L(p.description, loc)) lines.push(L(p.description, loc))
        const link = p.url || p.repoUrl
        if (link) lines.push(link)
        const bl = bullets(p.highlights ?? [], loc)
        if (bl) lines.push(bl)
        return lines.join('\n')
      }).join('\n\n')
    case 'skills':
      return (s.items as SkillItem[]).map((s2) => {
        const val = L(s2.level, loc) || (s2.keywords ?? []).join(' · ')
        return `- **${L(s2.name, loc)}**${val ? `：${val}` : ''}`
      }).join('\n')
    case 'awards':
      return (s.items as AwardItem[]).map((a) => {
        const meta = [L(a.awarder, loc), a.date].filter(Boolean).join(' · ')
        return `- **${L(a.title, loc)}**${meta ? `  \n*${meta}*` : ''}`
      }).join('\n')
    case 'publications':
      return (s.items as PublicationItem[]).map((p) => {
        const meta = [L(p.publisher, loc), p.date].filter(Boolean).join(' · ')
        const line = `- **${L(p.name, loc)}**${meta ? `  \n*${meta}*` : ''}`
        return p.url ? `${line}\n${p.url}` : line
      }).join('\n')
    case 'matches':
      return (s.items as MatchItem[]).map((m) => `- **${L(m.tag, loc)}**：${L(m.body, loc)}`).join('\n')
    case 'domains':
      return (s.items as DomainItem[]).map((d) => `- ${d.icon ? `${d.icon} ` : ''}**${L(d.name, loc)}**${L(d.sub, loc) ? ` — ${L(d.sub, loc)}` : ''}`).join('\n')
    case 'workflow':
      return (s.items as WorkflowStep[]).map((w, i) => `${i + 1}. **${L(w.label, loc)}**：${L(w.text, loc)}`).join('\n')
    case 'community':
      // url 空时不加尾随分隔符，避免 "- **X** @y — " 的悬空破折号
      return (s.items as CommunityItem[]).map((c) => `- **${c.platform}** @${c.handle}${c.url ? ` — ${c.url}` : ''}`).join('\n')
    case 'custom':
      // 与 CustomTemplate 渲染一致：字符串原样、Localized 取值、其余 String() 化（数字/布尔不再丢失）
      return (s.items as Record<string, unknown>[]).map((it) =>
        Object.entries(it).filter(([k]) => k !== 'id').map(([k, v]) => {
          if (typeof v === 'string') return `- **${k}**：${v}`
          if (v && typeof v === 'object' && ('zh' in v || 'en' in v)) return `- **${k}**：${L(v as Localized, loc)}`
          return `- **${k}**：${String(v ?? '')}`
        }).join('\n'),
      ).join('\n')
    default:
      return ''
  }
}
