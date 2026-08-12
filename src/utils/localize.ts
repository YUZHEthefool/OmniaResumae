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
