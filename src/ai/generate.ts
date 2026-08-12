/**
 * AI 一键生成简历：用户自然语言描述（可选附已有材料）→ LLM → 完整结构化 Resume
 *
 * 与 aiStructure.ts 的 structureViaAI 区别：那个是「解析」已有简历文本（带页眉页脚噪音、
 * [pN] 提示），本函数是「生成」——基于描述推理、扩写出量化、强动词的要点。
 * 复用 SCHEMA_HINT / normalizeToResume 做归一化，再经 validateAIResume 加固。
 * 用 JSON mode 强制输出，JSON.parse 失败重试一次。
 */
import { chat, extractJSON } from './providers'
import { SCHEMA_HINT, normalizeToResume } from './aiStructure'
import { validateAIResume } from '@/schema/validate'
import type { AIProviderConfig } from '@/types/ai'
import type { Locale, Resume } from '@/types/resume'

export async function generateResume(
  config: AIProviderConfig,
  prompt: string,
  locale: Locale,
  sourceText?: string,
): Promise<Resume> {
  const lang = locale === 'zh' ? '中文' : 'English'
  const system = `你是一名资深简历撰写专家。根据用户的自然语言描述，生成一份完整、专业的结构化简历（${lang}）。
规则：
- 文本字段只填 ${locale} 对应语言，另一语言字段留空字符串。
- 要点用强动词开头、尽量量化成果；可在用户描述基础上合理扩写细节，但不得编造与描述相悖的事实。
- ${sourceText ? '下方「已有材料」是用户真实经历的事实来源，必须忠于事实，可在其基础上润色与结构化；若描述与材料冲突，以材料为准。' : '无已有材料时，按用户描述合理生成，缺信息处留空。'}
- 生成合理的段落集合：skills/projects/work/education/workflow 用 layout "main"；matches/domains/awards/publications/community 用 "sidebar"；无内容的段落可省略。
- 日期统一 "YYYY-MM"，未知留空字符串。
- 只输出严格合法的 JSON 对象，不要解释、不要代码块标记。schema 如下：
${SCHEMA_HINT}`

  const user = `请用${lang}生成一份完整简历的 JSON。

【我的描述】
${prompt}

【已有材料（可选，忠于事实）】
${sourceText ? sourceText.slice(0, 24000) : '（无）'}
`

  const content = await chat(config, {
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    json: true,
    temperature: 0.5,
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(extractJSON(content))
  } catch {
    const retry = await chat(config, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
        { role: 'assistant', content },
        { role: 'user', content: '上一段不是合法 JSON，请只输出严格合法的 JSON 对象。' },
      ],
      json: true,
      temperature: 0.1,
    })
    parsed = JSON.parse(extractJSON(retry))
  }

  return validateAIResume(normalizeToResume(parsed, locale))
}
