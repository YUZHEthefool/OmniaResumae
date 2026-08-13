/**
 * Template store：AI 生成的模板（「模板工坊」产物，localStorage 持久）
 * 内置模板不在此（由 src/templates/index.ts 静态自注册），只持久用户/AI 生成数据。
 * 复用 skillStore 的 zustand persist 模式。纯数据 store——不 import registry /
 * CustomTemplate，保持无环；注册由调用方（对话框保存时、index.ts 加载时）做。
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { uid, nowStamp } from '@/schema/defaults'
import type { GeneratedTemplate, GeneratedTemplateInput } from '@/types/template'

interface TemplateState {
  generated: GeneratedTemplate[]
  /** 加入并返回完整记录（含 id/时间戳），调用方据此立即 registerTemplate + setTemplate */
  addGenerated: (input: GeneratedTemplateInput) => GeneratedTemplate
  updateGenerated: (id: string, patch: Partial<GeneratedTemplateInput>) => void
  removeGenerated: (id: string) => void
}

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set) => ({
      generated: [],
      addGenerated: (input) => {
        const t = nowStamp()
        const tpl: GeneratedTemplate = { id: uid('gen'), ...input, createdAt: t, updatedAt: t }
        set((s) => ({ generated: [...s.generated, tpl] }))
        return tpl
      },
      updateGenerated: (id, patch) =>
        set((s) => ({
          generated: s.generated.map((g) =>
            g.id === id ? { ...g, ...patch, updatedAt: nowStamp() } : g,
          ),
        })),
      removeGenerated: (id) =>
        set((s) => ({ generated: s.generated.filter((g) => g.id !== id) })),
    }),
    {
      name: 'omniaresumae-templates',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ generated: s.generated }),
    },
  ),
)
