/**
 * UI store：编辑器界面状态（与简历内容无关）
 * - locale: 当前编辑/预览语言
 * - templateId: 当前模板（镜像到 resume.templateId 以持久）
 * - zoom: 预览缩放
 * - panelRatio: 左右分栏比例
 */
import { create } from 'zustand'
import type { Locale } from '@/types/resume'

interface UIState {
  locale: Locale
  templateId: string
  zoom: number
  panelRatio: number // 左侧占比 0.2~0.8
  setLocale: (l: Locale) => void
  setTemplate: (id: string) => void
  setZoom: (z: number) => void
  setPanelRatio: (r: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  locale: 'zh',
  templateId: 'brutalist',
  zoom: 0.85,
  panelRatio: 0.42,
  setLocale: (locale) => set({ locale }),
  setTemplate: (templateId) => set({ templateId }),
  setZoom: (zoom) => set({ zoom: Math.max(0.4, Math.min(1.5, zoom)) }),
  setPanelRatio: (panelRatio) =>
    set({ panelRatio: Math.max(0.2, Math.min(0.8, panelRatio)) }),
}))
