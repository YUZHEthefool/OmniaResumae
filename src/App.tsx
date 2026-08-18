/**
 * App：初始化 store + 布局（顶栏 + 左右分栏）
 * 路由：Phase 0/1 为单屏编辑器；多屏路由后续 Phase 按需引入。
 */
import { useEffect, useRef, useState } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import { useUIStore } from '@/store/uiStore'
import { useChatStore } from '@/store/chatStore'
import { t } from '@/i18n'
import '@/templates' // 触发模板自注册（必须在渲染前）
import { getTemplate } from '@/templates/registry'
import { TopBar } from '@/components/chrome/TopBar'
import { SplitPane } from '@/components/chrome/SplitPane'
import { EditorPanel } from '@/components/editor/EditorPanel'
import { PreviewPane } from '@/components/preview/PreviewPane'
import { CopilotPanel } from '@/ai/CopilotPanel'

/** 全局拖拽文件导入：拖文件到页面任意位置即弹出导入对话框并自动加载该文件。 */
function DropZone() {
  const [over, setOver] = useState(false)
  const setImportFile = useUIStore((s) => s.setImportFile)
  const setImportOpen = useUIStore((s) => s.setImportOpen)
  const locale = useUIStore((s) => s.locale)
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const onDragOver = (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); setOver(true) } }
    const onDragLeave = (e: DragEvent) => { if (e.relatedTarget === null) setOver(false) }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setOver(false)
      const f = e.dataTransfer?.files?.[0]
      if (f) { setImportFile(f); setImportOpen(true) }
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [setImportFile, setImportOpen])
  if (!over) return null
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center pointer-events-none">
      <div className="bg-white rounded-lg px-8 py-6 text-center shadow-2xl">
        <div className="text-lg font-semibold">{t('dropHere', locale)}</div>
        <div className="text-xs text-chrome-muted mt-1">{t('dropHint', locale)}</div>
      </div>
    </div>
  )
}

export default function App() {
  const init = useResumeStore((s) => s.init)
  const loaded = useResumeStore((s) => s.loaded)
  const copilotOpen = useUIStore((s) => s.copilotOpen)
  const previewRef = useRef<HTMLDivElement>(null)

  // 选中模板随简历走、跨刷新保持：current 变化时（init 载入 / 切简历 / 内容更新）
  // 从 resume.templateId 重水合 uiStore.templateId，未注册的 id 回退 serif-classic。
  // 用 setTemplateId（不镜像）避免写回 resume 造成环。
  useEffect(() => {
    const unsub = useResumeStore.subscribe((s) => {
      const tid = s.current?.templateId
      const want = tid && getTemplate(tid) ? tid : 'serif-classic'
      if (useUIStore.getState().templateId !== want) useUIStore.getState().setTemplateId(want)
    })
    return unsub
  }, [])

  useEffect(() => {
    void init()
    // 对话历史从 Dexie 加载（不阻塞渲染：CopilotPanel 默认收起，点开时早完成）
    void useChatStore.getState().init()
  }, [init])

  // 全局快捷键：Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做、Ctrl/Cmd+S 强制保存。
  // 焦点在 input/textarea/contentEditable 时放行原生撤销/重做——受控输入的 undo/redo 经
  // onChange 同步回 store，若此处 preventDefault 会切断浏览器原生 redo 路径（旧版只放行
  // Ctrl+Z，Ctrl+Y / Ctrl+Shift+Z 在输入框内被吞，redo 失效）。输入态全交给浏览器。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); void useResumeStore.getState().saveNow() }
      else if (k === 'z' || k === 'y') {
        const target = e.target as HTMLElement | null
        const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        if (typing) return
        e.preventDefault()
        const isRedo = k === 'y' || (k === 'z' && e.shiftKey)
        if (isRedo) useResumeStore.getState().redo()
        else useResumeStore.getState().undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!loaded) {
    return (
      <div className="h-full flex items-center justify-center text-chrome-muted text-sm">
        正在加载本地简历…
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar previewRef={previewRef} />
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          <SplitPane left={<EditorPanel />} right={<PreviewPane ref={previewRef} />} />
        </div>
        {copilotOpen && <CopilotPanel />}
      </div>
      <DropZone />
    </div>
  )
}
