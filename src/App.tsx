/**
 * App：初始化 store + 布局（顶栏 + 左右分栏）
 * 路由：Phase 0/1 为单屏编辑器；多屏路由后续 Phase 按需引入。
 */
import { useEffect, useRef } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import { useUIStore } from '@/store/uiStore'
import '@/templates' // 触发模板自注册（必须在渲染前）
import { getTemplate } from '@/templates/registry'
import { TopBar } from '@/components/chrome/TopBar'
import { SplitPane } from '@/components/chrome/SplitPane'
import { EditorPanel } from '@/components/editor/EditorPanel'
import { PreviewPane } from '@/components/preview/PreviewPane'
import { CopilotPanel } from '@/ai/CopilotPanel'

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
  }, [init])

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
    </div>
  )
}
