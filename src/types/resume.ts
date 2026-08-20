/**
 * 简历数据模型 (Resume Schema)
 *
 * 设计原则：
 * - 字段级本地化 Localized = { zh?, en? }：结构编辑只做一次，AI 补全另一语言；
 *   语言中性字段（日期/URL/技术名/star 数）保持纯字符串。
 * - 实体对齐 JSON Resume 标准 (jsonresume.org)，便于互操作；
 *   扩展段 (matches/domains/workflow/community) 承载粗野模板特色，可被任意模板消费。
 * - Section 是顶层组织单元：type 决定 items 的具体类型，layout 决定主栏/侧栏。
 */

/** 本地化字符串。zh/en 可只填其一，渲染时回退到另一语言或占位。 */
export interface Localized {
  zh?: string
  en?: string
}

export type Locale = 'zh' | 'en'

export type Layout = 'main' | 'sidebar'

/* ───────── 基础信息 ───────── */
export interface Profile {
  network: string // 平台名，如 GitHub / Twitter
  username: string
  url: string
}

export interface Basics {
  name: Localized
  nameRomanized?: string // 拼音/罗马名（粗野模板 name-sub）
  label?: Localized // 头衔 / 目标岗位
  image?: string // 头像 dataURL
  email?: string
  phone?: string
  url?: string // 个人站
  location?: Localized // 所在地
  profiles?: Profile[]
  summary?: Localized // 引以为傲 / 核心优势（粗野 pride-block）
}

/* ───────── 各实体条目 ───────── */
export interface WorkItem {
  id: string
  name: Localized // 公司
  position: Localized
  url?: string
  startDate?: string // ISO YYYY-MM
  endDate?: string // ISO YYYY-MM，"至今"留空
  location?: Localized
  highlights: Localized[] // 逐条要点（AI 优化主战场）
}

export interface EducationItem {
  id: string
  institution: Localized
  area: Localized // 专业
  studyType?: Localized // 学位
  startDate?: string
  endDate?: string
  gpa?: string
  courses?: Localized[]
  highlights?: Localized[]
}

export interface ProjectItem {
  id: string
  name: Localized
  description: Localized
  url?: string
  repoUrl?: string
  keywords?: string[] // 技术栈
  stars?: number
  languages?: string[]
  highlights: Localized[]
  featured?: boolean // AI tailoring 时标记主推
  badge?: 'oss' | 'dev' | 'patent' | string // 粗野模板卡片色条
  /** 项目归属：own=个人项目（自己是 owner），contrib=参与/贡献（他人或组织拥有、自己作为贡献者） */
  kind?: 'own' | 'contrib'
}

export interface SkillItem {
  id: string
  name: Localized // 技能名
  level?: Localized // 熟练度说明
  keywords?: string[]
}

export interface AwardItem {
  id: string
  title: Localized
  date?: string
  awarder?: Localized
  summary?: Localized
}

export interface PublicationItem {
  id: string
  name: Localized
  publisher?: Localized
  date?: string
  url?: string
}

/* ───────── 粗野模板扩展段（可被任意模板消费） ───────── */
/** 招聘要求匹配 */
export interface MatchItem {
  id: string
  tag: Localized // 要求标签
  body: Localized // 自我匹配说明
}

/** 涉足领域 */
export interface DomainItem {
  id: string
  icon: string // emoji
  name: Localized
  sub: Localized // 领域副标题
}

/** 工作流 / 方法论步骤 */
export interface WorkflowStep {
  id: string
  label: Localized
  text: Localized
}

/** 社区 */
export interface CommunityItem {
  id: string
  platform: string
  handle: string
  url: string
}

/* ───────── Section ───────── */
export type SectionType =
  | 'skills'
  | 'projects'
  | 'work'
  | 'education'
  | 'awards'
  | 'publications'
  | 'matches'
  | 'domains'
  | 'workflow'
  | 'community'
  | 'custom'

/** 各 type 对应的 item 类型映射（运行时类型守卫用） */
export interface ItemTypeMap {
  skills: SkillItem
  projects: ProjectItem
  work: WorkItem
  education: EducationItem
  awards: AwardItem
  publications: PublicationItem
  matches: MatchItem
  domains: DomainItem
  workflow: WorkflowStep
  community: CommunityItem
  custom: Record<string, unknown>
}

export interface Section<T extends SectionType = SectionType> {
  id: string
  type: T
  title: Localized
  layout: Layout
  items: ItemTypeMap[T][]
  visible: boolean
}

export interface ResumeMeta {
  targetRole?: Localized // 目标岗位
  keywords?: Localized[] // divider-bar 关键词
  // pride 直接用 basics.summary
}

export interface Resume {
  id: string
  name: string // 简历档名
  templateId: string // 当前使用的模板
  meta: ResumeMeta
  basics: Basics
  sections: Section[]
  locale: Locale // 当前编辑/渲染语言
  createdAt: number
  updatedAt: number
}

/** 简历快照（命名版本）：某份简历在某个时点的完整深拷贝，用于多版本投递管理。
 *  不进 resumes 表（避免污染顶栏简历下拉），独立存 snapshots 表。恢复 = 用快照内容覆盖当前简历。 */
export interface Snapshot {
  id: string // uid('snap')
  resumeId: string // 所属简历 id（恢复时仍指向该简历）
  name: string // 用户命名，如「投 A 公司版」
  resume: Resume // 完整深拷贝（capture 时点，不可变）
  createdAt: number
}

/* ───────── 渲染期辅助：按 locale 取本地化文本 ───────── */
/** 取本地化字符串；当前 locale 缺失时回退另一语言，再缺失返回 fallback（默认空串） */
export function pick(value: Localized | undefined, locale: Locale, fallback = ''): string {
  if (!value) return fallback
  const primary = value[locale]
  if (primary && primary.trim()) return primary
  const other = locale === 'zh' ? value.en : value.zh
  if (other && other.trim()) return other
  return fallback
}
