/**
 * PreviewPane：右侧实时预览
 * 渲染当前模板；缩放由 uiStore.zoom 控制。
 * 预览根挂 ref 供导出（html2canvas / print）取 DOM。
 * 支持「编辑预览」模式：开启后带 data-edit 的文本可直接改，失焦写回 store。
 */
import { forwardRef, useEffect, useMemo, useState } from 'react'
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

  const Template = useMemo(() => getTemplate(templateId) ?? getTemplate('serif-classic'), [templateId])

  // 编辑预览：开启后对模板输出的每个 [data-edit] 元素单独设 contentEditable，
  // 失焦时解析 data-edit="field::itemId" 或 "field::itemId::index" 写回 store。
  // 关键：contentEditable 必须挂到 [data-edit] 元素本身，而非外层 wrapper——
  // 挂在 wrapper 上时 onBlur 的 e.target 是 wrapper（无 data-edit），编辑会被静默丢弃。
  // 依赖 resume：写回触发重渲染产生新 DOM 元素，effect 重跑把新元素重新接上可编辑。
  useEffect(() => {
    const root = (ref as unknown as React.RefObject<HTMLDivElement | null> | null)?.current ?? null
    if (!root || !editing) return
    const els = Array.from(root.querySelectorAll('[data-edit]')) as HTMLElement[]
    els.forEach((el) => { el.setAttribute('contenteditable', 'true'); el.tabIndex = -1 })

    const onElBlur = (e: FocusEvent) => {
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
            item[field] = { ...((item[field] as { zh?: string; en?: string }) ?? {}), [locale]: value }
          }
          break
        }
      })
    }
    els.forEach((el) => el.addEventListener('blur', onElBlur))
    return () => {
      els.forEach((el) => { el.removeAttribute('contenteditable'); el.removeEventListener('blur', onElBlur) })
    }
  }, [editing, resume, update, locale, ref])

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
