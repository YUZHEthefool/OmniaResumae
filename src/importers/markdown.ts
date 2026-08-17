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
      // contact block（LapisCV 用 blockquote，但有时是普通段落）：任一联系方式缺失就尝试，
      // 只补缺失字段，避免联系方式分散在多段时后段被跳过丢失
      if (!frag.basics || !frag.basics.email || !frag.basics.phone || !frag.basics.url) {
        const contact = extractContact(raw)
        if (contact) {
          frag.basics = {
            ...frag.basics,
            ...(contact.email && !frag.basics?.email ? { email: contact.email } : {}),
            ...(contact.phone && !frag.basics?.phone ? { phone: contact.phone } : {}),
            ...(contact.url && !frag.basics?.url ? { url: contact.url } : {}),
          }
          continue
        }
      }
      if (lastItem) {
        const last = lastItem as { startDate?: string; endDate?: string; url?: string; description?: Localized; highlights?: Localized[] }
        // 纯日期 / 日期范围（LapisCV: <p>2008.02 - 2024.06</p>）
        // 只把"整行就是日期或日期范围"的段落当日期；范围分隔符只认空白连字符/破折号，
        // 不把 YYYY-MM 里的连字符当范围分隔（旧 split(/[-–—→]/) 会把 2023-06 拆成 2023 与 06）
        const d = parseDateLine(raw)
        if (d) {
          if (d.startDate) last.startDate = d.startDate
          if (d.endDate) last.endDate = d.endDate
          continue
        }
        // 链接条目（projects: <a>github.com/...</a>）：仅当整段几乎只是一个链接时才吞掉，
        // 否则保留 url 同时下文作 description（"Built X; see github.com/…" 不丢描述）
        const linkMatch = raw.match(/(https?:\/\/[^\s)]+|github\.com\/[^\s)]+)/)
        if (linkMatch && currentSection!.type === 'projects') {
          last.url = linkMatch[1].startsWith('http') ? linkMatch[1] : 'https://' + linkMatch[1]
          if (raw.replace(linkMatch[0], '').trim().length < 12) continue
        }
        // 描述段落 → 最近条目的 description（多条段落用 \n 累积，旧实现展开 localize 覆盖同语种槽，仅保留最后一段）
        if (last.highlights && Array.isArray(last.highlights)) {
          const prev = (last.description as Localized | undefined)?.[langHint] ?? ''
          last.description = { ...(last.description ?? {}), [langHint]: prev ? `${prev}\n${text}` : text }
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
      // avatar：兼容 alt 在前或 src 在前两种顺序
      const avatar = html.match(/<img[^>]*\balt=["']avatar["'][^>]*\bsrc=["']([^"']+)["']/i)
        || html.match(/<img[^>]*\bsrc=["']([^"']+)["'][^>]*\balt=["']avatar["']/i)
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
        const d = parseDateLine(et[2])
        if (d?.startDate) item.startDate = d.startDate
        if (d?.endDate) item.endDate = d.endDate
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
  return t.replace(/<[^>]+>/g, '').replace(/&#x[0-9a-f]+;?/gi, '').replace(/\s+/g, ' ').trim()
}

function stripBullet(t: string): string {
  return t.replace(/^[-•*•]\s*/, '').trim()
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim()
}

/** 日期原子：YYYY、YYYY-MM、YYYY.MM、YYYY/MM、或 present/至今/now/当前 */
const DATE_ATOM = '(\\d{4}([-./]\\d{1,2})?|至今|present|now|当前)'
const dateRangeRe = new RegExp(`^\\s*${DATE_ATOM}\\s*(?:[-–—→]|\\s-\\s)\\s*${DATE_ATOM}\\s*$`, 'i')
const dateSingleRe = new RegExp(`^\\s*${DATE_ATOM}\\s*$`, 'i')
/** 整行是日期或日期范围时返回 {startDate,endDate}，否则 null。
 *  范围分隔符只认破折号/箭头或空白连字符，不误把 YYYY-MM 的连字符当分隔；长度上限 30 防误吞正文。 */
function parseDateLine(raw: string): { startDate?: string; endDate?: string } | null {
  const r = raw.trim()
  if (!r || r.length >= 30) return null
  let m = r.match(dateRangeRe)
  if (m) return { startDate: m[1], endDate: m[3] }
  m = r.match(dateSingleRe)
  if (m) return { startDate: m[1] }
  return null
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
