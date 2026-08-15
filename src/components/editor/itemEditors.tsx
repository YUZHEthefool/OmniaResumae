/**
 * 各 section type 的条目编辑器
 * 每个编辑器接收 (item, onChange, localeActions)。
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

type Updater<T> = (patch: Partial<T>) => void

/* ───────── Work ───────── */
export function WorkEditor({ item, update }: { item: WorkItem; update: Updater<WorkItem> }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="公司">
          <LocalizedInput value={item.name} onChange={(v) => update({ name: v })} />
        </Field>
        <Field label="职位">
          <LocalizedInput value={item.position} onChange={(v) => update({ position: v })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="开始">
          <DateInput value={item.startDate ?? ''} onChange={(v) => update({ startDate: v })} />
        </Field>
        <Field label="结束（至今留空）">
          <DateInput value={item.endDate ?? ''} onChange={(v) => update({ endDate: v })} />
        </Field>
      </div>
      <Field label="链接（可选）">
        <TextInput value={item.url ?? ''} onChange={(v) => update({ url: v })} placeholder="https://..." />
      </Field>
      <Field label="要点（逐条）">
        <LocalizedList items={item.highlights ?? []} onChange={(v) => update({ highlights: v })} multiline />
      </Field>
    </div>
  )
}

/* ───────── Education ───────── */
export function EducationEditor({ item, update }: { item: EducationItem; update: Updater<EducationItem> }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="学校">
          <LocalizedInput value={item.institution} onChange={(v) => update({ institution: v })} />
        </Field>
        <Field label="学位">
          <LocalizedInput value={item.studyType ?? {}} onChange={(v) => update({ studyType: v })} />
        </Field>
      </div>
      <Field label="专业">
        <LocalizedInput value={item.area} onChange={(v) => update({ area: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="开始">
          <DateInput value={item.startDate ?? ''} onChange={(v) => update({ startDate: v })} />
        </Field>
        <Field label="结束">
          <DateInput value={item.endDate ?? ''} onChange={(v) => update({ endDate: v })} />
        </Field>
      </div>
      <Field label="要点">
        <LocalizedList items={item.highlights ?? []} onChange={(v) => update({ highlights: v })} multiline />
      </Field>
    </div>
  )
}

/* ───────── Project ───────── */
export function ProjectEditor({ item, update }: { item: ProjectItem; update: Updater<ProjectItem> }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="项目名">
          <LocalizedInput value={item.name} onChange={(v) => update({ name: v })} />
        </Field>
        <Field label="卡片色条">
          <select
            className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded outline-none"
            value={item.badge ?? 'oss'}
            onChange={(e) => update({ badge: e.target.value as ProjectItem['badge'] })}
          >
            <option value="oss">Open Source（黄）</option>
            <option value="dev">开发中（红）</option>
            <option value="patent">专利（黑）</option>
          </select>
        </Field>
      </div>
      <Field label="归属">
        <select
          className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded outline-none"
          value={item.kind ?? 'own'}
          onChange={(e) => update({ kind: e.target.value as ProjectItem['kind'] })}
        >
          <option value="own">个人项目（我是 owner）</option>
          <option value="contrib">参与 / 贡献（他人或组织拥有）</option>
        </select>
      </Field>
      <Field label="一句话描述">
        <LocalizedInput value={item.description} onChange={(v) => update({ description: v })} multiline rows={2} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="仓库/主页 URL">
          <TextInput value={item.repoUrl ?? ''} onChange={(v) => update({ repoUrl: v })} placeholder="github.com/..." />
        </Field>
        <Field label="演示 URL">
          <TextInput value={item.url ?? ''} onChange={(v) => update({ url: v })} placeholder="https://..." />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="技术栈">
          <TagsInput value={item.keywords ?? []} onChange={(v) => update({ keywords: v })} />
        </Field>
        <Field label="Stars（数字，可空）">
          <TextInput
            type="number"
            value={item.stars !== undefined ? String(item.stars) : ''}
            onChange={(v) => update({ stars: v ? Number(v) : undefined })}
          />
        </Field>
      </div>
      <Field label="亮点（逐条）">
        <LocalizedList items={item.highlights ?? []} onChange={(v) => update({ highlights: v })} multiline />
      </Field>
    </div>
  )
}

/* ───────── Skill ───────── */
export function SkillEditor({ item, update }: { item: SkillItem; update: Updater<SkillItem> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="技能名">
        <LocalizedInput value={item.name} onChange={(v) => update({ name: v })} />
      </Field>
      <Field label="说明 / 熟练度">
        <LocalizedInput value={item.level ?? {}} onChange={(v) => update({ level: v })} multiline rows={2} />
      </Field>
      <div className="col-span-2">
        <Field label="关键词（技术栈）">
          <TagsInput value={item.keywords ?? []} onChange={(v) => update({ keywords: v })} />
        </Field>
      </div>
    </div>
  )
}

/* ───────── Award ───────── */
export function AwardEditor({ item, update }: { item: AwardItem; update: Updater<AwardItem> }) {
  return (
    <div>
      <Field label="奖项名">
        <LocalizedInput value={item.title} onChange={(v) => update({ title: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="颁发方">
          <LocalizedInput value={item.awarder ?? {}} onChange={(v) => update({ awarder: v })} />
        </Field>
        <Field label="日期">
          <DateInput value={item.date ?? ''} onChange={(v) => update({ date: v })} />
        </Field>
      </div>
    </div>
  )
}

/* ───────── Publication / Patent ───────── */
export function PublicationEditor({ item, update }: { item: PublicationItem; update: Updater<PublicationItem> }) {
  return (
    <div>
      <Field label="名称">
        <LocalizedInput value={item.name} onChange={(v) => update({ name: v })} multiline rows={2} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="日期">
          <DateInput value={item.date ?? ''} onChange={(v) => update({ date: v })} />
        </Field>
        <Field label="URL">
          <TextInput value={item.url ?? ''} onChange={(v) => update({ url: v })} />
        </Field>
      </div>
    </div>
  )
}

/* ───────── Match ───────── */
export function MatchEditor({ item, update }: { item: MatchItem; update: Updater<MatchItem> }) {
  return (
    <div>
      <Field label="要求标签">
        <LocalizedInput value={item.tag} onChange={(v) => update({ tag: v })} />
      </Field>
      <Field label="自我匹配说明">
        <LocalizedInput value={item.body} onChange={(v) => update({ body: v })} multiline rows={2} />
      </Field>
    </div>
  )
}

/* ───────── Domain ───────── */
export function DomainEditor({ item, update }: { item: DomainItem; update: Updater<DomainItem> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2">
        <Field label="领域名">
          <LocalizedInput value={item.name} onChange={(v) => update({ name: v })} />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label="副标题">
          <LocalizedInput value={item.sub} onChange={(v) => update({ sub: v })} />
        </Field>
      </div>
    </div>
  )
}

/* ───────── Workflow ───────── */
export function WorkflowEditor({ item, update }: { item: WorkflowStep; update: Updater<WorkflowStep> }) {
  return (
    <div>
      <Field label="步骤标签">
        <LocalizedInput value={item.label} onChange={(v) => update({ label: v })} />
      </Field>
      <Field label="步骤说明">
        <LocalizedInput value={item.text} onChange={(v) => update({ text: v })} multiline rows={2} />
      </Field>
    </div>
  )
}

/* ───────── Community ───────── */
export function CommunityEditor({ item, update }: { item: CommunityItem; update: Updater<CommunityItem> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Field label="平台">
        <TextInput value={item.platform} onChange={(v) => update({ platform: v })} placeholder="GitHub" />
      </Field>
      <Field label="Handle">
        <TextInput value={item.handle} onChange={(v) => update({ handle: v })} placeholder="octocat" />
      </Field>
      <Field label="URL">
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
            title="删除"
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
        + 添加
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
