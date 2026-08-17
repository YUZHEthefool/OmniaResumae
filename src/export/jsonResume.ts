/**
 * 导出为 JSON Resume 标准格式（https://jsonresume.org/schema/）。
 * 数据模型本就对齐 JSON Resume，这里把内部 Localized 按 locale 取值并映射到标准字段。
 * 扩展段（matches/domains/workflow/community）非标准，不纳入，避免污染标准消费方。
 */
import type {
  Resume, Locale, Localized,
  WorkItem, EducationItem, ProjectItem, SkillItem,
  AwardItem, PublicationItem,
} from '@/types/resume'
import { pick } from '@/types/resume'

const L = (v: Localized | undefined, loc: Locale) => pick(v, loc)

export function resumeToJsonResume(resume: Resume, locale: Locale): Record<string, unknown> {
  const b = resume.basics
  const items = (type: string) =>
    (resume.sections.find((s) => s.type === type && s.visible)?.items ?? []) as never[]

  const clean = <T,>(arr: (T | undefined)[]): T[] => arr.filter((x): x is T => !!x)

  const out: Record<string, unknown> = {
    basics: {
      name: L(b.name, locale),
      label: L(b.label, locale) || undefined,
      email: b.email || undefined,
      phone: b.phone || undefined,
      url: b.url || undefined,
      location: L(b.location, locale) || undefined,
      summary: L(b.summary, locale) || undefined,
      profiles: (b.profiles ?? []).map((p) => ({ network: p.network, username: p.username, url: p.url })),
    },
  }

  const work = clean((items('work') as WorkItem[]).map((w) => {
    const o: Record<string, unknown> = {
      name: L(w.name, locale),
      position: L(w.position, locale),
      startDate: w.startDate || undefined,
      endDate: w.endDate || undefined,
      url: w.url || undefined,
      highlights: clean((w.highlights ?? []).map((h) => L(h, locale) || undefined)),
    }
    // JSON Resume 的 work 无 location 字段；旧实现把 location 塞进 summary（语义为职位描述）会误导消费方，故省略
    return (o.name || o.position) ? o : undefined
  }))
  if (work.length) out.work = work

  const education = clean((items('education') as EducationItem[]).map((e) => {
    const o: Record<string, unknown> = {
      institution: L(e.institution, locale),
      area: L(e.area, locale),
      studyType: L(e.studyType, locale) || undefined,
      startDate: e.startDate || undefined,
      endDate: e.endDate || undefined,
      score: e.gpa || undefined,
      courses: clean((e.courses ?? []).map((c) => L(c, locale) || undefined)),
    }
    return o.institution ? o : undefined
  }))
  if (education.length) out.education = education

  const projects = clean((items('projects') as ProjectItem[]).map((p) => {
    const o: Record<string, unknown> = {
      name: L(p.name, locale),
      description: L(p.description, locale) || undefined,
      url: p.url || p.repoUrl || undefined,
      keywords: p.keywords,
      highlights: clean((p.highlights ?? []).map((h) => L(h, locale) || undefined)),
    }
    return o.name ? o : undefined
  }))
  if (projects.length) out.projects = projects

  const skills = clean((items('skills') as SkillItem[]).map((s) => {
    const o: Record<string, unknown> = {
      name: L(s.name, locale),
      level: L(s.level, locale) || undefined,
      keywords: s.keywords,
    }
    return o.name ? o : undefined
  }))
  if (skills.length) out.skills = skills

  const awards = clean((items('awards') as AwardItem[]).map((a) => {
    const o: Record<string, unknown> = {
      title: L(a.title, locale),
      date: a.date || undefined,
      awarder: L(a.awarder, locale) || undefined,
      summary: L(a.summary, locale) || undefined,
    }
    return o.title ? o : undefined
  }))
  if (awards.length) out.awards = awards

  const publications = clean((items('publications') as PublicationItem[]).map((p) => {
    const o: Record<string, unknown> = {
      name: L(p.name, locale),
      publisher: L(p.publisher, locale) || undefined,
      releaseDate: p.date || undefined,
      url: p.url || undefined,
    }
    return o.name ? o : undefined
  }))
  if (publications.length) out.publications = publications

  return out
}
