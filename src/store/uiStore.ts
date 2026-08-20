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
import { useResumeStore } from '@/store/resumeStore'

export type Theme = 'light' | 'dark'

interface UIState {
  locale: Locale
  templateId: string
  zoom: number
  panelRatio: number // 左侧占比 0.2~0.8
  copilotOpen: boolean // AI Copilot 右侧面板是否展开（默认收起，按需点开）
  theme: Theme
  importOpen: boolean // 导入对话框是否打开（由顶栏按钮或拖拽文件触发）
  importFile: File | null // 拖拽带入、待 ImportDialog 消费的文件
  setLocale: (l: Locale) => void
  setTemplate: (id: string) => void
  /** 仅写 uiStore.templateId（不镜像）——供 App 从 resume.templateId 重水合用 */
  setTemplateId: (id: string) => void
  setZoom: (z: number) => void
  setPanelRatio: (r: number) => void
  setCopilotOpen: (v: boolean) => void
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setImportOpen: (v: boolean) => void
  setImportFile: (f: File | null) => void
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
      templateId: 'serif-classic',
      zoom: 0.85,
      panelRatio: 0.42,
      copilotOpen: false,
      theme: 'light',
      importOpen: false,
      importFile: null,
      setLocale: (locale) => set({ locale }),
      setTemplate: (templateId) => {
        set({ templateId })
        // 镜像到 resume.templateId 以持久：兑现注释承诺的「随简历走、跨刷新」。
        // update 仅在 current 存在时生效；未载入时为 no-op（重水合由 App.subscribe 负责）。
        useResumeStore.getState().update((d) => {
          d.templateId = templateId
        })
      },
      setTemplateId: (templateId) => set({ templateId }),
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
      setImportOpen: (importOpen) => set({ importOpen }),
      setImportFile: (importFile) => set({ importFile }),
    }),
    {
      name: 'omniaresumae-ui',
      storage: createJSONStorage(() => localStorage),
      // theme 必持久化（驱动 <html> dark 类）；locale/zoom/panelRatio 是用户偏好，
      // 旧版只持久化 theme 致使英文用户每次刷新弹回中文、缩放/分栏比例丢失——一并持久化。
      // templateId 不在此持久：它镜像到 resume.templateId，由 App.subscribe 从简历重水合
      // （避免双写不一致）。importFile 是 File 不可序列化，排除（本就不该跨会话）。
      // copilotOpen 不持久：每次启动默认收起，避免无意占屏。
      partialize: (s) => ({ theme: s.theme, locale: s.locale, zoom: s.zoom, panelRatio: s.panelRatio }),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    },
  ),
)
