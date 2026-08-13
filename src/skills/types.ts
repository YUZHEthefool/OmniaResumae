/**
 * Skill 类型：Anthropic Agent Skills 风格的指令包
 * - frontmatter: name / description
 * - body: 主指令
 * - references: 可被 agent 按需读取的渐进式披露片段
 */
export interface SkillReference {
  name: string
  content: string
}

export interface Skill {
  id: string // 内置用 name；用户导入用 uid('skill')
  name: string // kebab-case 标识符
  title: string // 中文显示名（无则回退 name）
  description: string
  body: string // 主指令（不含 reference 段）
  references: SkillReference[]
  builtin: boolean
}
