/**
 * 导出为 Word 兼容文档（.doc，零依赖）
 *
 * 策略：克隆预览 DOM + 内联全部样式表，包成带 MSO 命名空间的 Word 兼容 HTML，
 * 以 application/msword blob 下载 .doc。Word/WPS 能打开并保留基本字体/颜色/间距，
 * 文本可编辑——定位"可二次编辑的文本稿"，精修仍用 PDF。
 *
 * 已知局限：Word 对 flexbox/grid 支持差，复杂模板（如 Brutalist 粗野双栏）布局会退化
 * 为单栏；这是 Word HTML 的固有限制，非 bug。基于非 single 的预览 DOM 克隆（single 紧凑
 * 布局是 PDF 专用）。
 */
import { slugify } from '@/utils/slug'
import type { Resume, Locale } from '@/types/resume'
import { pick } from '@/types/resume'

/** 收集页面全部样式表为内联字符串：<style> 取 outerHTML，<link> 尝试 fetch 文本内联、跨域回退 link 绝对 href */
async function collectStyles(): Promise<string> {
  return Promise.all(
    Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(async (el) => {
      if (el instanceof HTMLLinkElement) {
        try {
          const res = await fetch(el.href)
          if (res.ok) return `<style>\n${await res.text()}\n</style>`
        } catch {
          /* 抓不到（跨域如 Google Fonts）则回退为 link，由 Word 端加载 */
        }
        const c = el.cloneNode(true) as HTMLLinkElement
        c.href = el.href
        return c.outerHTML
      }
      return el.outerHTML
    }),
  ).then((arr) => arr.join('\n'))
}

export async function exportDocx(node: HTMLElement, resume: Resume, locale: Locale): Promise<void> {
  const styles = await collectStyles()

  const clone = node.cloneNode(true) as HTMLElement
  clone.style.outline = 'none'
  clone.style.width = '960px'
  clone.style.margin = '0 auto'
  clone.removeAttribute('contenteditable')
  clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'))
  // 剥离预览专用的 A4 分页引导线 + 编辑模式残留，避免进 Word
  clone.querySelectorAll('.preview-only').forEach((el) => el.remove())

  const name = slugify(pick(resume.basics.name, locale, 'resume'))
  // Word 兼容 HTML：MSO 命名空间让 Word 识别为文档；Print 视图 + 边距提示更接近简历排版。
  const html = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${name}_${locale}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
@page { size: A4; margin: 1cm; }
html,body{margin:0;padding:0;background:#fff;}
</style>
${styles}
</head>
<body>${clone.outerHTML}</body>
</html>`

  const blob = new Blob([html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}_${locale}.doc`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
