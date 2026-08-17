/**
 * 安全渲染 markdown 为 HTML（DOMPurify 清理，防 XSS）
 * 供 CopilotPanel 渲染助手消息/思考链用。
 */
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({
  breaks: true,
  gfm: true,
})

// 强制所有 <a> 在新标签打开并加 rel="noopener noreferrer"：marked 默认不设 target，否则链接在当前标签
// 打开会离开应用、丢失未保存的 UI 状态；旧钩子只在 target=_blank 时加 rel，而 marked 从不设 target，故 rel 形同虚设。
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function renderMarkdown(md: string): string {
  if (!md) return ''
  const raw = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'a', 'h1', 'h2', 'h3', 'h4', 'hr', 'span', 'del', 'ins', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
}
