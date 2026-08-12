/**
 * Zod 校验 schema
 *
 * 用途：导入（MD/LaTeX/PDF/AI 结构化）与 AI 产出的 JSON 进入 store 前先校验，
 *       失败则报错而非静默写入脏数据。
 */
import { z } from 'zod'

export const LocalizedSchema = z.object({
  zh: z.string().optional(),
  en: z.string().optional(),
})

export const ProfileSchema = z.object({
  network: z.string(),
  username: z.string(),
  url: z.string(),
})

export const BasicsSchema = z.object({
  name: LocalizedSchema,
  nameRomanized: z.string().optional(),
  label: LocalizedSchema.optional(),
  image: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  url: z.string().optional(),
  location: LocalizedSchema.optional(),
  profiles: z.array(ProfileSchema).optional(),
  summary: LocalizedSchema.optional(),
})

const idStr = z.string().min(1)

export const WorkItemSchema = z.object({
  id: idStr,
  name: LocalizedSchema,
  position: LocalizedSchema,
  url: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: LocalizedSchema.optional(),
  highlights: z.array(LocalizedSchema).default([]),
})

export const EducationItemSchema = z.object({
  id: idStr,
  institution: LocalizedSchema,
  area: LocalizedSchema,
  studyType: LocalizedSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  gpa: z.string().optional(),
  courses: z.array(LocalizedSchema).optional(),
  highlights: z.array(LocalizedSchema).optional(),
})

export const ProjectItemSchema = z.object({
  id: idStr,
  name: LocalizedSchema,
  description: LocalizedSchema,
  url: z.string().optional(),
  repoUrl: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  stars: z.number().optional(),
  languages: z.array(z.string()).optional(),
  highlights: z.array(LocalizedSchema).default([]),
  featured: z.boolean().optional(),
  badge: z.string().optional(),
  kind: z.enum(['own', 'contrib']).optional(),
})

export const SkillItemSchema = z.object({
  id: idStr,
  name: LocalizedSchema,
  level: LocalizedSchema.optional(),
  keywords: z.array(z.string()).optional(),
})

export const AwardItemSchema = z.object({
  id: idStr,
  title: LocalizedSchema,
  date: z.string().optional(),
  awarder: LocalizedSchema.optional(),
  summary: LocalizedSchema.optional(),
})

export const PublicationItemSchema = z.object({
  id: idStr,
  name: LocalizedSchema,
  publisher: LocalizedSchema.optional(),
  date: z.string().optional(),
  url: z.string().optional(),
})

export const MatchItemSchema = z.object({
  id: idStr,
  tag: LocalizedSchema,
  body: LocalizedSchema,
})

export const DomainItemSchema = z.object({
  id: idStr,
  icon: z.string(),
  name: LocalizedSchema,
  sub: LocalizedSchema,
})

export const WorkflowStepSchema = z.object({
  id: idStr,
  label: LocalizedSchema,
  text: LocalizedSchema,
})

export const CommunityItemSchema = z.object({
  id: idStr,
  platform: z.string(),
  handle: z.string(),
  url: z.string(),
})

export const SectionTypeSchema = z.enum([
  'skills', 'projects', 'work', 'education', 'awards', 'publications',
  'matches', 'domains', 'workflow', 'community', 'custom',
])

export const SectionSchema = z.object({
  id: idStr,
  type: SectionTypeSchema,
  title: LocalizedSchema,
  layout: z.enum(['main', 'sidebar']),
  items: z.array(z.unknown()).default([]),
  visible: z.boolean().default(true),
})

export const ResumeMetaSchema = z.object({
  targetRole: LocalizedSchema.optional(),
  keywords: z.array(LocalizedSchema).optional(),
})

export const ResumeSchema = z.object({
  id: idStr,
  name: z.string(),
  templateId: z.string(),
  meta: ResumeMetaSchema.default({}),
  basics: BasicsSchema,
  sections: z.array(SectionSchema).default([]),
  locale: z.enum(['zh', 'en']).default('zh'),
  createdAt: z.number(),
  updatedAt: z.number(),
})

/* ───────── AI 提案校验 ───────── */
export const TailorProposalSchema = z.object({
  featuredProjects: z.array(z.object({
    projectId: z.string(), reason: z.string(),
  })).default([]),
  rewrittenHighlights: z.array(z.object({
    projectId: z.string(), highlights: z.array(z.string()),
  })).default([]),
  matches: z.array(z.object({ tag: z.string(), body: z.string() })).default([]),
  pride: z.string().default(''),
})

export const OptimizeProposalSchema = z.object({
  items: z.array(z.object({ original: z.string(), rewritten: z.string() })).default([]),
})

export const TranslateProposalSchema = z.object({
  pairs: z.array(z.object({ source: z.string(), target: z.string() })).default([]),
})

/** 校验并 parse；失败抛 ZodError，调用方应捕获并提示用户 */
export function validateResume(data: unknown) {
  return ResumeSchema.parse(data)
}
