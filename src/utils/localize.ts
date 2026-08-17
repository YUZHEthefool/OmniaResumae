import type { Localized, Locale } from '@/types/resume'
import { pick } from '@/types/resume'

/** 取本地化文本的便捷别名 */
export function L(value: Localized | undefined, locale: Locale, fallback = ''): string {
  return pick(value, locale, fallback)
}

/** 判断 Localized 是否两语言都空 */
export function isEmptyLocalized(v?: Localized): boolean {
  if (!v) return true
  return !(v.zh?.trim() || v.en?.trim())
}

/** 浅 clone 一个 Localized，避免共享引用 */
export function cloneLocalized(v?: Localized): Localized {
  return { zh: v?.zh ?? '', en: v?.en ?? '' }
}

/** 日期范围：'present'/'至今' 按语种本地化；空 endDate 保持空（schema 约定至今留空，渲染时只显示开始日期）。 */
export function fmtDateRange(start?: string, end?: string, locale: Locale = 'zh'): string {
  const norm = (d?: string) => {
    if (!d) return ''
    const t = d.trim()
    if (/^(present|至今)$/i.test(t)) return locale === 'zh' ? '至今' : 'Present'
    return d
  }
  return [norm(start), norm(end)].filter(Boolean).join(' — ')
}
