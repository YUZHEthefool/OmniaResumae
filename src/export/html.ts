/**
 * 导出独立 HTML：把预览 DOM + 全部样式表内联进一个自包含 .html，可离线打开或托管。
 * <style> 原样保留；<link rel=stylesheet> 尝试 fetch 文本内联，抓不到（如跨域 Google Fonts）则保留 link。
 */
import { slugify } from '@/utils/slug'
import type { Resume, Locale } from '@/types/resume'
import { pick } from '@/types/resume'

export async function exportHTML(node: HTMLElement, resume: Resume, locale: Locale) {
  const styles = await Promise.all(
    Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(async (el) => {
      if (el instanceof HTMLLinkElement) {
        try {
          const res = await fetch(el.href)
          if (res.ok) return `<style>\n${await res.text()}\n</style>`
        } catch {
          /* 抓不到则回退为 link */
        }
        const c = el.cloneNode(true) as HTMLLinkElement
        c.href = el.href
        return c.outerHTML
      }
      return el.outerHTML
    }),
  )

  const clone = node.cloneNode(true) as HTMLElement
  clone.style.outline = 'none'
  clone.style.width = '960px'
  clone.style.margin = '0 auto'
  clone.removeAttribute('contenteditable')
  clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'))
  // 剥离预览专用的 A4 分页引导线（preview-only），否则会进导出的 HTML
  clone.querySelectorAll('.preview-only').forEach((el) => el.remove())

  const name = slugify(pick(resume.basics.name, locale, 'resume'))
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}_${locale}</title>
<style>html,body{margin:0;padding:0;background:#f4f4f5;}body{padding:24px 0;}</style>
${styles.join('\n')}
</head><body>${clone.outerHTML}</body></html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}_${locale}.html`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
