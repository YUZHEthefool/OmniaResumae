/**
 * AI 模板样式生成（「模板工坊」）
 *
 * 用户上传参考图片（可选）+ 描述 → LLM 产出一套 CSS（作用域 .tpl-custom）+ 字体族名，
 * 覆盖 CustomBody 的固定 DOM。支持迭代微调：每轮重建完整 messages，图片始终挂在
 * 首条 user 消息，故每轮模型都「看得到」图。非视觉模型自动降级为纯文字（去图重试）。
 * 产出经 GeneratedTemplateSchema 校验。
 */
import { chat, extractJSON, type ChatMessage, type ContentPart } from '@/ai/providers'
import { GeneratedTemplateSchema } from '@/schema/validate'
import type { AIProviderConfig } from '@/types/ai'
import type { Locale } from '@/types/resume'
import type { GeneratedTemplateInput } from '@/types/template'

export interface StyleTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface GenerateStyleArgs {
  /** 参考样式图（data: URL），可选。挂在首条 user 消息，每轮重放 */
  imageDataUrl?: string | null
  /** 完整对话历史：首轮 {user, 描述}，之后交替 assistant/user（微调） */
  turns: StyleTurn[]
  locale: Locale
}

export interface GenerateStyleResult {
  template: GeneratedTemplateInput
  /** 是否真正用上了图片（非视觉模型会 false） */
  usedVision: boolean
}

export function buildSystemPrompt(locale: Locale): string {
  const lang = locale === 'zh' ? '中文' : 'English'
  return [
    `你是一名资深简历视觉设计师 + 前端工程师。用户会给你一张参考样式图片（可选）和/或一段描述，你要为一份简历生成一套 CSS，复刻其视觉风格。style 标签用${lang}。`,

    `【你的产出】只输出一个 JSON 对象，schema：`,
    `{"name":{"zh":"模板中文名","en":"Template Name"},"style":"一句话风格标签","css":"...完整 CSS 字符串...","fonts":["Google Fonts 族名1","族名2"]}`,

    `【关键约束】`,
    `1. CSS 的所有选择器必须以根类 .tpl-custom 开头作作用域（如 .tpl-custom .name、.tpl-custom .section .sec-title）。绝不写脱离 .tpl-custom 的全局样式。`,
    `2. 你只能控制视觉样式，不能改 DOM 结构。DOM 固定，可用的 class 词表如下：`,
    ``,
    `.tpl-custom > .page`,
    `  header.head`,
    `    img.avatar（头像，可选）`,
    `    .name（姓名）`,
    `    .label（头衔，可选）`,
    `    .contact > .contact-item（邮箱/电话/网址/所在地 各一个）`,
    `    p.summary（核心优势摘要，可选）`,
    `  .keywords > .kw（关键词条，可选）`,
    `  .pride-block（与 summary 同内容；brutalist 风「引以为傲」块。默认与 .summary 二选一显示：选一种 display:none 另一种）`,
    `  .grid`,
    `    .col-main`,
    `      section.section[data-type="..."]（主栏段落，layout=main）`,
    `        .sec-num（段号；brutalist 钩子，默认可 display:none）`,
    `        .sec-title`,
    `        .sec-body`,
    `    .col-side`,
    `      .side-block[data-type="basics"] > .side-title（"基本信息"）+ .info-line > .k（岗位/城市/Email/电话）`,
    `      .side-block[data-type="..."] > .side-title + .sec-body（侧栏段落，layout=sidebar）`,
    ``,
    `各 section 类型在 .sec-body 内的 class：`,
    `- work/education：.entry > .entry-head > (.entry-title + .entry-org + .entry-date)，.entry-points > li`,
    `- projects：.project[data-badge="oss|dev|patent|..."] > .project-head > (.project-name + .project-link)，.project-meta，.project-desc，.project-points > li`,
    `- skills：.skill-row > (.skill-key + .skill-val)`,
    `- awards：.award > (.award-title + .award-meta)`,
    `- publications：.pub > (.pub-name + .pub-date)`,
    `- matches：.match > (.match-tag + .match-body)`,
    `- domains：.domain > (.domain-icon + .domain-name + .domain-sub)`,
    `- workflow：.wf[data-index] > (.wf-label + .wf-text)`,
    `- community：.comm > (.comm-platform + .comm-handle)`,
    `- custom：.custom-item > (.custom-k + .custom-v)`,
    ``,
    `3. 布局：.grid 始终含 .col-main + .col-side。用 grid-template-columns 决定 1 栏（如 1fr，并把 .col-side 设 display:none）或 2 栏（如 1fr 240px）。`,
    `4. 必须包含 .export-single .tpl-custom { ... } 密度块：外层加 .export-single 类时（单页 A4 PDF 导出），收紧间距/字号让内容更紧凑。`,
    `5. 字体：在 fonts 数组给 Google Fonts 族名（可含轴如 "Inter:wght@400;700"、"Playfair Display:ital,wght@0,400;0,700;1,400"）。绝不在 CSS 里写 @import——字体由系统按 fonts 数组加载。CSS 里 font-family 直接引用这些族名。`,
    `6. 安全：CSS 里不要用 @import，不要用 url() 引用远程 http/https 资源（如需图标/纹理用 data: URL 或纯 CSS 图形）。`,
    `7. 自包含：在 .tpl-custom 上声明自己的 CSS 变量（如 --c-accent、--c-ink、--c-bg）并消费；在 .tpl-custom 上设 font-family、color、background。打印友好（白底深字为主，或明确支持深色）。`,
    ``,
    `【示例（仅示意，按参考图/描述调整）】`,
    `.tpl-custom { --c-accent:#4870ac; --c-ink:#2a2a2a; --c-line:#d8dee5; font-family:'Source Serif 4',serif; color:var(--c-ink); background:#fff; }`,
    `.tpl-custom .page { max-width:800px; margin:0 auto; padding:40px; }`,
    `.tpl-custom .head { text-align:center; border-bottom:2px solid var(--c-accent); padding-bottom:12px; }`,
    `.tpl-custom .name { font-size:30px; font-weight:700; }`,
    `.tpl-custom .grid { display:grid; grid-template-columns:1fr 240px; gap:24px; }`,
    `.tpl-custom .sec-title { color:var(--c-accent); font-size:14px; border-bottom:1px solid var(--c-line); padding-bottom:4px; }`,
    `.tpl-custom .pride-block { display:none; }`,
    `.tpl-custom .sec-num { display:none; }`,
    `.export-single .tpl-custom .page { padding:24px; }`,
    ``,
    `只输出 JSON，不要解释、不要代码块标记。`,
  ].join('\n')
}

export async function generateTemplateStyle(
  config: AIProviderConfig,
  args: GenerateStyleArgs,
): Promise<GenerateStyleResult> {
  const { imageDataUrl, turns, locale } = args
  const sys = buildSystemPrompt(locale)

  const buildMessages = (withImage: boolean): ChatMessage[] => {
    const msgs: ChatMessage[] = [{ role: 'system', content: sys }]
    turns.forEach((t, idx) => {
      if (idx === 0 && t.role === 'user' && withImage && imageDataUrl) {
        const parts: ContentPart[] = [
          { type: 'text', text: t.text },
          { type: 'image', dataUrl: imageDataUrl },
        ]
        msgs.push({ role: 'user', content: parts })
      } else {
        msgs.push({ role: t.role, content: t.text })
      }
    })
    return msgs
  }

  let usedVision = !!imageDataUrl
  let raw: string
  try {
    raw = await chat(config, { messages: buildMessages(usedVision), json: true, temperature: 0.6 })
  } catch (e) {
    // 非视觉模型带图会报错 → 去图重试一次
    if (imageDataUrl) {
      usedVision = false
      raw = await chat(config, { messages: buildMessages(false), json: true, temperature: 0.6 })
    } else {
      throw e
    }
  }

  const parsed = JSON.parse(extractJSON(raw))
  const template = GeneratedTemplateSchema.parse(parsed) as GeneratedTemplateInput
  return { template, usedVision }
}
