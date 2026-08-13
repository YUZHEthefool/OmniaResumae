/**
 * UI store：编辑器界面状态（与简历内容无关）
 * - locale: 当前编辑/预览语言
 * - templateId: 当前模板（镜像到 resume.templateId 以持久）
 * - zoom: 预览缩放
 * - panelRatio: 左右分栏比例
 * - theme: 浅色/深色（持久，深色用灰色系），切换时给 <html> 加/去 dark 类
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Locale } from '@/types/resume'

export type Theme = 'light' | 'dark'

interface UIState {
  locale: Locale
  templateId: string
  zoom: number
  panelRatio: number // 左侧占比 0.2~0.8
  copilotOpen: boolean // AI Copilot 右侧面板是否展开（默认收起，按需点开）
  theme: Theme
  setLocale: (l: Locale) => void
  setTemplate: (id: string) => void
  setZoom: (z: number) => void
  setPanelRatio: (r: number) => void
  setCopilotOpen: (v: boolean) => void
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

/** 把 theme 同步到 <html> 的 dark 类 */
function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', t === 'dark')
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      locale: 'zh',
      templateId: 'brutalist',
      zoom: 0.85,
      panelRatio: 0.42,
      copilotOpen: false,
      theme: 'light',
      setLocale: (locale) => set({ locale }),
      setTemplate: (templateId) => set({ templateId }),
      setZoom: (zoom) => set({ zoom: Math.max(0.4, Math.min(1.5, zoom)) }),
      setPanelRatio: (panelRatio) =>
        set({ panelRatio: Math.max(0.2, Math.min(0.8, panelRatio)) }),
      setCopilotOpen: (copilotOpen) => set({ copilotOpen }),
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(next)
        set({ theme: next })
      },
    }),
    {
      name: 'omniaresumae-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    },
  ),
)
