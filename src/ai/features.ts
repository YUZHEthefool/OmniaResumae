/**
 * AI 能力实现：优化润色 / 目标公司定向包装 / 翻译
 * 全部产出为 Proposal，经 zod 校验，由 ProposalReviewDialog 逐项接受。
 */
import { chat, extractJSON, type ChatMessage } from './providers'
import type { AIProviderConfig } from '@/types/ai'
import type { Locale, Resume, Localized } from '@/types/resume'
import { OptimizeProposalSchema, TailorProposalSchema, TranslateProposalSchema } from '@/schema/validate'
import type { OptimizeProposal, TailorProposal, TranslateProposal } from '@/types/ai'
import { pick } from '@/types/resume'

/**
 * 调用 JSON mode 并解析；失败重试一次（附"只输出合法 JSON"提示），仍失败抛友好错误。
 * 与 generate.ts/aiStructure.ts 行为对齐，避免裸 SyntaxError 透传到 UI。
 */
async function chatJsonWithRetry(
  config: AIProviderConfig,
  messages: ChatMessage[],
  temperature: number,
): Promise<unknown> {
  const raw = await chat(config, { messages, json: true, temperature })
  try {
    return JSON.parse(extractJSON(raw))
  } catch {
    const retry = await chat(config, {
      messages: [
        ...messages,
        { role: 'assistant', content: raw },
        { role: 'user', content: '上一段不是合法 JSON，请只输出严格合法的 JSON 对象。' },
      ],
      json: true,
      temperature: 0.1,
    })
    try {
      return JSON.parse(extractJSON(retry))
    } catch {
      throw new Error('AI 未返回合法 JSON，请重试')
    }
  }
}

/* ───────── A. 优化润色 ───────── */
export async function optimizeItems(
  config: AIProviderConfig,
  items: string[],
  context: string,
  locale: Locale,
): Promise<OptimizeProposal> {
  const langRule = locale === 'zh'
    ? '用中文。每条以强动词开头，尽量量化成果，去除空话套话，保持事实不变。'
    : 'In English. Start each with a strong action verb; quantify impact; cut fluff; keep facts unchanged.'
  const sys = `你是资深简历润色专家。${langRule}
只输出 JSON：{"items":[{"original":"原文","rewritten":"改写"}]}`
  const user = `上下文：${context || '（无）'}
请改写以下简历要点：
${items.map((x, i) => `${i + 1}. ${x}`).join('\n')}
只输出 JSON。`
  const parsed = await chatJsonWithRetry(config, [{ role: 'system', content: sys }, { role: 'user', content: user }], 0.5)
  return OptimizeProposalSchema.parse(parsed)
}

/* ───────── B. 目标公司定向包装 ───────── */
export async function tailorToCompany(
  config: AIProviderConfig,
  resume: Resume,
  company: string,
  jobDescription: string,
  locale: Locale,
): Promise<TailorProposal> {
  // 把简历拍平成对 AI 友好的文本
  const projects = resume.sections.find((s) => s.type === 'projects')?.items as
    { id: string; name: Localized; description: Localized; highlights: Localized[]; keywords?: string[] }[] | undefined
  const projDigest = (projects ?? []).map((p, i) => `P${i + 1}[id=${p.id}] ${pick(p.name, locale)}: ${pick(p.description, locale)} | 要点: ${(p.highlights ?? []).map((h) => pick(h, locale)).filter(Boolean).join(' / ')}`).join('\n')
  const lang = locale === 'zh' ? '中文' : 'English'

  const sys = `你是资深技术招聘顾问。根据目标公司背景与岗位描述，对候选人的简历提出定向包装建议（${lang}）。
只输出 JSON，schema：
{
  "featuredProjects": [{"projectId":"P1 的 id","reason":"为什么主推"}],
  "rewrittenHighlights": [{"projectId":"id","highlights":["改写后的要点"]}],
  "matches": [{"tag":"招聘要求关键词","body":"我的匹配说明"}],
  "pride":"一句话核心优势包装"
}
要点：只针对 JD 相关项目；改写要点贴合 JD 关键词、强动词、量化；matches 数组用于"招聘要求↔自我匹配"。`

  const user = `目标公司：${company}
岗位描述 / 背景：
${jobDescription.slice(0, 4000)}

候选项目清单：
${projDigest || '（无项目）'}

只输出 JSON。`

  const parsed = await chatJsonWithRetry(config, [{ role: 'system', content: sys }, { role: 'user', content: user }], 0.5)
  return TailorProposalSchema.parse(parsed)
}

/* ───────── C. 翻译（补全另一语言） ───────── */
export async function translateItems(
  config: AIProviderConfig,
  items: string[],
  from: Locale,
  to: Locale,
): Promise<TranslateProposal> {
  const sys = `你是专业翻译。把给定的简历条目从${from === 'zh' ? '中文' : 'English'}译成${to === 'zh' ? '中文' : 'English'}，保持简历语气、术语准确、简洁。
只输出 JSON：{"pairs":[{"source":"原文","target":"译文"}]}`
  const user = items.map((x, i) => `${i + 1}. ${x}`).join('\n')
  const parsed = await chatJsonWithRetry(config, [{ role: 'system', content: sys }, { role: 'user', content: user }], 0.3)
  return TranslateProposalSchema.parse(parsed)
}
