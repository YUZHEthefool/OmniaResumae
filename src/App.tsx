/**
 * App：初始化 store + 布局（顶栏 + 左右分栏）
 * 路由：Phase 0/1 为单屏编辑器；多屏路由后续 Phase 按需引入。
 */
import { useEffect, useRef } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import { useUIStore } from '@/store/uiStore'
import '@/templates' // 触发模板自注册（必须在渲染前）
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
