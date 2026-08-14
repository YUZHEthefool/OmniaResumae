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
import { marked, type Tokens, type Token } from 'marked'
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
  // 最近条目用本地变量追踪，不挂到 section 上（否则会被持久化进 Dexie 污染数据）
  let lastItem: Record<string, unknown> | null = null
  const pushItem = (item: Record<string, unknown>) => {
    currentSection!.items.push(item)
    lastItem = item
  }

  for (const tok of tokens) {
    if (tok.type === 'heading') {
      const h = tok as Tokens.Heading
      const text = inlineText(h.tokens).trim()
      if (h.depth === 1) {
        frag.basics = { ...frag.basics, name: localize(text, langHint) }
      } else if (h.depth === 2) {
        if (currentSection) frag.sections.push(currentSection)
        currentSection = makeSection(stripIcon(text))
        lastItem = null
      } else if (h.depth >= 3 && currentSection) {
        // entry-title 的 h3：作为条目名（work/education/projects 通用），日期可能在后续 paragraph
        const mapped = mapSectionType(currentSection.type)
        const item: Record<string, unknown> = { id: uid('md_item') }
        if (mapped === 'work') { item.position = localize(text, langHint); item.name = localize('', langHint); item.highlights = [] }
        else if (mapped === 'education') { item.institution = localize(text, langHint); item.area = localize('', langHint); item.highlights = [] }
        else if (mapped === 'projects') { item.name = localize(text, langHint); item.description = localize('', langHint); item.highlights = [] }
        else { item.title = localize(text, langHint) }
        pushItem(item)
      }
    } else if (tok.type === 'paragraph') {
      const p = tok as Tokens.Paragraph
      const raw = p.text.trim() // 原始文本用于日期/链接正则
      const text = inlineText(p.tokens).trim() // 剥内联语法后的纯文本用于存储
      // contact block（LapisCV 用 blockquote，但有时是普通段落）
      if (!frag.basics || (!frag.basics.email && !frag.basics.phone)) {
        const contact = extractContact(raw)
        if (contact) {
          frag.basics = { ...frag.basics, ...contact }
          continue
        }
      }
      if (lastItem) {
        const last = lastItem as { startDate?: string; endDate?: string; url?: string; description?: Localized; highlights?: Localized[] }
        // 纯日期 / 日期范围（LapisCV: <p>2008.02 - 2024.06</p>）
        if (/^\d{4}[-./]\d{0,2}.*$/.test(raw) && raw.length < 30) {
          const [s, e] = raw.split(/[-–—→]/).map((x) => x.trim())
          if (s) last.startDate = s
          if (e) last.endDate = e
          continue
        }
        // 链接条目（projects: <a>github.com/...</a>）
        const linkMatch = raw.match(/(https?:\/\/[^\s)]+|github\.com\/[^\s)]+)/)
        if (linkMatch && currentSection!.type === 'projects') {
          last.url = linkMatch[1].startsWith('http') ? linkMatch[1] : 'https://' + linkMatch[1]
          continue
        }
        // 描述段落 → 最近条目的 description
        if (last.highlights && Array.isArray(last.highlights)) {
          last.description = { ...(last.description ?? {}), ...localize(text, langHint) }
          continue
        }
      }
      // 顶层 paragraph → summary
      if (text) frag.basics = { ...frag.basics, summary: localize(text, langHint) }
    } else if (tok.type === 'list') {
      const list = tok as Tokens.List
      if (!currentSection) continue
      // 递归展平嵌套列表，避免子 bullet 丢失
      const items: Localized[] = []
      const walk = (l: Tokens.List) => {
        for (const li of (l.items ?? [])) {
          const liTokens = (li as Tokens.ListItem).tokens ?? []
          const head: Token[] = []
          for (const t of liTokens) { if (t.type === 'list') break; head.push(t) }
          const t = inlineText(head).trim()
          if (t) items.push(localize(stripBullet(t), langHint))
          for (const t2 of liTokens) if (t2.type === 'list') walk(t2 as Tokens.List)
        }
      }
      walk(list)
      const last = lastItem as { highlights?: Localized[] } | null
      if (last && last.highlights) {
        last.highlights.push(...items)
      } else {
        // 无 entry：作为该 section 的独立条目（skills 等）
        items.forEach((t) => {
          currentSection!.items.push({ id: uid('md_item'), name: t, level: localize('', langHint) })
        })
      }
    } else if (tok.type === 'table') {
      const tb = tok as Tokens.Table
      if (!currentSection) continue
      // 表格：每行拼成 "cell · cell" 作为要点/条目，避免整表丢失
      const rows = (tb.rows ?? [])
        .map((row) => row.map((cell) => inlineText((cell as Tokens.TableCell).tokens).trim()).filter(Boolean).join(' · '))
        .filter(Boolean)
      const last = lastItem as { highlights?: Localized[] } | null
      if (last && last.highlights) {
        for (const r of rows) last.highlights.push(localize(r, langHint))
      } else {
        for (const r of rows) currentSection.items.push({ id: uid('md_item'), name: localize(r, langHint), level: localize('', langHint) })
      }
    } else if (tok.type === 'blockquote') {
      // 联系信息常以 blockquote 给出；取不到联系则当段落并入当前条目/summary
      const bq = tok as Tokens.Blockquote
      let bqText = ''
      for (const bt of (bq.tokens ?? [])) {
        if (bt.type === 'paragraph') bqText += inlineText((bt as Tokens.Paragraph).tokens).trim() + ' '
      }
      bqText = bqText.trim()
      if (bqText && (!frag.basics || (!frag.basics.email && !frag.basics.phone))) {
        const contact = extractContact(bqText)
        if (contact) { frag.basics = { ...frag.basics, ...contact }; continue }
      }
      if (lastItem && (lastItem as { highlights?: Localized[] }).highlights) {
        const last = lastItem as { description?: Localized; highlights?: Localized[] }
        last.description = { ...(last.description ?? {}), ...localize(bqText, langHint) }
        continue
      }
      if (bqText) frag.basics = { ...frag.basics, summary: localize(bqText, langHint) }
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
        pushItem(item)
      }
      // entry-title with link (projects: <div><h3>GitFlix</h3><a href=...>...</a></div>)
      const etl = html.match(/<div[^>]*entry-title[^>]*>\s*<h3>(.*?)<\/h3>\s*<a[^>]*href=["']([^"']+)["'][^>]*>/i)
      if (etl && currentSection) {
        const item: Record<string, unknown> = { id: uid('md_item') }
        item.name = localize(stripTags(etl[1]), langHint)
        item.description = localize('', langHint)
        item.highlights = []
        item.url = etl[2]
        pushItem(item)
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

/** 递归取内联 token 的纯文本：剥 ** * ` 等、把 [text](url) 解为 text，不依赖原始 .text（其保留 markdown 语法） */
type InlineToken = Token & { tokens?: Token[]; text?: string }
function inlineText(tokens?: Token[]): string {
  if (!tokens || !tokens.length) return ''
  let out = ''
  for (const t of tokens as InlineToken[]) {
    switch (t.type) {
      case 'text':
        out += t.tokens ? inlineText(t.tokens) : (t.text ?? '')
        break
      case 'strong': case 'em': case 'del': case 'ins':
        out += inlineText(t.tokens)
        break
      case 'link': case 'image':
        out += inlineText(t.tokens) || (t.text ?? '')
        break
      case 'codespan': case 'escape':
        out += t.text ?? ''
        break
      case 'br':
        out += ' '
        break
      default:
        out += t.tokens ? inlineText(t.tokens) : (t.text ?? '')
    }
  }
  return out
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
