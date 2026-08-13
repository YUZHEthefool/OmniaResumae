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

export function renderMarkdown(md: string): string {
  if (!md) return ''
  const raw = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'a', 'h1', 'h2', 'h3', 'h4', 'hr', 'span', 'del', 'ins', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
}
