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
  // 松散兜底：归一化（补 id/时间戳/字段骨架）
  return validateAIResume(normalizeToResume(data, locale))
}
