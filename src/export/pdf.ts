/**
 * 导出 PDF
 * 主：一键 html2canvas + jsPDF —— 支持单页（内容缩放到一页）或多页（A4 切片保真）
 * 辅：打印另存（独立 PrintPage，@media print）
 */
import { slugify } from '@/utils/slug'
import type { Resume, Locale } from '@/types/resume'
import { pick } from '@/types/resume'

export type ExportMode = 'single' | 'multi'

/** 让出主线程一帧，避免长内容导出时 UI 冻结。 */
const yieldFrame = () => new Promise((r) => setTimeout(r, 0))

/** 一键导出 PDF。mode: single=缩放到一页 A4；multi=按 A4 高度切片（多页保真）。 */
export async function exportPDF(node: HTMLElement, resume: Resume, locale: Locale, mode: ExportMode = 'single') {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  // 离屏容器：克隆模板内容，按模板设计宽度渲染（非 A4 宽，避免压扁按设计宽布局的内容），
  // 去除任何 transform（不影响预览缩放）。单页模式加 export-single 类触发紧凑布局，
  // 并用更宽的渲染宽度让内容更"宽矮"，接近 A4 宽高比、减少两侧留白。
  // 多页用 scale 2（默认 3 在长内容下像素量爆炸，toDataURL 会卡死主线程）。
  const scale = mode === 'single' ? 3 : 2
  const designW = mode === 'single' ? 1200 : (node.scrollWidth || 960)
  const holder = document.createElement('div')
  holder.style.position = 'fixed'
  holder.style.left = '-10000px'
  holder.style.top = '0'
  holder.style.width = `${designW}px`
  holder.style.background = '#ffffff'
  holder.style.zIndex = '-1'
  if (mode === 'single') holder.classList.add('export-single')
  const clone = node.cloneNode(true) as HTMLElement
  clone.style.transform = 'none'
  clone.style.width = '100%'
  holder.appendChild(clone)
  document.body.appendChild(holder)
  await new Promise((r) => requestAnimationFrame(() => r(null)))

  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(holder, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: designW,
    })
  } finally {
    document.body.removeChild(holder)
  }
  await yieldFrame()

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  if (mode === 'multi') {
    // 多页：按 A4 高度切片，页间 6pt 重叠避免割断粗边框。
    // 关键：用恒定步长（pageH - overlap）推进，避免末页 imgH-position<overlap 时步长
    // 归零导致的死循环；scale 2 + 每帧让出主线程，避免长内容卡死 UI。
    const imgW = pageW
    const imgH = (canvas.height * imgW) / canvas.width
    const step = pageH - 6
    const pages = Math.max(1, Math.ceil((imgH - 6) / step))
    for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
      if (pageIndex > 0) pdf.addPage()
      const position = pageIndex * step
      const sliceHeightPt = Math.min(pageH, imgH - position)
      const sliceHeightPx = (sliceHeightPt / imgH) * canvas.height
      const sliceTopPx = (position / imgH) * canvas.height
      const sub = document.createElement('canvas')
      sub.width = canvas.width
      sub.height = Math.ceil(sliceHeightPx)
      const ctx = sub.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, sub.width, sub.height)
        ctx.drawImage(canvas, 0, sliceTopPx, canvas.width, sliceHeightPx, 0, 0, sub.width, sub.height)
      }
      pdf.addImage(sub.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, sliceHeightPt)
      await yieldFrame()
    }
  } else {
    // 单页：整体缩放到一页 A4
    const A4_RATIO = pageW / pageH
    const contentRatio = canvas.width / canvas.height
    let imgW: number, imgH: number, x: number, y: number
    if (contentRatio >= A4_RATIO) {
      imgW = pageW
      imgH = (canvas.height * imgW) / canvas.width
      x = 0
      y = (pageH - imgH) / 2
    } else {
      imgH = pageH
      imgW = (canvas.width * imgH) / canvas.height
      x = (pageW - imgW) / 2
      y = 0
    }
    pdf.setFillColor(255, 255, 255)
    pdf.rect(0, 0, pageW, pageH, 'F')
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, imgW, imgH)
  }

  const name = slugify(pick(resume.basics.name, locale, 'resume'))
  pdf.save(`${name}_${locale}.pdf`)
}

/** 打印另存：打开隔离打印窗口（仅简历 DOM + 模板 CSS），调浏览器打印对话框 */
export function printResume(node: HTMLElement, resume: Resume, locale: Locale) {
  const win = window.open('', '_blank', 'width=900,height=1200')
  if (!win) {
    alert('请允许弹窗以使用打印导出')
    return
  }
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el) => el.outerHTML)
    .join('\n')

  win.document.write(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
    <title>${slugify(pick(resume.basics.name, locale, 'resume'))}_${locale}</title>
    ${styles}
    <style>
      @page { size: A4; margin: 0; }
      html,body{margin:0;padding:0;background:#fff;}
      .print-wrap{display:flex;justify-content:center;}
    </style>
  </head><body><div class="print-wrap">${node.outerHTML}</div>
  <script>window.onload=function(){setTimeout(function(){window.focus();window.print();},300);};</script>
  </body></html>`)
  win.document.close()
}
