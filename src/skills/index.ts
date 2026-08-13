/**
 * 内置 skills：用 Vite ?raw 导入 markdown 原文，启动时 parse 成 Skill 列表。
 * 用户 skills 在 skillStore（localStorage）；内置只读、不可删。
 */
import generalMd from './builtin/general.md?raw'
import seniorMd from './builtin/senior-engineer.md?raw'
import freshMd from './builtin/fresh-graduate.md?raw'
import refineMd from './builtin/experience-refine.md?raw'
import { parseSkill } from './parse'
import type { Skill } from './types'

const BUILTIN_RAWS: string[] = [generalMd, seniorMd, freshMd, refineMd]

let _builtins: Skill[] | null = null
export function getBuiltins(): Skill[] {
  if (!_builtins) {
    _builtins = BUILTIN_RAWS.map((md) => parseSkill(md, { builtin: true }))
  }
  return _builtins
}

export type { Skill, SkillReference } from './types'
export { parseSkill } from './parse'
