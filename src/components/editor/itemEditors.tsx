/**
 * 各 section type 的条目编辑器
 * 每个编辑器接收 (item, update)；locale 取自 useUIStore 以本地化字段标签。
 * item 操作（增/删/移）由 SectionEditor 通过 helpers 提供。
 */
import type { Locale } from '@/types/resume'
import type {
  WorkItem, EducationItem, ProjectItem, SkillItem,
  AwardItem, PublicationItem, MatchItem, DomainItem,
  WorkflowStep, CommunityItem,
} from '@/types/resume'
import { Field, LocalizedInput, TextInput, DateInput, TagsInput } from './fields'
import { uid } from '@/schema/defaults'
import { t } from '@/i18n'
import { useUIStore } from '@/store/uiStore'

type Updater<T> = (patch: Partial<T>) => void

/* ───────── Work ───────── */
export function WorkEditor({ item, update }: { item: WorkItem; update: Updater<WorkItem> }) {
  const locale = useUIStore((s) => s.locale) as Locale
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fldCompany', locale)}>
          <LocalizedInput value={item.name} onChange={(v) => update({ name: v })} />
        </Field>
        <Field label={t('fldPosition', locale)}>
          <LocalizedInput value={item.position} onChange={(v) => update({ position: v })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fldStart', locale)}>
          <DateInput value={item.startDate ?? ''} onChange={(v) => update({ startDate: v })} />
        </Field>
        <Field label={t('fldEndPresent', locale)}>
          <DateInput value={item.endDate ?? ''} onChange={(v) => update({ endDate: v })} />
        </Field>
      </div>
      <Field label={t('fldLinkOptional', locale)}>
        <TextInput value={item.url ?? ''} onChange={(v) => update({ url: v })} placeholder="https://..." />
      </Field>
      <Field label={t('fldHighlights', locale)}>
        <LocalizedList items={item.highlights ?? []} onChange={(v) => update({ highlights: v })} multiline />
      </Field>
    </div>
  )
}

/* ───────── Education ───────── */
export function EducationEditor({ item, update }: { item: EducationItem; update: Updater<EducationItem> }) {
  const locale = useUIStore((s) => s.locale) as Locale
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fldSchool', locale)}>
          <LocalizedInput value={item.institution} onChange={(v) => update({ institution: v })} />
        </Field>
        <Field label={t('fldDegree', locale)}>
          <LocalizedInput value={item.studyType ?? {}} onChange={(v) => update({ studyType: v })} />
        </Field>
      </div>
      <Field label={t('fldMajor', locale)}>
        <LocalizedInput value={item.area} onChange={(v) => update({ area: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fldStart', locale)}>
          <DateInput value={item.startDate ?? ''} onChange={(v) => update({ startDate: v })} />
        </Field>
        <Field label={t('fldEndPresent', locale)}>
          <DateInput value={item.endDate ?? ''} onChange={(v) => update({ endDate: v })} />
        </Field>
      </div>
      <Field label={t('fldHighlights', locale)}>
        <LocalizedList items={item.highlights ?? []} onChange={(v) => update({ highlights: v })} multiline />
      </Field>
    </div>
  )
}

/* ───────── Project ───────── */
export function ProjectEditor({ item, update }: { item: ProjectItem; update: Updater<ProjectItem> }) {
  const locale = useUIStore((s) => s.locale) as Locale
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fldProjectName', locale)}>
          <LocalizedInput value={item.name} onChange={(v) => update({ name: v })} />
        </Field>
        <Field label={t('fldBadge', locale)}>
          <select
            className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded outline-none"
            value={item.badge ?? 'oss'}
            onChange={(e) => update({ badge: e.target.value as ProjectItem['badge'] })}
          >
            <option value="oss">{t('badgeOss', locale)}</option>
            <option value="dev">{t('badgeDev', locale)}</option>
            <option value="patent">{t('badgePatent', locale)}</option>
          </select>
        </Field>
      </div>
      <Field label={t('fldKind', locale)}>
        <select
          className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded outline-none"
          value={item.kind ?? 'own'}
          onChange={(e) => update({ kind: e.target.value as ProjectItem['kind'] })}
        >
          <option value="own">{t('kindOwn', locale)}</option>
          <option value="contrib">{t('kindContrib', locale)}</option>
        </select>
      </Field>
      <Field label={t('fldDescription', locale)}>
        <LocalizedInput value={item.description} onChange={(v) => update({ description: v })} multiline rows={2} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fldRepoUrl', locale)}>
          <TextInput value={item.repoUrl ?? ''} onChange={(v) => update({ repoUrl: v })} placeholder="github.com/..." />
        </Field>
        <Field label={t('fldDemoUrl', locale)}>
          <TextInput value={item.url ?? ''} onChange={(v) => update({ url: v })} placeholder="https://..." />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fldStack', locale)}>
          <TagsInput value={item.keywords ?? []} onChange={(v) => update({ keywords: v })} />
        </Field>
        <Field label={t('fldStars', locale)}>
          <TextInput
            type="number"
            value={item.stars !== undefined ? String(item.stars) : ''}
            onChange={(v) => update({ stars: v ? Number(v) : undefined })}
          />
        </Field>
      </div>
      <Field label={t('fldHighlights', locale)}>
        <LocalizedList items={item.highlights ?? []} onChange={(v) => update({ highlights: v })} multiline />
      </Field>
    </div>
  )
}

/* ───────── Skill ───────── */
export function SkillEditor({ item, update }: { item: SkillItem; update: Updater<SkillItem> }) {
  const locale = useUIStore((s) => s.locale) as Locale
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label={t('fldSkillName', locale)}>
        <LocalizedInput value={item.name} onChange={(v) => update({ name: v })} />
      </Field>
      <Field label={t('fldSkillLevel', locale)}>
        <LocalizedInput value={item.level ?? {}} onChange={(v) => update({ level: v })} multiline rows={2} />
      </Field>
      <div className="col-span-2">
        <Field label={t('fldKeywords', locale)}>
          <TagsInput value={item.keywords ?? []} onChange={(v) => update({ keywords: v })} />
        </Field>
      </div>
    </div>
  )
}

/* ───────── Award ───────── */
export function AwardEditor({ item, update }: { item: AwardItem; update: Updater<AwardItem> }) {
  const locale = useUIStore((s) => s.locale) as Locale
  return (
    <div>
      <Field label={t('fldAwardName', locale)}>
        <LocalizedInput value={item.title} onChange={(v) => update({ title: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fldAwarder', locale)}>
          <LocalizedInput value={item.awarder ?? {}} onChange={(v) => update({ awarder: v })} />
        </Field>
        <Field label={t('fldDate', locale)}>
          <DateInput value={item.date ?? ''} onChange={(v) => update({ date: v })} />
        </Field>
      </div>
    </div>
  )
}

/* ───────── Publication / Patent ───────── */
export function PublicationEditor({ item, update }: { item: PublicationItem; update: Updater<PublicationItem> }) {
  const locale = useUIStore((s) => s.locale) as Locale
  return (
    <div>
      <Field label={t('fldName', locale)}>
        <LocalizedInput value={item.name} onChange={(v) => update({ name: v })} multiline rows={2} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('fldDate', locale)}>
          <DateInput value={item.date ?? ''} onChange={(v) => update({ date: v })} />
        </Field>
        <Field label={t('fldUrl', locale)}>
          <TextInput value={item.url ?? ''} onChange={(v) => update({ url: v })} />
        </Field>
      </div>
    </div>
  )
}

/* ───────── Match ───────── */
export function MatchEditor({ item, update }: { item: MatchItem; update: Updater<MatchItem> }) {
  const locale = useUIStore((s) => s.locale) as Locale
  return (
    <div>
      <Field label={t('fldMatchTag', locale)}>
        <LocalizedInput value={item.tag} onChange={(v) => update({ tag: v })} />
      </Field>
      <Field label={t('fldMatchBody', locale)}>
        <LocalizedInput value={item.body} onChange={(v) => update({ body: v })} multiline rows={2} />
      </Field>
    </div>
  )
}

/* ───────── Domain ───────── */
export function DomainEditor({ item, update }: { item: DomainItem; update: Updater<DomainItem> }) {
  const locale = useUIStore((s) => s.locale) as Locale
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2">
        <Field label={locale === 'zh' ? '图标' : 'Icon'}>
          <TextInput value={item.icon} onChange={(v) => update({ icon: v })} placeholder="🌱" />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label={t('fldDomainName', locale)}>
          <LocalizedInput value={item.name} onChange={(v) => update({ name: v })} />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label={t('fldDomainSub', locale)}>
          <LocalizedInput value={item.sub} onChange={(v) => update({ sub: v })} />
        </Field>
      </div>
    </div>
  )
}

/* ───────── Workflow ───────── */
export function WorkflowEditor({ item, update }: { item: WorkflowStep; update: Updater<WorkflowStep> }) {
  const locale = useUIStore((s) => s.locale) as Locale
  return (
    <div>
      <Field label={t('fldStepLabel', locale)}>
        <LocalizedInput value={item.label} onChange={(v) => update({ label: v })} />
      </Field>
      <Field label={t('fldStepText', locale)}>
        <LocalizedInput value={item.text} onChange={(v) => update({ text: v })} multiline rows={2} />
      </Field>
    </div>
  )
}

/* ───────── Community ───────── */
export function CommunityEditor({ item, update }: { item: CommunityItem; update: Updater<CommunityItem> }) {
  const locale = useUIStore((s) => s.locale) as Locale
  return (
    <div className="grid grid-cols-3 gap-2">
      <Field label={t('fldPlatform', locale)}>
        <TextInput value={item.platform} onChange={(v) => update({ platform: v })} placeholder="GitHub" />
      </Field>
      <Field label={t('fldHandle', locale)}>
        <TextInput value={item.handle} onChange={(v) => update({ handle: v })} placeholder="octocat" />
      </Field>
      <Field label={t('fldUrl', locale)}>
        <TextInput value={item.url} onChange={(v) => update({ url: v })} placeholder="https://..." />
      </Field>
    </div>
  )
}

/* ───────── 通用 Localized 列表编辑（highlights 等） ───────── */
export function LocalizedList({
  items, onChange, multiline,
}: {
  items: { zh?: string; en?: string }[]
  onChange: (v: { zh?: string; en?: string }[]) => void
  multiline?: boolean
}) {
  const locale = useUIStore((s) => s.locale) as Locale
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="flex gap-1.5 items-start mb-1.5">
          <div className="flex-1">
            <LocalizedInput
              value={it}
              onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))}
              multiline={multiline}
              rows={multiline ? 2 : undefined}
            />
          </div>
          <button
            type="button"
            className="mt-5 w-6 h-6 text-[11px] text-chrome-muted hover:text-red-600 rounded hover:bg-chrome-bg"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            title={t('deleteItem', locale)}
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
        + {t('add', locale)}
      </button>
    </div>
  )
}

/* ───────── 新建条目工厂 ───────── */
export function createItem(type: string): unknown {
  switch (type) {
    case 'work':
      return { id: uid('work'), name: {}, position: {}, highlights: [] } as WorkItem
    case 'education':
      return { id: uid('edu'), institution: {}, area: {} } as EducationItem
    case 'projects':
      return { id: uid('proj'), name: {}, description: {}, highlights: [], badge: 'oss' } as ProjectItem
    case 'skills':
      return { id: uid('skill'), name: {} } as SkillItem
    case 'awards':
      return { id: uid('award'), title: {} } as AwardItem
    case 'publications':
      return { id: uid('pub'), name: {} } as PublicationItem
    case 'matches':
      return { id: uid('match'), tag: {}, body: {} } as MatchItem
    case 'domains':
      return { id: uid('domain'), icon: '', name: {}, sub: {} } as DomainItem
    case 'workflow':
      return { id: uid('wf'), label: {}, text: {} } as WorkflowStep
    case 'community':
      return { id: uid('comm'), platform: '', handle: '', url: '' } as CommunityItem
    default:
      return { id: uid('item') }
  }
}

export function itemTitle(item: unknown, locale: Locale, fallback: string): string {
  const it = item as Record<string, unknown>
  // 注意：绝不可返回 item.id（如 work_1_xqdy7g），那只是内部主键
  const cand = it.name ?? it.title ?? it.institution ?? it.tag ?? it.label ?? it.platform
  // 防御：若取到的是 uid 格式字符串（prefix_num_xxxx），视为脏数据，用 fallback
  const isUid = (v: string) => /^[a-z]+_[0-9a-z]+_[a-z0-9]{4,}$/.test(v)
  if (cand && typeof cand === 'object') {
    const o = cand as { zh?: string; en?: string }
    const loc = o[locale]
    const other = locale === 'zh' ? o.en : o.zh
    if (loc && loc.trim() && !isUid(loc)) return loc
    if (other && other.trim() && !isUid(other)) return other
  } else if (typeof cand === 'string' && cand.trim() && !isUid(cand)) {
    return cand
  }
  return fallback
}
