/**
 * Skill store：用户导入的 skills + 当前选中（localStorage 持久）
 * 内置 skills 不在此（由 getBuiltins() 运行时计算），只持久用户数据与选择。
 * 复用 settingsStore 的 zustand persist 模式。
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { uid } from '@/schema/defaults'
import { parseSkill } from '@/skills/parse'
import type { Skill } from '@/skills/types'

interface SkillState {
  userSkills: Skill[]
  selectedSkillId: string | null // null = 无 skill
  addSkill: (skill: Skill) => void
  removeSkill: (id: string) => void
  setSelectedSkill: (id: string | null) => void
  /** 解析 md 并加入用户 skills；成功返回 id，失败抛错（调用方捕获） */
  importSkillFromText: (md: string) => string
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      userSkills: [],
      selectedSkillId: null,
      addSkill: (skill) => set((s) => ({ userSkills: [...s.userSkills, skill] })),
      removeSkill: (id) =>
        set((s) => ({
          userSkills: s.userSkills.filter((k) => k.id !== id),
          selectedSkillId: s.selectedSkillId === id ? null : s.selectedSkillId,
        })),
      setSelectedSkill: (selectedSkillId) => set({ selectedSkillId }),
      importSkillFromText: (md) => {
        const parsed = parseSkill(md, { id: uid('skill') })
        get().addSkill(parsed)
        return parsed.id
      },
    }),
    {
      name: 'omniaresumae-skills',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
