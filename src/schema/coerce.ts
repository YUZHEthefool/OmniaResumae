/**
 * AI / 导入数据的字段强制（单一来源）
 *
 * 模型常把 Localized 字段产成裸字符串（如 name 为 "张三"）或漏掉带默认值的数组。
 * 直接写入 store 会导致 pick() 返回空、编辑时产生脏数据、模板 highlights.filter 崩溃。
 * 这里统一把松散对象规范化为安全形态，供 ai/tools.ts 与 ai/aiStructure.ts 共用。
 */
import type { Locale, Localized } from '@/types/resume'

export function isLocalized(v: unknown): v is Localized {
  return !!v && typeof v === 'object' && ('zh' in v || 'en' in v)
}

/** 逐语种合并 Localized（保留已有语言，补入新语言） */
export function mergeLoc(base: Localized | undefined, patch: Localized | undefined): Localized | undefined {
  if (!patch) return base
  return { zh: patch.zh ?? base?.zh, en: patch.en ?? base?.en }
}

/** 把字符串或对象规范化为 Localized：对象取 zh/en，字符串按当前语种写入，空值返回 undefined */
export function coerceLoc(v: unknown, locale: Locale): Localized | undefined {
  if (isLocalized(v)) return { zh: v.zh, en: v.en }
  if (typeof v === 'string' && v) return { [locale]: v } as Localized
  return undefined
}

/** basics 中属于 Localized 的字段名（按定义判断，避免空字段被当非 Localized 写入裸字符串） */
export const LOC_BASICS_KEYS = new Set(['name', 'label', 'summary', 'location'])

/** 条目中属于 Localized 的标量字段名（跨各 section type 的并集） */
export const LOC_ITEM_KEYS = new Set([
  'name', 'position', 'institution', 'area', 'studyType', 'description',
  'title', 'tag', 'body', 'label', 'text', 'sub', 'level', 'awarder', 'publisher', 'summary', 'location',
])

/** 把模型可能传错的 highlights（字符串数组 / 对象数组）规范化为 Localized[]；按索引保留旧值另一语言 */
export function coerceHighlights(v: unknown, locale: Locale, prev: Localized[] = []): Localized[] {
  if (!Array.isArray(v)) return []
  return v.map((h, i) => {
    if (isLocalized(h)) return { zh: h.zh, en: h.en }
    if (typeof h === 'string') return { ...(prev[i] ?? {}), [locale]: h } as Localized
    return prev[i] ?? {}
  })
}

/**
 * 把 AI/导入的松散条目规范化为某 type 的安全形态（不含 id，由调用方补）：
 * - LOC_ITEM_KEYS 标量字段：对象/字符串转为 {zh,en}（字符串按当前语种）
 * - highlights：coerceHighlights（始终返回数组，绝不 undefined）
 * - 其余字段（keywords/stars/url/dates 等）原样保留
 */
export function coerceItem(type: string, item: Record<string, unknown>, locale: Locale): Record<string, unknown> {
  void type // type 暂不参与字段集判断（LOC_ITEM_KEYS 已是全并集）；保留参数以便未来按 type 收窄
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(item)) {
    if (k === 'id' || v === undefined) continue
    if (LOC_ITEM_KEYS.has(k)) {
      const c = coerceLoc(v, locale)
      if (c) out[k] = c
    } else if (k === 'highlights') {
      out[k] = coerceHighlights(v, locale)
    } else {
      out[k] = v
    }
  }
  return out
}
