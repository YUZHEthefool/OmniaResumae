/**
 * 空简历工厂 + 预置段
 *
 * createEmptyResume 生成一份带粗野模板默认段骨架的空简历，
 * 用户可在此基础上填写。段顺序对应 resume-template.html 的视觉布局。
 */
import type {
  Resume, Section, SectionType, Layout,
} from '@/types/resume'

let _seq = 0
/** 稳定且足够唯一的 id（无 Date.now/random 以保持可复现测试） */
export function uid(prefix = 'id'): string {
  _seq += 1
  return `${prefix}_${_seq.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

let _stamp = 1_700_000_000_000
/** 暴露给纯函数的时间戳（避免直接依赖 Date.now，便于复现） */
export function nowStamp(): number {
  _stamp += 1
  return _stamp
}

function section(
  type: SectionType,
  titleZh: string,
  titleEn: string,
  layout: Layout,
): Section {
  return {
    id: uid('sec'),
    type,
    title: { zh: titleZh, en: titleEn },
    layout,
    items: [],
    visible: true,
  }
}

export function createEmptyResume(name = '我的简历'): Resume {
  const t = nowStamp()
  return {
    id: uid('resume'),
    name,
    templateId: 'brutalist',
    meta: {
      targetRole: { zh: '', en: '' },
      keywords: [
        { zh: '', en: '' },
        { zh: '', en: '' },
        { zh: '', en: '' },
      ],
    },
    basics: {
      name: { zh: '', en: '' },
      nameRomanized: '',
      label: { zh: '', en: '' },
      summary: { zh: '', en: '' },
      email: '',
      phone: '',
      url: '',
      location: { zh: '', en: '' },
      profiles: [],
    },
    // 顺序对应粗野模板：主栏(能力/项目/工作流) + 侧栏(基本信息匹配/领域/专利/社区)
    sections: [
      section('skills', '能力与理解', 'Skills', 'main'),
      section('projects', '开发项目 · 专利', 'Projects', 'main'),
      section('workflow', '工作流 / 方法论', 'Workflow', 'main'),
      section('work', '工作经历', 'Experience', 'main'),
      section('education', '教育经历', 'Education', 'main'),
      section('matches', '招聘要求匹配', 'Match', 'sidebar'),
      section('domains', '涉足领域', 'Domains', 'sidebar'),
      section('awards', '奖项', 'Awards', 'sidebar'),
      section('publications', '专利 / 出版物', 'Patents', 'sidebar'),
      section('community', '社区', 'Community', 'sidebar'),
    ],
    locale: 'zh',
    createdAt: t,
    updatedAt: t,
  }
}

/** 默认 section title 文案表（新增 section 时复用） */
export const SECTION_TITLE_PRESETS: Record<SectionType, { zh: string; en: string }> = {
  skills: { zh: '能力与理解', en: 'Skills' },
  projects: { zh: '开发项目', en: 'Projects' },
  work: { zh: '工作经历', en: 'Experience' },
  education: { zh: '教育经历', en: 'Education' },
  awards: { zh: '奖项', en: 'Awards' },
  publications: { zh: '专利 / 出版物', en: 'Patents' },
  matches: { zh: '招聘要求匹配', en: 'Match' },
  domains: { zh: '涉足领域', en: 'Domains' },
  workflow: { zh: '工作流 / 方法论', en: 'Workflow' },
  community: { zh: '社区', en: 'Community' },
  custom: { zh: '自定义', en: 'Custom' },
}
