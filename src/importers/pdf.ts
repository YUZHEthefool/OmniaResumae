/**
 * PDF 导入：pdfjs-dist 提取文本块 → 启发式分段
 * 动态导入 pdfjs-dist，仅 PDF 导入时加载（减小首屏包）。
 * 文本顺序可能错乱，按 y 坐标分块。建议用 AI 结构化复核。
 */
import type { Localized } from '@/types/resume'
import { uid } from '@/schema/defaults'
import type { ImportFragment } from './markdown'

export interface PdfBlock {
  text: string
  x: number
  y: number
  page: number
  size: number
  bold?: boolean
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist')
      // worker URL 由 Vite 处理
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      return pdfjs
    })()
  }
  return pdfjsPromise
}

/** 提取 PDF 所有文本块（按页、按 y 排序） */
export async function extractPdfBlocks(file: File): Promise<PdfBlock[]> {
  const pdfjs = await loadPdfjs()
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buf }).promise
  try {
    const blocks: PdfBlock[] = []
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      for (const item of content.items as Array<{ str: string; transform: number[]; height: number; fontName?: string }>) {
        const text = item.str
        if (!text.trim()) continue
        blocks.push({
          text,
          x: item.transform[4],
          y: item.transform[5],
          page: p,
          size: Math.round(item.height * 10) / 10,
          bold: /bold|semibold|heavy/i.test(item.fontName ?? ''),
        })
      }
    }
    return blocks
  } finally {
    // 释放 worker/页资源，避免大 PDF 内存堆积
    pdf.destroy?.()
  }
}

/** 合并同一行的块，返回"文本行"列表 */
export function mergeLines(blocks: PdfBlock[]): { text: string; y: number; page: number; size: number }[] {
  const lines: Record<string, PdfBlock[]> = {}
  for (const b of blocks) {
    const key = `${b.page}:${Math.round(b.y)}`
    ;(lines[key] ??= []).push(b)
  }
  return Object.entries(lines)
    .map(([key, bs]) => {
      // 按 x 坐标升序拼接（多列/RTL 才不会乱序）；旧 sort(()=>0) 是空操作
      bs.sort((a, b) => a.x - b.x)
      const text = bs.map((b) => b.text).join('')
      const [page, y] = key.split(':').map(Number)
      return { text: text.trim(), y, page, size: Math.max(...bs.map((b) => b.size)) }
    })
    .filter((l) => l.text)
    .sort((a, b) => a.page - b.page || b.y - a.y) // PDF y 轴向下递增
}

/** 启发式：把行映射到 fragment（宽松版，主要产出 raw text 供 AI 结构化） */
export function pdfLinesToFragment(lines: { text: string; y: number; page: number; size: number }[]): ImportFragment {
  const frag: ImportFragment = { sections: [] }
  const maxSize = Math.max(...lines.map((l) => l.size), 0)
  const nameLine = lines.find((l) => l.size === maxSize && l.size >= 16)
  const langHint: 'zh' | 'en' = nameLine && /[一-鿿]/.test(lines.map((l) => l.text).join('')) ? 'zh' : 'en'

  if (nameLine) {
    frag.basics = { name: localize(nameLine.text, langHint) }
  }

  const allText = lines.map((l) => l.text).join('\n')
  const email = allText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]
  const phone = allText.match(/\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/)?.[0]
  const url = allText.match(/https?:\/\/[^\s)]+/)?.[0]
  frag.basics = {
    ...frag.basics,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(url ? { url } : {}),
  }

  const sizes = lines.map((l) => l.size).sort((a, b) => b - a)
  const headingSize = sizes.filter((s, i) => sizes.indexOf(s) === i)[1] ?? maxSize * 0.8

  let cur: ImportFragment['sections'][number] | null = null
  let curLines: string[] = []

  const flushSection = () => {
    if (cur && curLines.length) {
      cur.items.push({
        id: uid('pdf_item'),
        name: localize(cur.title.zh ?? '', langHint),
        description: localize('', langHint),
        highlights: curLines.filter((l) => l).map((l) => localize(l, langHint)),
      })
      curLines = []
    }
  }

  for (const line of lines) {
    if (line === nameLine) continue
    if (line.size >= headingSize * 0.95 && line.text.length < 40 && !/[.。]$/.test(line.text)) {
      flushSection()
      if (cur) frag.sections.push(cur)
      cur = makeSection(line.text)
    } else if (cur) {
      curLines.push(line.text)
    }
  }
  flushSection()
  if (cur) frag.sections.push(cur)

  return frag
}

export async function parsePdfToFragment(file: File): Promise<ImportFragment> {
  const blocks = await extractPdfBlocks(file)
  const lines = mergeLines(blocks)
  return pdfLinesToFragment(lines)
}

/**
 * 提取结构化文本，供 AI 结构化使用。
 * 每行带页码与相对字号提示，帮助 AI 区分标题与正文：
 *   [p1] (big) 姓名
 *   [p1] (h2) 教育经历
 *   [p1] 某大学 · 计算机科学  2019-09 — 2023-06
 *   [p1] - 获奖项：...
 */
export async function extractPdfText(file: File): Promise<string> {
  const blocks = await extractPdfBlocks(file)
  const lines = mergeLines(blocks)
  if (!lines.length) return ''
  const maxSize = Math.max(...lines.map((l) => l.size), 1)
  return lines
    .map((l) => {
      const ratio = l.size / maxSize
      const tag = ratio >= 0.98 ? 'name' : ratio >= 0.75 ? 'h2' : ratio >= 0.55 ? 'h3' : ''
      const prefix = `[p${l.page}]` + (tag ? ` (${tag})` : '')
      return `${prefix} ${l.text}`
    })
    .join('\n')
}

/* ─── helpers ─── */
function localize(text: string, lang: 'zh' | 'en'): Localized {
  return lang === 'zh' ? { zh: text } : { en: text }
}

function makeSection(title: string): ImportFragment['sections'][number] {
  const t = title.toLowerCase()
  let type = 'custom'
  if (/edu|教育|学历|academic/.test(t)) type = 'education'
  else if (/work|exp|experience|工作|employ/.test(t)) type = 'work'
  else if (/project|项目/.test(t)) type = 'projects'
  else if (/skill|技能|ability/.test(t)) type = 'skills'
  else if (/award|honor|奖/.test(t)) type = 'awards'
  else if (/patent|专利|pub|出版/.test(t)) type = 'publications'
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
