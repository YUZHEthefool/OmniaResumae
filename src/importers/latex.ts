/**
 * LaTeX 导入：正则启发式（无成熟浏览器 LaTeX 解析器）
 *
 * 支持常见简历宏/包：
 *   - moderncv: \cvitem, \cventry, \cvdoubleitem, \cvlistitem
 *   - res / altlist: \section{...}, \begin{position}{...}{...}{日期}, \item
 *   - 通用: \section, \subsection, \textbf, \item, \href{url}{text}
 * 返回 ImportFragment。best-effort：建议用 AI 结构化复核。
 */
import type { Localized } from '@/types/resume'
import { uid } from '@/schema/defaults'
import type { ImportFragment } from './markdown'

export function parseLatexToFragment(tex: string): ImportFragment {
  // 去注释、去命令残渣
  let src = tex.replace(/(?<!\\)%.*$/gm, '')
  const langHint = detectLang(tex)

  const frag: ImportFragment = { sections: [] }

  // 姓名：moderncv \name{first}{last}（两参），回退到单参 \name{...} / \author{...} / \title{...}
  const nameTwo = src.match(/\\name\{([^}]*)\}\s*\{([^}]*)\}/i)
  const name = (nameTwo ? `${nameTwo[1]} ${nameTwo[2]}`.trim() : null)
    || src.match(/\\name\{([^}]*)\}/i)?.[1]
    || src.match(/\\author\{([^}]*)\}/i)?.[1]
    || src.match(/\\title\{([^}]*)\}/i)?.[1]
  if (name) frag.basics = { name: localize(clean(name), langHint) }

  // email / phone / url
  const email = src.match(/\\email\{([^}]*)\}/i)?.[1] || src.match(/\\homepage\{([^}]*)\}/i)?.[1]
  // phone/mobile：要求 {...} 或 空格+单 token，避免无括号时 ([^}]*) 贪婪吞掉后续文档
  const phoneM = src.match(/\\(?:phone|mobile|fixedphone)\s*\{([^}]*)\}/i) || src.match(/\\(?:phone|mobile|fixedphone)\s+([^\s\\]+)/i)
  const phone = phoneM?.[1]
  const url = src.match(/\\homepage\{([^}]*)\}/i)?.[1] || src.match(/\\href\{(https?:[^}]*)\}/i)?.[1]
  if (email && /@/.test(email)) frag.basics = { ...frag.basics, email: clean(email) }
  if (phone) frag.basics = { ...frag.basics, phone: clean(phone) }
  if (url) frag.basics = { ...frag.basics, url: clean(url) }

  // sections: \section{Title} 或 \cvsection{Title}
  const sectionRe = /\\(?:section|cvsection|subsection)\*?\{([^}]*)\}/g
  const positions: { idx: number; title: string }[] = []
  let m: RegExpExecArray | null
  while ((m = sectionRe.exec(src))) {
    positions.push({ idx: m.index + m[0].length, title: clean(m[1]) })
  }
  positions.push({ idx: src.length, title: '' }) // 末尾哨兵

  for (let i = 0; i < positions.length - 1; i++) {
    const title = positions[i].title
    if (!title) continue
    const body = src.slice(positions[i].idx, positions[i + 1].idx)
    const sec = makeSection(title)
    const type = mapSectionType(title)

    // moderncv \cventry{date}{degree/position}{institution/company}{location}{grade}{desc}
    // desc 含嵌套命令的 } 时，旧正则在第一个 } 处截断；改为只在 } 后跟下一个条目/段命令或文末才收尾
    // moderncv \cventry{date}{degree/position}{institution/company}{location}{grade}{desc}
    // desc 常含 \begin{itemize}\item...\end{itemize}：lookahead 只认同级条目/段命令（不含 begin/end/item），
    // 否则 lazy 的 ([\s\S]*?)\} 会在 \begin{itemize} 的 } 处提前收尾，整段 bullet 丢失。
    const cvRe = /\\cventry\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([\s\S]*?)\}(?=\s*\\(?:cventry|cvitem|cvlistitem|cvdoubleitem|section|subsection|cvsection)|\s*$)/g
    let c: RegExpExecArray | null
    let foundEntries = false
    while ((c = cvRe.exec(body))) {
      foundEntries = true
      const [, date, pos, org, loc, grade, desc] = c
      if (type === 'education') {
        sec.items.push({
          id: uid('tex_item'),
          institution: localize(clean(org), langHint),
          area: localize(clean(pos), langHint),
          studyType: localize(clean(grade), langHint),
          startDate: parseDate(date),
          highlights: parseDescBullets(desc, langHint),
        })
      } else {
        sec.items.push({
          id: uid('tex_item'),
          name: localize(clean(org), langHint),
          position: localize(clean(pos), langHint),
          startDate: parseDate(date),
          location: localize(clean(loc), langHint),
          highlights: parseDescBullets(desc, langHint),
        })
      }
    }

    // res 包 \begin{position}{title}{employer}{date} ... \end{position}
    const posRe = /\\begin\{position\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}([\s\S]*?)\\end\{position\}/g
    let p: RegExpExecArray | null
    while ((p = posRe.exec(body))) {
      foundEntries = true
      const [, posTitle, employer, date, desc] = p
      sec.items.push({
        id: uid('tex_item'),
        name: localize(clean(employer), langHint),
        position: localize(clean(posTitle), langHint),
        startDate: parseDate(date),
        highlights: parseDescBullets(desc, langHint),
      })
    }

    // moderncv \cvitem{key}{value}（技能/语言等键值对）
    const cviRe = /\\cvitem\{([^}]*)\}\{([^}]*)\}/g
    let cvi: RegExpExecArray | null
    while ((cvi = cviRe.exec(body))) {
      foundEntries = true
      sec.items.push({ id: uid('tex_item'), name: localize(clean(cvi[1]), langHint), level: localize(clean(cvi[2]), langHint) })
    }
    // \cvlistitem{value}（单项列表）
    const cvlRe = /\\cvlistitem\{([^}]*)\}/g
    let cvl: RegExpExecArray | null
    while ((cvl = cvlRe.exec(body))) {
      foundEntries = true
      sec.items.push({ id: uid('tex_item'), name: localize(clean(cvl[1]), langHint), level: localize('', langHint) })
    }
    // \cvdoubleitem{a}{b}{c}{d}（两对键值）
    const cvdRe = /\\cvdoubleitem\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g
    let cvd: RegExpExecArray | null
    while ((cvd = cvdRe.exec(body))) {
      foundEntries = true
      sec.items.push({ id: uid('tex_item'), name: localize(clean(cvd[1]), langHint), level: localize(clean(cvd[2]), langHint) })
      sec.items.push({ id: uid('tex_item'), name: localize(clean(cvd[3]), langHint), level: localize(clean(cvd[4]), langHint) })
    }

    // 通用 \item 列表（skills / highlights / awards）
    if (!foundEntries) {
      const items = [...body.matchAll(/\\item\s+([^\n\\]*(?:\n(?!\s*\\)[^\n\\]*)*)/g)].map((x) => clean(x[1]))
      if (items.length) {
        if (type === 'skills') {
          items.forEach((it) => sec.items.push({ id: uid('tex_item'), name: localize(it, langHint), level: localize('', langHint) }))
        } else if (type === 'awards') {
          items.forEach((it) => sec.items.push({ id: uid('tex_item'), title: localize(it, langHint) }))
        } else {
          // 单个条目，用 item 作 highlights
          sec.items.push({
            id: uid('tex_item'),
            name: localize(title, langHint),
            description: localize('', langHint),
            highlights: items.map((it) => localize(it, langHint)),
          })
        }
      }
    }

    if (sec.items.length) frag.sections.push(sec)
  }

  return frag
}

/* ─── helpers ─── */
function clean(s: string): string {
  return s
    .replace(/\\([%&_$#])/g, '$1') // 转义特殊字符 \& \% \_ 等（旧正则要求 \ 后跟字母，这些会残留反斜杠）
    .replace(/\\(?:begin|end)\{[^}]*\}/g, '') // 剥环境标记 \begin{itemize} / \end{itemize}（cventry desc 常含）
    .replace(/\\(textbf|textit|emph|texttt|textsc)\{([^{}]*)\}/g, '$2')
    .replace(/\\href\{[^}]*\}\{([^{}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+\{?([^{}]*)\}?/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDescBullets(desc: string, lang: 'zh' | 'en'): Localized[] {
  if (!desc || !desc.trim()) return []
  return desc
    .split(/\\item|\n|;\s*(?=[A-Z一-鿿])/)
    .map((x) => clean(x))
    .filter((x) => x.length > 1)
    .map((x) => localize(x, lang))
}

function parseDate(date: string): string | undefined {
  const c = clean(date)
  if (!c) return undefined
  // 保留原样（如 "March 2008 - July 2009"）；start/end 切分留给模板容错
  return c
}

function localize(text: string, lang: 'zh' | 'en'): Localized {
  return lang === 'zh' ? { zh: text } : { en: text }
}

function detectLang(tex: string): 'zh' | 'en' {
  const zh = (tex.match(/[一-鿿]/g) ?? []).length
  return zh > 5 ? 'zh' : 'en'
}

function mapSectionType(title: string): string {
  const t = title.toLowerCase()
  if (/edu|教育|学历|academic/.test(t)) return 'education'
  if (/work|exp|experience|工作|employ/.test(t)) return 'work'
  if (/project|项目/.test(t)) return 'projects'
  if (/skill|技能|ability|competenc/.test(t)) return 'skills'
  if (/award|honor|奖/.test(t)) return 'awards'
  if (/patent|专利|pub|出版|publications/.test(t)) return 'publications'
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
