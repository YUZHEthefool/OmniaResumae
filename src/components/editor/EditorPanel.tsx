/**
 * EditorPanel：左侧表单
 * 顶部 Basics + Meta，下面按 section 列出 SectionEditor，末尾"添加段落"。
 */
import { useState } from 'react'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Resume, SectionType, Section, Locale } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import { useUIStore } from '@/store/uiStore'
import { t } from '@/i18n'
import { Field, LocalizedInput, TextInput, ImageUpload } from './fields'
import { SectionEditor } from './SectionEditor'

const ADDABLE: { type: SectionType; label: string }[] = [
  { type: 'skills', label: '技能' },
  { type: 'projects', label: '项目' },
  { type: 'work', label: '工作经历' },
  { type: 'education', label: '教育' },
  { type: 'workflow', label: '工作流' },
  { type: 'matches', label: '要求匹配' },
  { type: 'domains', label: '领域' },
  { type: 'awards', label: '奖项' },
  { type: 'publications', label: '专利/出版物' },
  { type: 'community', label: '社区' },
]

export function EditorPanel() {
  const resume = useResumeStore((s) => s.current) as Resume | null
  const update = useResumeStore((s) => s.update)
  const addSection = useResumeStore((s) => s.addSection)
  const moveSectionTo = useResumeStore((s) => s.moveSectionTo)
  const locale = useUIStore((s) => s.locale)
  const [showAdd, setShowAdd] = useState(false)
  // KeyboardSensor 让 ⠿ 句柄可键盘操作（Enter/Space 起，方向键移，Enter 落，Esc 取），补 a11y
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  if (!resume) {
    return <div className="p-4 text-sm text-chrome-muted">加载中…</div>
  }

  const onSectionDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = resume.sections.findIndex((s) => s.id === active.id)
    const to = resume.sections.findIndex((s) => s.id === over.id)
    if (from >= 0 && to >= 0) moveSectionTo(from, to)
  }

  const setBasics = (patch: Partial<Resume['basics']>) =>
    update((d) => { d.basics = { ...d.basics, ...patch } })
  const setMeta = (patch: Partial<Resume['meta']>) =>
    update((d) => { d.meta = { ...d.meta, ...patch } })

  return (
    <div className="h-full overflow-y-auto p-3 bg-chrome-bg">
      {/* 简历档名 */}
      <Field label="简历名称">
        <TextInput
          value={resume.name}
          onChange={(v) => update((d) => { d.name = v })}
          placeholder="我的简历"
        />
      </Field>

      {/* ─── Basics ─── */}
      <Block title={t('basics', locale)}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('basicsName', locale)}>
            <LocalizedInput value={resume.basics.name} onChange={(v) => setBasics({ name: v })} />
          </Field>
          <Field label={t('basicsNameRomanized', locale)}>
            <TextInput value={resume.basics.nameRomanized ?? ''} onChange={(v) => setBasics({ nameRomanized: v })} placeholder="XING MING" />
          </Field>
        </div>
        <Field label={t('basicsLabel', locale)}>
          <LocalizedInput value={resume.basics.label ?? {}} onChange={(v) => setBasics({ label: v })} />
        </Field>
        <Field label={t('basicsSummary', locale)}>
          <LocalizedInput value={resume.basics.summary ?? {}} onChange={(v) => setBasics({ summary: v })} multiline rows={2} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('basicsEmail', locale)}>
            <TextInput value={resume.basics.email ?? ''} onChange={(v) => setBasics({ email: v })} placeholder="you@mail.com" />
          </Field>
          <Field label={t('basicsPhone', locale)}>
            <TextInput value={resume.basics.phone ?? ''} onChange={(v) => setBasics({ phone: v })} placeholder="(123)456-7890" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('basicsUrl', locale)}>
            <TextInput value={resume.basics.url ?? ''} onChange={(v) => setBasics({ url: v })} placeholder="https://..." />
          </Field>
          <Field label={t('basicsLocation', locale)}>
            <LocalizedInput value={resume.basics.location ?? {}} onChange={(v) => setBasics({ location: v })} />
          </Field>
        </div>
        <Field label={t('basicsImage', locale)}>
          <ImageUpload value={resume.basics.image} onChange={(v) => setBasics({ image: v })} />
        </Field>
      </Block>

      {/* ─── Meta ─── */}
      <Block title={locale === 'zh' ? '岗位 / 关键词' : 'Target / Keywords'}>
        <Field label={t('metaTargetRole', locale)}>
          <LocalizedInput value={resume.meta.targetRole ?? {}} onChange={(v) => setMeta({ targetRole: v })} />
        </Field>
        <Field label={t('metaKeywords', locale)}>
          <LocalizedKeywords
            items={resume.meta.keywords ?? []}
            onChange={(v) => setMeta({ keywords: v })}
          />
        </Field>
      </Block>

      {/* ─── Sections（可拖拽排序） ─── */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDragEnd}>
        <SortableContext items={resume.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {resume.sections.map((s) => (
            <SortableSection key={s.id} section={s} locale={locale} />
          ))}
        </SortableContext>
      </DndContext>

      {/* 添加段落 */}
      <div className="mt-2">
        {!showAdd ? (
          <button
            type="button"
            className="w-full py-2 text-sm border border-dashed border-chrome-border rounded text-chrome-muted hover:text-chrome-ink hover:border-chrome-ink"
            onClick={() => setShowAdd(true)}
          >
            + {t('addSection', locale)}
          </button>
        ) : (
          <div className="border border-chrome-border rounded p-2 bg-white">
            <div className="flex flex-wrap gap-1.5">
              {ADDABLE.map((a) => (
                <button
                  key={a.type}
                  type="button"
                  className="px-2 py-1 text-xs border border-chrome-border rounded hover:bg-chrome-ink hover:text-white"
                  onClick={() => {
                    addSection(a.type, ['work', 'education', 'skills', 'projects', 'workflow'].includes(a.type) ? 'main' : 'sidebar')
                    setShowAdd(false)
                  }}
                >
                  + {a.label}
                </button>
              ))}
            </div>
            <button type="button" className="mt-2 text-xs text-chrome-muted" onClick={() => setShowAdd(false)}>
              收起
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** 段落级可排序包装：注入 setNodeRef / style / 拖拽句柄给 SectionEditor */
function SortableSection({ section, locale }: { section: Section; locale: Locale }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  return (
    <SectionEditor
      section={section}
      locale={locale}
      sortable={{
        setNodeRef,
        style: {
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          transition,
          opacity: isDragging ? 0.7 : undefined,
          zIndex: isDragging ? 50 : undefined,
        },
        gripProps: { ...listeners, ...attributes } as React.HTMLAttributes<HTMLElement>,
      }}
    />
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border border-chrome-border rounded mb-2 bg-chrome-panel">
      <button
        type="button"
        className="w-full flex items-center px-3 py-2 bg-chrome-bg rounded-t text-sm font-semibold text-chrome-ink"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mr-2 text-chrome-muted text-xs">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  )
}

function LocalizedKeywords({
  items, onChange,
}: {
  items: { zh?: string; en?: string }[]
  onChange: (v: { zh?: string; en?: string }[]) => void
}) {
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="flex gap-1.5 mb-1.5">
          <div className="flex-1">
            <LocalizedInput value={it} onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} />
          </div>
          <button
            type="button"
            className="mt-5 w-6 h-6 text-[11px] text-chrome-muted hover:text-red-600 rounded hover:bg-chrome-bg"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-xs text-chrome-ink hover:underline"
        onClick={() => onChange([...items, { zh: '', en: '' }])}
      >
        + 关键词
      </button>
    </div>
  )
}
