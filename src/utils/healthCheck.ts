/**
 * 简历完整度体检（纯本地，无 AI）
 *
 * 扫描 resume 的各字段，给出完整性得分（扣分制，满分 100）+ 问题清单。
 * 检查项基于求职刚需：必备联系方式、核心段落齐全、日期完整、要点非空。
 * 用 pick(field, locale) 判空（回退另一语言），避免误报单语言缺失。
 *
 * 问题文案经 i18n（hcMsg* 键），英文用户也可读；{ctx}=条目定位、{title}=段落标题。
 */
import type { Resume, Locale, Localized } from '@/types/resume'
import { pick } from '@/types/resume'
import { t, type UIKey } from '@/i18n'

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

/** 检查 work/education 条目的日期与要点，返回扣分数（startDate 缺 -2、highlights 空 -2） */
function checkDateAndHighlights(
  it: { startDate?: string; endDate?: string; highlights?: Localized[] },
  locale: Locale,
  issues: HealthIssue[],
  ctx: string,
): number {
  let ded = 0
  // endDate 缺失 = "至今"，合法不扣；startDate 缺失才报。
  if (!it.startDate) { issues.push({ severity: 'warn', field: ctx, message: t('hcMsgStartDate', locale).replace('{ctx}', ctx) }); ded += 2 }
  // highlights 空（work/projects/education）
  const hl = it.highlights
  if (Array.isArray(hl) && hl.length === 0) { issues.push({ severity: 'warn', field: ctx, message: t('hcMsgNoHighlights', locale).replace('{ctx}', ctx) }); ded += 2 }
  else if (hl && hl.some((h) => !hasLoc(h, locale))) issues.push({ severity: 'info', field: ctx, message: t('hcMsgHighlightsEmptyLoc', locale).replace('{ctx}', ctx) })
  return ded
}

export function checkResume(resume: Resume, locale: Locale): HealthReport {
  const issues: HealthIssue[] = []
  let deduct = 0
  const b = resume.basics
  /** 取文案；带 ctx 的键做 {ctx} 替换 */
  const m = (key: UIKey, ctx?: string): string =>
    ctx === undefined ? t(key, locale) : t(key, locale).replace('{ctx}', ctx)

  // ── basics 必备字段（求职刚需） ──
  if (!hasLoc(b.name, locale)) { issues.push({ severity: 'critical', field: 'basics.name', message: m('hcMsgName') }); deduct += 25 }
  if (!hasLoc(b.label, locale)) { issues.push({ severity: 'warn', field: 'basics.label', message: m('hcMsgLabel') }); deduct += 10 }
  const hasEmail = !!b.email
  const hasPhone = !!b.phone
  if (!hasEmail) { issues.push({ severity: 'critical', field: 'basics.email', message: m('hcMsgEmail') }); deduct += 10 }
  if (!hasPhone) { issues.push({ severity: 'critical', field: 'basics.phone', message: m('hcMsgPhone') }); deduct += 10 }
  // 邮箱与电话全缺：求职者无法被联系，额外重扣
  if (!hasEmail && !hasPhone) { issues.push({ severity: 'critical', field: 'basics.contact', message: m('hcMsgNoContact') }); deduct += 15 }
  // 可选字段：仅提示不扣分
  if (!b.url) issues.push({ severity: 'info', field: 'basics.url', message: m('hcMsgUrl') })
  if (!hasLoc(b.summary, locale)) issues.push({ severity: 'info', field: 'basics.summary', message: m('hcMsgSummary') })
  if (!b.profiles || b.profiles.length === 0) issues.push({ severity: 'info', field: 'basics.profiles', message: m('hcMsgProfiles') })

  // ── 核心段落齐全 ──
  const hasSectionType = (type: string): boolean => resume.sections.some((s) => s.type === type && s.visible && s.items.length > 0)
  if (!hasSectionType('work')) { issues.push({ severity: 'warn', field: 'work', message: m('hcMsgNoWork') }); deduct += 10 }
  if (!hasSectionType('projects')) { issues.push({ severity: 'warn', field: 'projects', message: m('hcMsgNoProjects') }); deduct += 10 }
  if (!hasSectionType('education')) { issues.push({ severity: 'info', field: 'education', message: m('hcMsgNoEducation') }); deduct += 8 }
  if (!hasSectionType('skills')) issues.push({ severity: 'info', field: 'skills', message: m('hcMsgNoSkills') })

  // ── 各段细化检查 ──
  for (const s of resume.sections) {
    if (!s.visible) continue
    const title = pick(s.title, locale) || s.type
    if (s.items.length === 0) { issues.push({ severity: 'info', field: `section:${s.id}`, message: t('hcMsgSectionEmpty', locale).replace('{title}', title) }); deduct += 3 }

    s.items.forEach((it, i) => {
      const item = it as Record<string, unknown>
      const ctx = `${title} #${i + 1}`
      if (s.type === 'work') {
        const w = item as unknown as { name?: Localized; position?: Localized; startDate?: string; endDate?: string; highlights?: Localized[] }
        if (!hasLoc(w.name, locale)) { issues.push({ severity: 'warn', field: ctx, message: m('hcMsgCompany', ctx) }); deduct += 2 }
        if (!hasLoc(w.position, locale)) issues.push({ severity: 'info', field: ctx, message: m('hcMsgPosition', ctx) })
        deduct += checkDateAndHighlights(w, locale, issues, ctx)
      } else if (s.type === 'education') {
        const e = item as unknown as { institution?: Localized; area?: Localized; startDate?: string; endDate?: string; highlights?: Localized[] }
        if (!hasLoc(e.institution, locale)) { issues.push({ severity: 'warn', field: ctx, message: m('hcMsgSchool', ctx) }); deduct += 2 }
        if (!hasLoc(e.area, locale)) issues.push({ severity: 'info', field: ctx, message: m('hcMsgMajor', ctx) })
        deduct += checkDateAndHighlights(e, locale, issues, ctx)
      } else if (s.type === 'projects') {
        const p = item as unknown as { name?: Localized; description?: Localized; keywords?: string[]; highlights?: Localized[] }
        if (!hasLoc(p.name, locale)) { issues.push({ severity: 'warn', field: ctx, message: m('hcMsgProjectName', ctx) }); deduct += 3 }
        if (!hasLoc(p.description, locale)) { issues.push({ severity: 'info', field: ctx, message: m('hcMsgProjectDesc', ctx) }); deduct += 1 }
        if (!p.keywords || p.keywords.length === 0) issues.push({ severity: 'info', field: ctx, message: m('hcMsgKeywords', ctx) })
        const hl = p.highlights
        if (Array.isArray(hl) && hl.length === 0) { issues.push({ severity: 'warn', field: ctx, message: m('hcMsgProjectNoHighlights', ctx) }); deduct += 2 }
      }
    })
  }

  const score = Math.max(0, Math.min(100, 100 - deduct))
  return { score, issues }
}
