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

/** 逐语种合并 Localized（保留已有语言，补入新语言）。空串/纯空白视为"未提供"，回退到 base，避免 AI 传 '' 擦掉另一语言已有翻译。 */
export function mergeLoc(base: Localized | undefined, patch: Localized | undefined): Localized | undefined {
  if (!patch) return base
  const clean = (v: string | undefined) => (v && v.trim() ? v : undefined)
  return { zh: clean(patch.zh) ?? base?.zh, en: clean(patch.en) ?? base?.en }
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
 * 把 Localized[] 字段（如 courses）强制为安全形态：对象取 zh/en，字符串按当前语种写入并按索引
 * 回填旧值另一语言，其余元素丢弃。与 coerceHighlights 同构，但丢弃无效元素而非保留空对象
 * （课程列表里空占位无意义）。修复：courses 在 schema 里是 Localized[]（validate.ts:55），
 * 旧实现把它与 keywords/languages（string[]）混在一起仅兜底成数组，模型传 ["数据结构","算法"]
 * 这种自然形态会原样保留字符串 → EducationItemSchema.safeParse 元素非对象失败 → 整条教育条目
 * 被 validateAIResume 丢弃（institution/area/dates/highlights 全丢，静默数据丢失）。
 */
export function coerceLocArray(v: unknown, locale: Locale, prev: Localized[] = []): Localized[] {
  if (!Array.isArray(v)) return []
  return v
    .map((c, i): Localized | null => {
      if (isLocalized(c)) return { zh: c.zh, en: c.en }
      if (typeof c === 'string' && c.trim()) return { ...(prev[i] ?? {}), [locale]: c } as Localized
      return prev[i] ?? null
    })
    .filter((c): c is Localized => !!c)
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
    } else if (k === 'courses') {
      // courses 是 Localized[]（非 keywords/languages 的 string[]）：强制每元素为 Localized，
      // 否则模型传字符串数组会导致 EducationItemSchema 校验失败、整条教育条目被丢弃。
      out[k] = coerceLocArray(v, locale)
    } else if (k === 'keywords' || k === 'languages') {
      // 这两字段运行时按 string[] 用（模板 .join / .map）；模型若误传非数组会原样写入致渲染崩溃，兜底成数组
      out[k] = Array.isArray(v) ? v : []
    } else {
      out[k] = v
    }
  }
  return out
}
