/**
 * 生成模板的 CSS 运行时：净化 + 字体加载 + 作用域注入
 *
 * 安全模型：AI 产出的 CSS 是惰性字符串，经 sanitizeCSS 剥离外部资源引用后，
 * 注入 document.head 的 <style data-tpl-id>。字体族名经 buildFontHref 拼成
 * 已知良好的 Google Fonts <link>（绝不信任 AI 的裸 @import URL）。
 * 纯前端、BYO 密钥、本地、用户主动触发——信任 + 作用域 + 剥危险 token 足够。
 */
import { useEffect } from 'react'

/**
 * 净化 AI 生成的 CSS：
 * 1. 剥全部 @import（字体单独经 buildFontHref 处理）→ 阻断 @import 到任意端点。
 * 2. 剥 url() 里的 http/https scheme（保留 data:）→ 阻断渲染时浏览器请求追踪端点。
 * 3. 剹 expression( / javascript: / vbscript: / -moz-binding:（现代浏览器已忽略，显式防御）。
 */
export function sanitizeCSS(raw: string): string {
  let s = raw
  // 1. 剥全部 @import（字体单独经 buildFontHref 处理）；允许无分号结尾（EOF 处的 @import 也剥）。
  //    [^\n;]* 限定单行：旧 [^;]* 跨行，@import 缺分号时会吞掉后续规则直至下一个分号，破坏整段样式。
  s = s.replace(/@import\b[^\n;]*;?/gi, '/* @import stripped */')
  // 2. 剥 url(...) 里的远程引用：http(s) 与协议相对 //（后者浏览器会解析为 https，仅剥 https? 不够）；
  //    保留 data: 与本地绝对/相对路径（无 //）
  s = s.replace(/url\(\s*(['"]?)\s*(?:https?:)?\/\/[^)]*\1\s*\)/gi, '/* remote url stripped */')
  // 3. 剥危险 token
  s = s.replace(/expression\s*\(/gi, '/* expression( */')
  s = s.replace(/javascript:/gi, '/* javascript: */')
  s = s.replace(/vbscript:/gi, '/* vbscript: */')
  s = s.replace(/-moz-binding\s*:/gi, '/* -moz-binding: */')
  // 仅匹配作为属性名的 behavior:（前面不是字母/连字符），避免误伤 scroll-behavior / transition-behavior
  s = s.replace(/(?<![a-z-])behavior\s*:/gi, '/* behavior: */')
  // 4. 剥 </style 序列：<style> 是 raw-text 元素，textContent 里的 </style> 在 outerHTML 序列化时
  //    会提前结束 <style>，使导出的 HTML/Word/打印样式被截断、后续 CSS 泄漏为可见文本。
  //    把 </style 转成 <\/style：CSS 解析器把 \/ 还原为 /（CSS 行为不变），但 HTML 序列化器不再认为是结束标签。
  //    （连注释里的 </style> 也覆盖——CSS 注释 /* ... </style> ... */ 中的序列同样会截断序列化。）
  s = s.replace(/<\/style/gi, '<\\/style')
  return s
}

/** 由 style 的 data-tpl-id 推断 @scope 根类：对话框预览用 .tpl-custom-preview，生成模板用 .tpl-custom */
function scopeRootFor(id: string): string {
  return id === '__preview__' ? '.tpl-custom-preview' : '.tpl-custom'
}

/**
 * 由字体族名拼已知良好的 Google Fonts css2 URL。
 * 族名可含轴信息，如 "Inter:wght@400;700"。
 * 返回 null 表示无字体需加载。
 *
 * 注意：css2 的 family= 参数有特殊语法——空格写作 `+`，轴/字重分隔符
 * `:` `@` `;` `,`（如 Inter:wght@400;700、Roboto:ital,wght@0,400;1,700）
 * 必须原样保留。用 encodeURIComponent 会把空格变成 %20、把这些结构符
 * 百分号编码，导致 Google Fonts 解析失败、字体回退到默认。
 * 故只把空白合并为 +，其余原样保留（字体名按规范只含字母数字与上述结构符）。
 */
export function buildFontHref(fonts: string[]): string | null {
  const families = fonts.map((f) => f.trim().replace(/\s+/g, '+')).filter(Boolean)
  if (!families.length) return null
  const params = families.map((f) => `family=${f}`).join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

/** 把 CSS 里的根类名 from 全部替换为 to（对话框预览隔离用）。纯字符串替换，避免正则转义。 */
export function rewriteRoot(css: string, from: string, to: string): string {
  return css.split(from).join(to)
}

/**
 * 往 document.head 注入并维护单一 <style data-tpl-id={id}>（+ 可选字体 <link>）。
 * 卸载或依赖变化时清理上一个，避免多个生成模板规则互撞。
 * 同一时刻主预览（.tpl-custom）与对话框预览（.tpl-custom-preview）根类不同，互不影响。
 */
export function useScopedStyle(id: string, css: string, fonts: string[]): void {
  const fontsKey = fonts.join('|')
  useEffect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-tpl-id', id)
    // 用 @scope 把 AI 产出的全部选择器限制在根类后代内：即使模型写 body/*/:root/未作用域选择器，
    // 也只会影响 .tpl-custom（或预览 .tpl-custom-preview）内部，无法重排应用 chrome。
    // @font-face/@keyframes 仍正常工作；对 html2canvas（读 computed style）透明。2026 浏览器全面支持。
    style.textContent = `@scope ${scopeRootFor(id)} { ${sanitizeCSS(css)} }`
    document.head.appendChild(style)

    let link: HTMLLinkElement | null = null
    const href = buildFontHref(fonts)
    if (href) {
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.setAttribute('data-tpl-id', id)
      link.href = href
      document.head.appendChild(link)
    }

    return () => {
      style.remove()
      link?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, css, fontsKey])
}
