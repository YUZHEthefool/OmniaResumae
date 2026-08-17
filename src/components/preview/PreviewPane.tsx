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
  const [showPages, setShowPages] = useState(false)
  const [singlePreview, setSinglePreview] = useState(false)
  const [guide, setGuide] = useState<{ h: number; count: number }>({ h: 0, count: 0 })

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

  // A4 分页参考线：以预览内容宽度为 A4 宽，按 A4 高/宽比（1123/794）算每页高度，
  // 在内容上叠加虚线标记多页 PDF 会在哪里切断。随 zoom 缩放（线在 scaled 容器内）。
  useEffect(() => {
    const el = (ref as unknown as React.RefObject<HTMLDivElement | null> | null)?.current ?? null
    if (!el || !showPages) { setGuide({ h: 0, count: 0 }); return }
    const compute = () => {
      const w = el.clientWidth || 960
      const pageH = Math.round((w * 1123) / 794)
      const count = Math.max(0, Math.ceil(el.scrollHeight / pageH) - 1)
      setGuide({ h: pageH, count })
    }
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    compute()
    return () => ro.disconnect()
  }, [showPages, resume, templateId, locale, ref])

  return (
    <div className="h-full flex flex-col bg-chrome-bg">
      {/* 预览工具栏 */}
      <div className="flex items-center justify-end gap-2 px-4 py-1.5 border-b border-chrome-border bg-chrome-panel">
        {/* 单页预览：给预览根挂 .export-single，复用单页导出的紧凑+拆栏 CSS，所见即所得。
            与「分页线」「编辑预览」语义冲突，开启时互斥（开单页预览则关另两者）。 */}
        <button
          type="button"
          onClick={() => { setSinglePreview((v) => !v); if (!singlePreview) { setShowPages(false); setEditing(false) } }}
          className={`px-2.5 py-1 text-xs rounded border ${
            singlePreview ? 'bg-chrome-ink text-white border-chrome-ink' : 'border-chrome-border hover:bg-chrome-bg'
          }`}
          title={t('singlePreviewTitle', locale)}
        >
          {t('singlePreview', locale)}
        </button>
        <button
          type="button"
          onClick={() => setShowPages((v) => !v)}
          className={`px-2.5 py-1 text-xs rounded border ${
            showPages ? 'bg-chrome-ink text-white border-chrome-ink' : 'border-chrome-border hover:bg-chrome-bg'
          } disabled:opacity-30 disabled:cursor-not-allowed`}
          title={t('pageGuideTitle', locale)}
          disabled={singlePreview}
        >
          {t('pageGuide', locale)}
        </button>
        {/* 编辑预览：仅 Brutalist 模板输出 data-edit 钩子，其它模板点击无反应，故仅在该模板下显示按钮 */}
        {templateId === 'brutalist' && !singlePreview && (
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={`px-2.5 py-1 text-xs rounded border ${
            editing ? 'bg-chrome-ink text-white border-chrome-ink' : 'border-chrome-border hover:bg-chrome-bg'
          }`}
          title={t('editPreviewTitle', locale)}
        >
          {editing ? t('editPreviewDone', locale) : t('editPreview', locale)}
        </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto" style={{ width: '960px', transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
          <div
            ref={ref}
            className={singlePreview ? 'export-single' : undefined}
            style={{ outline: editing ? '1px dashed #999' : 'none', position: 'relative' }}
          >
            {resume && Template ? (
              <Template.Component resume={resume} locale={locale} />
            ) : (
              <div className="text-chrome-muted text-sm">{t('emptyHint', locale as Locale)}</div>
            )}
            {showPages && guide.h > 0 && Array.from({ length: guide.count }, (_, i) => (
              <div key={`pg${i}`} style={{ position: 'absolute', left: 0, right: 0, top: (i + 1) * guide.h, borderTop: '1px dashed #f59e0b', zIndex: 5, pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', right: 0, top: -13, fontSize: 10, color: '#f59e0b', background: 'rgba(255,255,255,.85)', padding: '0 4px', borderRadius: 2 }}>A4 · p{i + 2}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})
