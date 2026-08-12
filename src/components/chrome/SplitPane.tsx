/**
 * 可拖拽左右分栏
 */
import { useRef, useCallback } from 'react'
import { useUIStore } from '@/store/uiStore'

export function SplitPane({
  left, right,
}: {
  left: React.ReactNode
  right: React.ReactNode
}) {
  const ratio = useUIStore((s) => s.panelRatio)
  const setRatio = useUIStore((s) => s.setPanelRatio)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onMove = useCallback(
    (clientX: number) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const r = (clientX - rect.left) / rect.width
      setRatio(r)
    },
    [setRatio],
  )

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div style={{ width: `${ratio * 100}%` }} className="h-full overflow-hidden border-r border-chrome-border min-w-[280px]">
        {left}
      </div>
      <div
        className="w-1.5 cursor-col-resize bg-chrome-border hover:bg-chrome-ink/40 flex-shrink-0 transition-colors"
        onPointerDown={(e) => {
          dragging.current = true
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (dragging.current) onMove(e.clientX)
        }}
        onPointerUp={() => { dragging.current = false }}
        onDoubleClick={() => setRatio(0.42)}
      />
      <div style={{ width: `${(1 - ratio) * 100}%` }} className="h-full overflow-hidden min-w-[280px]">
        {right}
      </div>
    </div>
  )
}
