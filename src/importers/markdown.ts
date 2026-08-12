/**
 * Markdown 导入：marked 解析 AST → 启发式映射到 schema 片段
 *
 * LapisCV 风格 Markdown 约定：
 *   # 姓名                      → basics.name
 *   > 联系信息（带 icon span）   → basics.email/phone/url
 *   <img avatar>              → basics.image
 *   ## 分节                    → section（h3+entry-title 条目，列表为 highlights）
 *   <div class="entry-title"><h3>名</h3><p>日期</p></div>
 *
 * 返回 Partial<Resume> 片段，由 ImportDialog 合并。
 */
import { marked, type Tokens } from 'marked'
import type { Localized } from '@/types/resume'
import { uid } from '@/schema/defaults'

export interface ImportFragment {
  basics?: {
    name?: Localized
    email?: string
    phone?: string
    url?: string
    summary?: Localized
    image?: string
    profiles?: { network: string; username: string; url: string }[]
  }
  sections: {
    id: string
    type: string
    title: Localized
    layout: 'main' | 'sidebar'
    items: unknown[]
    visible: boolean
  }[]
}

export function parseMarkdownToFragment(md: string): ImportFragment {
  const tokens = marked.lexer(md)
  const frag: ImportFragment = { sections: [] }
  const langHint = detectLang(md)

  let currentSection: ImportFragment['sections'][number] | null = null

  for (const tok of tokens) {
    if (tok.type === 'heading') {
      const h = tok as Tokens.Heading
      const text = h.text.trim()
      if (h.depth === 1) {
        frag.basics = { ...frag.basics, name: localize(text, langHint) }
      } else if (h.depth === 2) {
        // 新分节
        if (currentSection) frag.sections.push(currentSection)
        currentSection = makeSection(stripIcon(text))
      } else if (h.depth >= 3 && currentSection) {
        // entry-title 的 h3：作为条目名（work/education/projects 通用）
        // 日期可能在后续 paragraph
        const item: Record<string, unknown> = { id: uid('md_item') }
        const mapped = mapSectionType(currentSection.type)
        if (mapped === 'work') {
          item.position = localize(text, langHint)
          item.name = localize('', langHint)
          item.highlights = []
        } else if (mapped === 'education') {
          item.institution = localize(text, langHint)
          item.area = localize('', langHint)
          item.highlights = []
        } else if (mapped === 'projects') {
          item.name = localize(text, langHint)
          item.description = localize('', langHint)
          item.highlights = []
        } else {
          item.title = localize(text, langHint)
        }
        currentSection.items.push(item)
        ;(currentSection as unknown as { _last?: unknown })._last = item
      }
    } else if (tok.type === 'paragraph') {
      const p = tok as Tokens.Paragraph
      const text = p.text.trim()
      // contact block（LapisCV 用 blockquote，但有时是普通段落）
      if (!frag.basics || (!frag.basics.email && !frag.basics.phone)) {
        const contact = extractContact(text)
        if (contact) {
          frag.basics = { ...frag.basics, ...contact }
          continue
        }
      }
      // entry-title 的日期 p（LapisCV: <p>2008.02 - 2024.06</p>）
      if (currentSection && (currentSection as unknown as { _last?: { startDate?: string; endDate?: string; url?: string } })._last) {
        const last = (currentSection as unknown as { _last?: { startDate?: string; endDate?: string; url?: string; description?: Localized } })._last!
        // 纯日期 / 日期范围
        if (/^\d{4}[-./]\d{0,2}.*$/.test(text) && text.length < 30) {
          const [s, e] = text.split(/[-–—→]/).map((x) => x.trim())
          if (s) last.startDate = s
          if (e) last.endDate = e
          continue
        }
        // 链接条目（projects: <a>github.com/...</a>）
        const linkMatch = text.match(/(https?:\/\/[^\s)]+|github\.com\/[^\s)]+)/)
        if (linkMatch && currentSection.type === 'projects') {
          last.url = linkMatch[1].startsWith('http') ? linkMatch[1] : 'https://' + linkMatch[1]
          continue
        }
      }
      // 描述段落 → 最近条目的 description / summary
      if (currentSection && (currentSection as unknown as { _last?: { description?: Localized; highlights?: Localized[] } })._last) {
        const last = (currentSection as unknown as { _last?: { description?: Localized; highlights?: Localized[] } })._last!
        if (last.highlights && Array.isArray(last.highlights)) {
          // 作为该条目的一段描述
          last.description = { ...(last.description ?? {}), ...localize(text, langHint) }
        }
        continue
      }
      // 顶层 paragraph → summary
      if (text) frag.basics = { ...frag.basics, summary: localize(text, langHint) }
    } else if (tok.type === 'list') {
      const list = tok as Tokens.List
      if (!currentSection) continue
      const last = (currentSection as unknown as { _last?: { highlights?: Localized[] } })._last
      const items = (list.items ?? []).map((li) => {
        const t = (li as Tokens.ListItem).text.trim()
        return localize(stripBullet(t), langHint)
      })
      if (last && last.highlights) {
        last.highlights.push(...items)
      } else {
        // 无 entry：作为该 section 的独立条目（skills 等）
        items.forEach((t) => {
          currentSection!.items.push({ id: uid('md_item'), name: t, level: localize('', langHint) })
        })
      }
    } else if (tok.type === 'html') {
      const html = (tok as Tokens.Generic).text ?? ''
      // avatar
      const avatar = html.match(/<img[^>]*alt=["']avatar["'][^>]*src=["']([^"']+)["']/i)
      if (avatar) frag.basics = { ...frag.basics, image: avatar[1] }
      // entry-title div（LapisCV: <div class="entry-title"><h3>名</h3><p>日期</p></div>）
      const et = html.match(/<div[^>]*entry-title[^>]*>\s*<h3>(.*?)<\/h3>\s*<p>(.*?)<\/p>/i)
      if (et && currentSection) {
        const mapped = mapSectionType(currentSection.type)
        const item: Record<string, unknown> = { id: uid('md_item') }
        if (mapped === 'work') { item.position = localize(stripTags(et[1]), langHint); item.name = localize('', langHint); item.highlights = [] }
        else if (mapped === 'education') { item.institution = localize(stripTags(et[1]), langHint); item.area = localize('', langHint); item.highlights = [] }
        else if (mapped === 'projects') { item.name = localize(stripTags(et[1]), langHint); item.description = localize('', langHint); item.highlights = [] }
        else { item.title = localize(stripTags(et[1]), langHint) }
        const [s, e] = et[2].split(/[-–—→]/).map((x: string) => x.trim())
        if (s) item.startDate = s
        if (e) item.endDate = e
        currentSection.items.push(item)
        ;(currentSection as unknown as { _last?: unknown })._last = item
      }
      // entry-title with link (projects: <div><h3>GitFlix</h3><a href=...>...</a></div>)
      const etl = html.match(/<div[^>]*entry-title[^>]*>\s*<h3>(.*?)<\/h3>\s*<a[^>]*href=["']([^"']+)["'][^>]*>/i)
      if (etl && currentSection) {
        const item: Record<string, unknown> = { id: uid('md_item') }
        item.name = localize(stripTags(etl[1]), langHint)
        item.description = localize('', langHint)
        item.highlights = []
        item.url = etl[2]
        currentSection.items.push(item)
        ;(currentSection as unknown as { _last?: unknown })._last = item
      }
    }
  }
  if (currentSection) frag.sections.push(currentSection)
  return frag
}

/* ─── helpers ─── */
function localize(text: string, lang: 'zh' | 'en'): Localized {
  return lang === 'zh' ? { zh: text } : { en: text }
}

function detectLang(md: string): 'zh' | 'en' {
  const zh = (md.match(/[一-鿿]/g) ?? []).length
  return zh > 5 ? 'zh' : 'en'
}

function stripIcon(t: string): string {
  return t.replace(/&#x[0-9a-f]+;?/gi, '').replace(/\s+/g, ' ').trim()
}

function stripBullet(t: string): string {
  return t.replace(/^[-•*•]\s*/, '').trim()
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim()
}

function mapSectionType(title: string): string {
  const t = title.toLowerCase()
  if (/edu|教育|学历/.test(t)) return 'education'
  if (/work|exp|经验|工作/.test(t)) return 'work'
  if (/project|项目/.test(t)) return 'projects'
  if (/skill|技能|能力/.test(t)) return 'skills'
  if (/award|奖/.test(t)) return 'awards'
  if (/patent|专利|pub|出版|发表/.test(t)) return 'publications'
  if (/community|社区/.test(t)) return 'community'
  return 'custom'
}

function makeSection(title: string): ImportFragment['sections'][number] {
  const type = mapSectionType(title)
  const layout = ['skills', 'projects', 'work', 'education', 'workflow'].includes(type) ? 'main' : 'sidebar'
  return {
    id: uid('sec'),
    type: type === 'custom' ? 'custom' : type,
    title: { zh: title, en: title },
    layout: layout as 'main' | 'sidebar',
    items: [],
    visible: true,
  }
}

function extractContact(text: string): Partial<{ email: string; phone: string; url: string }> {
  const out: Partial<{ email: string; phone: string; url: string }> = {}
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  if (email) out.email = email[0]
  const phone = text.match(/\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/)
  if (phone) out.phone = phone[0]
  const url = text.match(/https?:\/\/[^\s)]+/)
  if (url) out.url = url[0]
  return Object.keys(out).length ? out : {}
}
