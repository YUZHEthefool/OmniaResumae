/**
 * JSON 导入：把本工具导出的 .json（或结构近似的 JSON）解析回 Resume。
 * 先 zod 严格校验；失败则 normalizeToResume 兜底归一化。均失败抛错。
 * 复用 aiStructure.normalizeToResume 与 validateAIResume，保证条目形状安全。
 */
import { ResumeSchema, validateAIResume } from '@/schema/validate'
import { normalizeToResume } from '@/ai/aiStructure'
import type { Resume, Locale } from '@/types/resume'

export function parseResumeJSON(text: string, locale: Locale = 'zh'): Resume {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('不是合法的 JSON 文件')
  }
  const strict = ResumeSchema.safeParse(data)
  if (strict.success) return validateAIResume(strict.data)
  // 松散兜底：仅当像一份简历（非数组对象且含 basics 或 sections）才归一化；
  // 否则拒绝，避免任意 JSON（数组/标量/{foo:bar}）变成空白简历，replace 模式下静默擦除用户 basics
  const obj = data as object
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      (!('basics' in obj) && !('sections' in obj))) {
    throw new Error('不是合法的简历 JSON（缺少 basics/sections）')
  }
  return validateAIResume(normalizeToResume(data, locale))
}
