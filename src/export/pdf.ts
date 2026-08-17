/**
 * 导出 PDF
 * 主：一键 html2canvas + jsPDF —— 支持单页（内容缩放到一页）或多页（A4 切片保真）
 * 辅：打印另存（独立 PrintPage，@media print）
 */
import { slugify } from '@/utils/slug'
import type { Resume, Locale } from '@/types/resume'
import { pick } from '@/types/resume'
import { t } from '@/i18n'

export type ExportMode = 'single' | 'multi'

/** 让出主线程一帧，避免长内容导出时 UI 冻结。 */
const yieldFrame = () => new Promise((r) => setTimeout(r, 0))

/**
 * 把头像图居中裁剪为正方形 data URL。
 * html2canvas 对 <img> 的 object-fit:cover 支持不佳，非正方形照片会被拉伸填满方框而非裁剪，
 * 导致导出头像变形。导出前先把图裁成正方形再换上，方图进方框即不拉伸。
 * 若图片跨域且未带 CORS 头，canvas 会被污染、toDataURL 抛错，返回 null 回退到原图。
 */
async function squareCropAvatar(img: HTMLImageElement): Promise<string | null> {
  if (!img.complete || img.naturalWidth === 0) return null
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  const side = Math.min(nw, nh)
  const c = document.createElement('canvas')
  c.width = side
  c.height = side
  const ctx = c.getContext('2d')
  if (!ctx) return null
  try {
    ctx.drawImage(img, (nw - side) / 2, (nh - side) / 2, side, side, 0, 0, side, side)
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}

/** 等待一张 <img> 加载完成（已加载或失败也 resolve）。 */
const awaitImg = (img: HTMLImageElement) =>
  new Promise<void>((res) => {
    if (img.complete) return res()
    img.onload = () => res()
    img.onerror = () => res()
  })

/** 一键导出 PDF。mode: single=缩放到一页 A4；multi=按 A4 高度切片（多页保真）。
 *  返回 { warn? }：single 模式下若内容被缩到 <80%（>1.25 页），附提示文案供调用方弹窗。 */
export async function exportPDF(node: HTMLElement, resume: Resume, locale: Locale, mode: ExportMode = 'single'): Promise<{ warn?: string }> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  // 离屏容器：克隆模板内容，去除任何 transform（不影响预览缩放）。
  // 单页模式：按 A4 像素宽（794 @96dpi）渲染，配合 .export-single 紧凑布局让内容排近一页 A4；
  // 若内容仍高于 A4（1123px），最后等比微缩到一页高——宽度随之略缩，但不会像旧逻辑那样
  // "内容越长 PDF 越窄"（旧逻辑按高度铺满反推宽度，高瘦图必然左右大片留白）。
  // 多页用 scale 2（默认 3 在长内容下像素量爆炸，toDataURL 会卡死主线程）。
  const A4_W_PX = 794
  const scale = 2
  const designW = mode === 'single' ? A4_W_PX : (node.scrollWidth || 960)
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
  // 去除"编辑预览"模式留在 ref 节点上的虚线 outline 与 contenteditable，避免被导出
  clone.style.outline = 'none'
  clone.removeAttribute('contenteditable')
  holder.appendChild(clone)
  document.body.appendChild(holder)

  // 头像预裁剪：html2canvas 对 object-fit:cover 支持不佳，非正方形照片会被拉伸变形。
  // 导出前把头像图居中裁成正方形 data URL 换到克隆的 <img> 上——方图进方框即不拉伸，
  // 边框/圆角/阴影仍由模板 CSS 渲染（html2canvas 处理这些盒属性正常），等比缩放也不变形。
  const origAvatar = node.querySelector<HTMLImageElement>('.avatar')
  const cloneAvatars = Array.from(holder.querySelectorAll<HTMLImageElement>('.avatar'))
  if (origAvatar && cloneAvatars.length) {
    const squared = await squareCropAvatar(origAvatar)
    if (squared) {
      cloneAvatars.forEach((av) => {
        av.src = squared
        av.style.objectFit = 'fill' // 已是正方形，fill/cover 等效，避免任何 object-fit 歧义
      })
      await Promise.all(cloneAvatars.map(awaitImg))
    }
  }
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  // 等待 AI 生成模板动态注入的 Google Fonts 加载到位，避免 html2canvas 快照时缺字体
  await document.fonts.ready

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
  let warn: string | undefined

  if (mode === 'multi') {
    // 多页：按 A4 高度切片，页间 6pt 重叠避免割断粗边框。
    // 关键：用恒定步长（pageH - overlap）推进，避免末页 imgH-position<overlap 时步长
    // 归零导致的死循环；scale 2 + 每帧让出主线程，避免长内容卡死 UI。
    const imgW = pageW
    const imgH = (canvas.height * imgW) / canvas.width
    const step = pageH - 6
    let pages = Math.max(1, Math.ceil((imgH - 6) / step))
    // 末页近空白（<24pt）则裁掉，避免多出一页几乎全白的尾页
    if (pages > 1 && Math.min(pageH, imgH - (pages - 1) * step) < 24) pages -= 1
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
    // 单页：以 A4 宽为基准等比缩放；若内容高于 A4，再整体微缩到一页高，
    // 宽度随之略缩（但远小于旧逻辑的"越长越窄"——旧逻辑按高铺满反推宽，高瘦图留白严重）。
    // 内容不足一页时按 A4 宽铺满、垂直居中。
    const contentRatioPx = canvas.width / canvas.height // 约等于 designW / 内容高
    const a4Ratio = pageW / pageH
    let imgW: number, imgH: number
    if (contentRatioPx >= a4Ratio) {
      // 内容比 A4 更"宽矮"（少见）：按宽铺满，高度不足则垂直居中
      imgW = pageW
      imgH = (canvas.height * imgW) / canvas.width
    } else {
      // 内容比 A4 更"瘦高"（常见，简历多如此）：按 A4 宽铺满，高度按比例算；
      // 若算出高度超过 A4 高，则改按高铺满（整体微缩），宽度略缩、左右居中。
      imgW = pageW
      imgH = (canvas.height * imgW) / canvas.width
      if (imgH > pageH) {
        imgH = pageH
        imgW = (canvas.width * imgH) / canvas.height
      }
    }
    const x = (pageW - imgW) / 2
    const y = (pageH - imgH) / 2
    pdf.setFillColor(255, 255, 255)
    pdf.rect(0, 0, pageW, pageH, 'F')
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, imgW, imgH)

    // 长简历反馈：缩放因子 < 80%（内容 > 1.25 页）时附提示，让用户知情并建议多页
    const scalePct = Math.round(Math.min(imgW / pageW, imgH / pageH) * 100)
    if (scalePct < 80) {
      const naturalH = (canvas.height * pageW) / canvas.width // 按 A4 宽铺满时的高度(pt)
      const pages = Math.max(2, Math.ceil(naturalH / pageH))
      warn = t('singlePdfWarn', locale).replace('{n}', String(pages)).replace('{pct}', String(scalePct))
    }
  }

  const name = slugify(pick(resume.basics.name, locale, 'resume'))
  pdf.save(`${name}_${locale}.pdf`)
  return { warn }
}

/** 导出为 PNG 图片：离屏按 A4 宽渲染整张简历（含 .export-single 紧凑布局 + 头像预裁剪），canvas 直接出 PNG 下载。 */
export async function exportImage(node: HTMLElement, resume: Resume, locale: Locale) {
  const { default: html2canvas } = await import('html2canvas')
  const A4_W_PX = 794
  const scale = 2
  const holder = document.createElement('div')
  holder.style.position = 'fixed'
  holder.style.left = '-10000px'
  holder.style.top = '0'
  holder.style.width = `${A4_W_PX}px`
  holder.style.background = '#ffffff'
  holder.style.zIndex = '-1'
  holder.classList.add('export-single')
  const clone = node.cloneNode(true) as HTMLElement
  clone.style.transform = 'none'
  clone.style.width = '100%'
  // 去除"编辑预览"模式留在 ref 节点上的虚线 outline 与 contenteditable
  clone.style.outline = 'none'
  clone.removeAttribute('contenteditable')
  holder.appendChild(clone)
  document.body.appendChild(holder)

  // 头像预裁剪（同 exportPDF，防 html2canvas object-fit 拉伸）
  const origAvatar = node.querySelector<HTMLImageElement>('.avatar')
  const cloneAvatars = Array.from(holder.querySelectorAll<HTMLImageElement>('.avatar'))
  if (origAvatar && cloneAvatars.length) {
    const squared = await squareCropAvatar(origAvatar)
    if (squared) {
      cloneAvatars.forEach((av) => {
        av.src = squared
        av.style.objectFit = 'fill'
      })
      await Promise.all(cloneAvatars.map(awaitImg))
    }
  }
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  // 等待 AI 生成模板动态注入的 Google Fonts 加载到位，避免 html2canvas 快照时缺字体
  await document.fonts.ready

  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(holder, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: A4_W_PX,
    })
  } finally {
    document.body.removeChild(holder)
  }

  const name = slugify(pick(resume.basics.name, locale, 'resume'))
  // 用 await 取 blob：内容过大时浏览器 canvas 超限，toBlob 回调得 null——此时抛错让调用方提示，
  // 而非静默无下载。
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('导出图片失败：内容可能过大、超出浏览器画布限制，请改用多页 PDF')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}_${locale}.png`
  a.click()
  // 延迟释放：部分浏览器（Safari）下载尚未开始读 blob 就 revoke 会失败
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 打印另存：打开隔离打印窗口（仅简历 DOM + 模板 CSS），调浏览器打印对话框 */
export function printResume(node: HTMLElement, resume: Resume, locale: Locale) {
  const win = window.open('', '_blank', 'width=900,height=1200')
  if (!win) {
    alert('请允许弹窗以使用打印导出')
    return
  }
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el) => {
      if (el instanceof HTMLLinkElement) {
        // 生产构建里 link href 是 /assets/index-HASH.css，写进 about:blank 会按 about:blank 解析而加载失败；
        // .href getter 返回绝对 URL，克隆后改写，确保打印窗口能加载样式
        const c = el.cloneNode(true) as HTMLLinkElement
        c.href = el.href
        return c.outerHTML
      }
      return el.outerHTML
    })
    .join('\n')

  // 克隆并剥离编辑模式残留：根的虚线 outline、根及 [data-edit] 子节点的 contenteditable，
  // 否则会随 outerHTML 序列化进打印文档（exportPDF/exportImage 也做了同样剥离）。
  const clone = node.cloneNode(true) as HTMLElement
  clone.style.outline = 'none'
  clone.removeAttribute('contenteditable')
  clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'))

  win.document.write(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
    <title>${slugify(pick(resume.basics.name, locale, 'resume'))}_${locale}</title>
    ${styles}
    <style>
      @page { size: A4; margin: 0; }
      html,body{margin:0;padding:0;background:#fff;}
      .print-wrap{display:flex;justify-content:center;}
    </style>
  </head><body><div class="print-wrap">${clone.outerHTML}</div>
  <script>window.onload=function(){setTimeout(function(){window.focus();window.print();},300);};</script>
  </body></html>`)
  win.document.close()
}
