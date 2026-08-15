/**
 * SectionEditor：渲染单个 section 的标题/布局/显隐 + 条目列表
 * 按 section.type 调用对应 itemEditor。
 * 段落与条目均支持 @dnd-kit 拖拽排序（保留 ▲▼ 按钮作无障碍备用）。
 */
import { useState } from 'react'
import { clsx } from 'clsx'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Section, Locale } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import { SECTION_TITLE_PRESETS, uid } from '@/schema/defaults'
import { LocalizedInput, Field } from './fields'
import { t } from '@/i18n'
import {
  WorkEditor, EducationEditor, ProjectEditor, SkillEditor,
  AwardEditor, PublicationEditor, MatchEditor, DomainEditor,
  WorkflowEditor, CommunityEditor, createItem, itemTitle,
} from './itemEditors'

const EDITORS: Record<string, React.FC<{ item: never; update: (p: never) => void }>> = {
  work: WorkEditor as never,
  education: EducationEditor as never,
  projects: ProjectEditor as never,
  skills: SkillEditor as never,
  awards: AwardEditor as never,
  publications: PublicationEditor as never,
  matches: MatchEditor as never,
  domains: DomainEditor as never,
  workflow: WorkflowEditor as never,
  community: CommunityEditor as never,
}

/** 由外层（EditorPanel）注入的段落级排序句柄 */
interface SortableProps {
  setNodeRef: (el: HTMLElement | null) => void
  style?: React.CSSProperties
  gripProps?: React.HTMLAttributes<HTMLElement>
}

export function SectionEditor({ section, locale, sortable }: { section: Section; locale: Locale; sortable?: SortableProps }) {
  const update = useResumeStore((s) => s.update)
  const moveSection = useResumeStore((s) => s.moveSection)
  const removeSection = useResumeStore((s) => s.removeSection)
  const toggleVisible = useResumeStore((s) => s.toggleSectionVisible)
  const moveItemTo = useResumeStore((s) => s.moveItemTo)
  const [open, setOpen] = useState(true)

  const Editor = EDITORS[section.type]
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const setSection = (fn: (d: Section) => void) =>
    update((d) => {
      const s = d.sections.find((x) => x.id === section.id)
      if (s) fn(s)
    })

  const setItem = (itemId: string, patch: Record<string, unknown>) =>
    setSection((s) => {
      s.items = s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) as never[]
    })

  const addItem = () =>
    setSection((s) => {
      s.items.push(createItem(s.type) as never)
    })

  const removeItem = (itemId: string) =>
    setSection((s) => {
      s.items = s.items.filter((it) => it.id !== itemId) as never[]
    })

  const duplicateItem = (itemId: string) =>
    setSection((s) => {
      const i = s.items.findIndex((it) => it.id === itemId)
      if (i < 0) return
      const copy = structuredClone(s.items[i]) as { id: string }
      copy.id = uid(s.type)
      s.items.splice(i + 1, 0, copy as never)
    })

  const moveItem = (itemId: string, dir: -1 | 1) =>
    setSection((s) => {
      const i = s.items.findIndex((it) => it.id === itemId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= s.items.length) return
      const tmp = s.items[i]
      s.items[i] = s.items[j]
      s.items[j] = tmp
    })

  const onItemDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = section.items.findIndex((it) => it.id === active.id)
    const to = section.items.findIndex((it) => it.id === over.id)
    if (from >= 0 && to >= 0) moveItemTo(section.id, from, to)
  }

  return (
    <div
      ref={sortable?.setNodeRef}
      style={sortable?.style}
      className="border border-chrome-border rounded mb-2 bg-chrome-panel"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-chrome-bg rounded-t">
        {sortable?.gripProps && (
          <span
            {...sortable.gripProps}
            className="cursor-grab text-chrome-muted hover:text-chrome-ink text-xs select-none"
            title={t('dragHandle', locale)}
          >
            ⠿
          </span>
        )}
        <button
          type="button"
          className="text-chrome-muted hover:text-chrome-ink text-xs w-4"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '▾' : '▸'}
        </button>
        <span className="text-xs font-mono px-1.5 py-0.5 bg-chrome-ink text-white rounded">
          {section.layout === 'main' ? t('layoutMain', locale) : t('layoutSidebar', locale)}
        </span>
        <span className="text-sm font-semibold text-chrome-ink flex-1 truncate">
          {section.title[locale] || section.title.zh || section.title.en || section.type}
        </span>
        <button
          type="button"
          title={t('toggleVisible', locale)}
          className={clsx('text-xs px-1.5', section.visible ? 'text-chrome-ink' : 'text-chrome-muted line-through')}
          onClick={() => toggleVisible(section.id)}
        >
          {section.visible ? '👁' : '⊘'}
        </button>
        <button type="button" title={t('moveUp', locale)} className="text-xs text-chrome-muted hover:text-chrome-ink px-1" onClick={() => moveSection(section.id, -1)}>▲</button>
        <button type="button" title={t('moveDown', locale)} className="text-xs text-chrome-muted hover:text-chrome-ink px-1" onClick={() => moveSection(section.id, 1)}>▼</button>
        <button type="button" title={t('deleteSection', locale)} className="text-xs text-chrome-muted hover:text-red-600 px-1" onClick={() => removeSection(section.id)}>✕</button>
      </div>

      {open && (
        <div className="p-3">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Field label={t('sectionTitle', locale)}>
              <LocalizedInput value={section.title} onChange={(v) => setSection((s) => { s.title = v })} />
            </Field>
            <Field label={t('layout', locale)}>
              <select
                className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded outline-none"
                value={section.layout}
                onChange={(e) => setSection((s) => { s.layout = e.target.value as 'main' | 'sidebar' })}
              >
                <option value="main">{t('layoutMain', locale)}</option>
                <option value="sidebar">{t('layoutSidebar', locale)}</option>
              </select>
            </Field>
          </div>

          {Editor ? (
            <>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onItemDragEnd}>
                <SortableContext items={(section.items as Array<{ id: string }>).map((it) => it.id)} strategy={verticalListSortingStrategy}>
                  {(section.items as Array<{ id: string }>).map((it, i) => (
                    <SortableItem key={it.id} id={it.id}>
                      {({ setNodeRef, style, gripProps }) => (
                        <div ref={setNodeRef} style={style} className="border border-chrome-border rounded p-2.5 bg-white mb-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-mono text-chrome-muted flex items-center gap-1.5">
                              <span {...gripProps} className="cursor-grab text-chrome-muted hover:text-chrome-ink select-none" title={t('dragHandle', locale)}>⠿</span>
                              #{i + 1} {itemTitle(it, locale, SECTION_TITLE_PRESETS[section.type]?.[locale] || section.type)}
                            </span>
                            <div className="flex gap-1 text-chrome-muted text-xs">
                              <button type="button" title={t('moveUp', locale)} onClick={() => moveItem(it.id, -1)}>▲</button>
                              <button type="button" title={t('moveDown', locale)} onClick={() => moveItem(it.id, 1)}>▼</button>
                              <button type="button" title={t('duplicateItem', locale)} onClick={() => duplicateItem(it.id)}>⧉</button>
                              <button type="button" title={t('deleteItem', locale)} className="hover:text-red-600" onClick={() => removeItem(it.id)}>✕</button>
                            </div>
                          </div>
                          <Editor item={it as never} update={(p: never) => setItem(it.id, p as never)} />
                        </div>
                      )}
                    </SortableItem>
                  ))}
                </SortableContext>
              </DndContext>
              <button
                type="button"
                className="text-xs text-chrome-ink hover:underline"
                onClick={addItem}
              >
                + {t('addItem', locale)}
              </button>
            </>
          ) : (
            <p className="text-xs text-chrome-muted">{t('noEditorForType', locale).replace('{type}', section.type)}</p>
          )}
        </div>
      )}
    </div>
  )
}

/** 条目级可排序包装：render-prop 注入 setNodeRef / style / 拖拽句柄 */
function SortableItem({
  id,
  children,
}: {
  id: string
  children: (p: { setNodeRef: (el: HTMLElement | null) => void; style: React.CSSProperties; gripProps: React.HTMLAttributes<HTMLElement> }) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <>
      {children({
        setNodeRef,
        style: {
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          transition,
          opacity: isDragging ? 0.7 : undefined,
          zIndex: isDragging ? 50 : undefined,
        },
        gripProps: { ...listeners, ...attributes } as React.HTMLAttributes<HTMLElement>,
      })}
    </>
  )
}
