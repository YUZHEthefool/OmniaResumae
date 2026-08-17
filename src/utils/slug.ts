/** 文件名 slug：中文/英文/数字保留，其余转下划线 */
export function slugify(s: string): string {
  const trimmed = (s || '').trim()
  if (!trimmed) return 'resume'
  // 保留中文、字母、数字、空格
  const kept = trimmed
    .replace(/[^\p{Script=Han}a-zA-Z0-9\s_-]/gu, '')
    .replace(/\s+/g, '_')
    .slice(0, 80)
    .replace(/_+$/, '') // 截断后可能留下尾随下划线
  return kept || 'resume'
}
