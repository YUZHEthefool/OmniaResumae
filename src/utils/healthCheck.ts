/**
 * 简历完整度体检（纯本地，无 AI）
 *
 * 扫描 resume 的各字段，给出完整性得分（扣分制，满分 100）+ 问题清单。
 * 检查项基于求职刚需：必备联系方式、核心段落齐全、日期完整、要点非空。
 * 用 pick(field, locale) 判空（回退另一语言），避免误报单语言缺失。
 */
import type { Resume, Locale, Localized } from '@/types/resume'
import { pick } from '@/types/resume'

export type IssueSeverity = 'critical' | 'warn' | 'info'

export interface HealthIssue {
  severity: IssueSeverity
  /** 关联字段/段落标识，用于定位（v1 仅展示，不跳转） */
  field: string
  message: string
}

export interface HealthReport {
  score: number
  issues: HealthIssue[]
}

const hasLoc = (v: Localized | undefined, locale: Locale): boolean => !!pick(v, locale)

/** 检查单条 work/education 条目的日期与要点 */
function checkDateAndHighlights(
  it: { startDate?: string; endDate?: string; highlights?: Localized[] },
  locale: Locale,
  issues: HealthIssue[],
  ctx: string,
): void {
  // endDate 缺失 = "至今"，合法不扣；startDate 缺失才报。
  if (!it.startDate) issues.push({ severity: 'warn', field: ctx, message: `${ctx} 缺少开始日期` })
  // highlights 空（work/projects/education）
  const hl = it.highlights
  if (Array.isArray(hl) && hl.length === 0) issues.push({ severity: 'warn', field: ctx, message: `${ctx} 没有要点（highlights）` })
  else if (hl && hl.some((h) => !hasLoc(h, locale))) issues.push({ severity: 'info', field: ctx, message: `${ctx} 有要点在当前语言下为空` })
}

export function checkResume(resume: Resume, locale: Locale): HealthReport {
  const issues: HealthIssue[] = []
  let deduct = 0
  const b = resume.basics

  // ── basics 必备字段（求职刚需） ──
  if (!hasLoc(b.name, locale)) { issues.push({ severity: 'critical', field: 'basics.name', message: '缺少姓名' }); deduct += 25 }
  if (!hasLoc(b.label, locale)) { issues.push({ severity: 'warn', field: 'basics.label', message: '缺少头衔 / 目标岗位' }); deduct += 10 }
  const hasEmail = !!b.email
  const hasPhone = !!b.phone
  if (!hasEmail) { issues.push({ severity: 'critical', field: 'basics.email', message: '缺少邮箱' }); deduct += 10 }
  if (!hasPhone) { issues.push({ severity: 'critical', field: 'basics.phone', message: '缺少电话' }); deduct += 10 }
  // 邮箱与电话全缺：求职者无法被联系，额外重扣
  if (!hasEmail && !hasPhone) { issues.push({ severity: 'critical', field: 'basics.contact', message: '邮箱与电话均缺失，无法联系' }); deduct += 15 }
  // 可选字段：仅提示不扣分
  if (!b.url) issues.push({ severity: 'info', field: 'basics.url', message: '未填个人网站（可选）' })
  if (!hasLoc(b.summary, locale)) issues.push({ severity: 'info', field: 'basics.summary', message: '未填核心优势 / 简介（可选）' })
  if (!b.profiles || b.profiles.length === 0) issues.push({ severity: 'info', field: 'basics.profiles', message: '未添加社交主页（可选）' })

  // ── 核心段落齐全 ──
  const hasSectionType = (type: string): boolean => resume.sections.some((s) => s.type === type && s.visible && s.items.length > 0)
  if (!hasSectionType('work')) { issues.push({ severity: 'warn', field: 'work', message: '没有工作经历段落（或为空）' }); deduct += 10 }
  if (!hasSectionType('projects')) { issues.push({ severity: 'warn', field: 'projects', message: '没有项目经历段落（或为空）' }); deduct += 10 }
  if (!hasSectionType('education')) { issues.push({ severity: 'info', field: 'education', message: '没有教育经历段落（或为空）' }); deduct += 8 }
  if (!hasSectionType('skills')) issues.push({ severity: 'info', field: 'skills', message: '没有技能段落（可选）' })

  // ── 各段细化检查 ──
  for (const s of resume.sections) {
    if (!s.visible) continue
    const title = pick(s.title, locale) || s.type
    if (s.items.length === 0) issues.push({ severity: 'info', field: `section:${s.id}`, message: `段落「${title}」为空` })

    s.items.forEach((it, i) => {
      const item = it as Record<string, unknown>
      const ctx = `${title} #${i + 1}`
      if (s.type === 'work') {
        const w = item as unknown as { name?: Localized; position?: Localized; startDate?: string; endDate?: string; highlights?: Localized[] }
        if (!hasLoc(w.name, locale)) { issues.push({ severity: 'warn', field: ctx, message: `${ctx} 缺少公司名` }); deduct += 2 }
        if (!hasLoc(w.position, locale)) { issues.push({ severity: 'info', field: ctx, message: `${ctx} 缺少职位` }) }
        checkDateAndHighlights(w, locale, issues, ctx)
      } else if (s.type === 'education') {
        const e = item as unknown as { institution?: Localized; area?: Localized; startDate?: string; endDate?: string; highlights?: Localized[] }
        if (!hasLoc(e.institution, locale)) { issues.push({ severity: 'warn', field: ctx, message: `${ctx} 缺少学校名` }); deduct += 2 }
        if (!hasLoc(e.area, locale)) { issues.push({ severity: 'info', field: ctx, message: `${ctx} 缺少专业` }) }
        checkDateAndHighlights(e, locale, issues, ctx)
      } else if (s.type === 'projects') {
        const p = item as unknown as { name?: Localized; description?: Localized; keywords?: string[]; highlights?: Localized[] }
        if (!hasLoc(p.name, locale)) { issues.push({ severity: 'warn', field: ctx, message: `${ctx} 缺少项目名` }); deduct += 3 }
        if (!hasLoc(p.description, locale)) { issues.push({ severity: 'info', field: ctx, message: `${ctx} 缺少描述` }); deduct += 1 }
        if (!p.keywords || p.keywords.length === 0) issues.push({ severity: 'info', field: ctx, message: `${ctx} 未填技术栈（keywords）` })
        const hl = p.highlights
        if (Array.isArray(hl) && hl.length === 0) issues.push({ severity: 'warn', field: ctx, message: `${ctx} 没有要点` })
      }
    })
  }

  const score = Math.max(0, Math.min(100, 100 - deduct))
  return { score, issues }
}
