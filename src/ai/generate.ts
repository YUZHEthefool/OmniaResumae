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
import { runAgentStream, type ToolDef } from './agent'
import type { AIProviderConfig } from '@/types/ai'
import type { Locale, Resume } from '@/types/resume'
import type { Skill } from '@/skills/types'

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
    try {
      parsed = JSON.parse(extractJSON(retry))
    } catch {
      throw new Error('AI 两次均未返回合法 JSON，请重试')
    }
  }

  return validateAIResume(normalizeToResume(parsed, locale))
}

/**
 * 带 skill 的 agent 循环生成：skill 的 body 作为主指令注入 system，agent 可用 read_reference
 * 按需读 skill 的 references（渐进式披露），最后调用 emit_resume 一次吐出完整简历 JSON。
 * 无 emit_resume 调用则抛错（调用方可回退到 generateResume）。
 */
export async function generateWithSkill(
  config: AIProviderConfig,
  skill: Skill,
  prompt: string,
  locale: Locale,
  sourceText?: string,
): Promise<Resume> {
  const lang = locale === 'zh' ? '中文' : 'English'
  const system = `${skill.body}

【通用规则】
- 文本字段只填 ${locale} 对应语言，另一语言字段留空字符串。
- 生成合理段落：skills/projects/work/education/workflow 用 layout "main"；matches/domains/awards/publications/community 用 "sidebar"；无内容段落可省略。
- 日期统一 "YYYY-MM"，未知留空字符串。
${sourceText ? '- 「已有材料」是用户真实经历的事实来源，必须忠于事实；描述与材料冲突以材料为准。\n' : ''}
【工具使用】
- read_reference(name)：按需读取本 skill 的补充规则（name 见 references）。
- emit_resume(resume)：最后必须调用一次，传入完整简历 JSON 结束任务。

【输出 schema】
${SCHEMA_HINT}`

  const user = `请用${lang}生成一份完整简历。

【我的描述】
${prompt}

【已有材料（可选，忠于事实）】
${sourceText ? sourceText.slice(0, 24000) : '（无）'}
`

  const tools: ToolDef[] = [
    {
      name: 'read_reference',
      description: '读取本 skill 的补充规则片段。name 为 reference 名称。',
      input_schema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'reference 名称' } },
        required: ['name'],
      },
      run: (args) => {
        const name = String(args.name ?? '')
        const ref = skill.references.find((r) => r.name === name)
        return ref ? ref.content : `未找到 reference: ${name}`
      },
    },
    {
      name: 'emit_resume',
      description: '提交最终完整简历 JSON，结束任务。传入符合 schema 的完整 resume 对象。',
      input_schema: {
        type: 'object',
        properties: {
          basics: { type: 'object' },
          sections: { type: 'array' },
          meta: { type: 'object' },
        },
        required: ['basics', 'sections'],
      },
      run: () => 'ok',
    },
  ]

  const result = await runAgentStream(config, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    tools,
    maxSteps: 10,
    temperature: 0.5,
    onEvent: () => {},
  })
  const emit = result.toolCalls.find((tc) => tc.name === 'emit_resume')
  if (!emit) throw new Error('AI 未调用 emit_resume 完成生成（可能模型不支持工具调用，可改选「无 skill」重试）')
  return validateAIResume(normalizeToResume(emit.args, locale))
}
