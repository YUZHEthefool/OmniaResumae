/**
 * 编辑器 UI 文案 i18n（zh/en）
 * 注意：这是编辑器 chrome 的文案，与简历内容的 zh/en 是两回事。
 */
import { zh } from './zh'
import { en } from './en'

export type Dict = typeof zh
export type UIKey = keyof Dict

const dicts = { zh, en }

export function t(key: UIKey, locale: 'zh' | 'en'): string {
  const d = dicts[locale] ?? dicts.zh
  return d[key] ?? key
}

export { zh as zhDict, en as enDict }
