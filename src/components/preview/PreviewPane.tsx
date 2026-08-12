/**
 * PreviewPane：右侧实时预览
 * 渲染当前模板；缩放由 uiStore.zoom 控制。
 * 预览根挂 ref 供导出（html2canvas / print）取 DOM。
 * 支持「编辑预览」模式：开启后带 data-edit 的文本可直接改，失焦写回 store。
 */
import { forwardRef, useMemo, useState, useCallback } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import { useUIStore } from '@/store/uiStore'
import { getTemplate } from '@/templates/registry'
import { t } from '@/i18n'
import type { Locale } from '@/types/resume'

export const PreviewPane = forwardRef<HTMLDivElement>(function PreviewPane(_props, ref) {
  const resume = useResumeStore((s) => s.current)
  const locale = useUIStore((s) => s.locale)
  const templateId = useUIStore((s) => s.templateId)
  const zoom = useUIStore((s) => s.zoom)
  const update = useResumeStore((s) => s.update)
  const [editing, setEditing] = useState(false)

  const Template = useMemo(() => getTemplate(templateId), [templateId])

  // 失焦写回：解析 data-edit="field::itemId" 或 "field::itemId::index"
  const onBlur = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      const el = e.target as HTMLElement
      const edit = el.getAttribute && el.getAttribute('data-edit')
      if (!edit) return
      const value = el.innerText
      const parts = edit.split('::')
      const field = parts[0]
      const itemId = parts[1]
      const idx = parts[2] !== undefined ? Number(parts[2]) : null
      update((d) => {
        for (const s of d.sections) {
          const item = s.items.find((it) => it.id === itemId) as Record<string, unknown> | undefined
          if (!item) continue
          if (field === 'highlights' && idx !== null) {
            const arr = (item.highlights ?? []) as { zh?: string; en?: string }[]
            if (arr[idx]) arr[idx] = { ...arr[idx], [locale]: value }
          } else if (field === 'description' || field === 'level') {
            item[field] = { ...(item[field] as { zh?: string; en?: string } ?? {}), [locale]: value }
          }
          break
        }
      })
    },
    [update, locale],
  )

  return (
    <div className="h-full flex flex-col bg-chrome-bg">
      {/* 预览工具栏 */}
      <div className="flex items-center justify-end gap-2 px-4 py-1.5 border-b border-chrome-border bg-chrome-panel">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={`px-2.5 py-1 text-xs rounded border ${
            editing ? 'bg-chrome-ink text-white border-chrome-ink' : 'border-chrome-border hover:bg-chrome-bg'
          }`}
          title="开启后可直接点击预览中的文本编辑"
        >
          {editing ? '✏ 编辑中（点完成）' : '✏ 编辑预览'}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto" style={{ width: '960px', transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
          <div
            ref={ref}
            contentEditable={editing}
            suppressContentEditableWarning
            onBlur={onBlur}
            style={{ outline: editing ? '1px dashed #999' : 'none' }}
          >
            {resume && Template ? (
              <Template.Component resume={resume} locale={locale} />
            ) : (
              <div className="text-chrome-muted text-sm">{t('emptyHint', locale as Locale)}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
