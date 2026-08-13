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
  // 1. 剥全部 @import
  s = s.replace(/@import\b[^;]*;/gi, '/* @import stripped */')
  // 2. 剥 url(...) 里的远程 http(s) 引用（保留 data:）
  s = s.replace(/url\(\s*(['"]?)\s*https?:\/\/[^)]*\1\s*\)/gi, '/* remote url stripped */')
  // 3. 剥危险 token
  s = s.replace(/expression\s*\(/gi, '/* expression( */')
  s = s.replace(/javascript:/gi, '/* javascript: */')
  s = s.replace(/vbscript:/gi, '/* vbscript: */')
  s = s.replace(/-moz-binding\s*:/gi, '/* -moz-binding: */')
  return s
}

/**
 * 由字体族名拼已知良好的 Google Fonts css2 URL。
 * 族名可含轴信息，如 "Inter:wght@400;700"。
 * 返回 null 表示无字体需加载。
 */
export function buildFontHref(fonts: string[]): string | null {
  const families = fonts.map((f) => f.trim()).filter(Boolean)
  if (!families.length) return null
  const params = families.map((f) => `family=${encodeURIComponent(f)}`).join('&')
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
    style.textContent = sanitizeCSS(css)
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
