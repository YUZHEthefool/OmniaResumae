/**
 * 通用模板渲染器（AI 生成模板的承载壳）
 *
 * 设计：把任意 Resume 渲染成**固定** DOM，输出规范 class 词表（serif/magazine 集
 * + 少量 brutalist 钩子，CSS 用 display 选用）。AI 生成的 CSS 以根类 .tpl-custom
 * 为作用域，覆盖这套固定结构——AI 只控视觉样式，不控结构。
 *
 * 两种使用方式：
 * - CustomBody：直接渲染（对话框预览用 rootClass="tpl-custom-preview" 隔离）
 * - makeCustomComponent(id)：工厂绑定，从 templateStore 取该 id 的 css+fonts，
 *   经 useScopedStyle 注入 <style>，作为 TemplateEntry.Component 注册进 registry。
 *
 * v1 不输出 data-edit 属性（预览内点击编辑后续再加）。
 */
import type { FC, ReactNode } from 'react'
import type {
  Resume, Locale, Section, Localized,
  WorkItem, EducationItem, ProjectItem, SkillItem,
  AwardItem, PublicationItem, MatchItem, DomainItem,
  WorkflowStep, CommunityItem,
} from '@/types/resume'
import { pick } from '@/types/resume'
import { fmtDateRange } from '@/utils/localize'
import { useTemplateStore } from '@/store/templateStore'
import { useScopedStyle } from './cssRuntime'
import { type TemplateProps } from '../registry'

const L = pick

export function CustomBody({
  resume,
  locale,
  rootClass = 'tpl-custom',
}: {
  resume: Resume
  locale: Locale
  rootClass?: string
}) {
  const visible = resume.sections.filter((s) => s.visible)
  const main = visible.filter((s) => s.layout === 'main')
  const side = visible.filter((s) => s.layout === 'sidebar')
  const keywords = (resume.meta.keywords ?? []).map((k) => L(k, locale)).filter(Boolean)
  const summary = L(resume.basics.summary, locale)
  const label = L(resume.basics.label, locale)

  return (
    <div className={rootClass}>
      <div className="page">
        <header className="head">
          {resume.basics.image && (
            <img className="avatar" src={resume.basics.image} alt="" crossOrigin="anonymous" />
          )}
          <div className="name">{L(resume.basics.name, locale, ' ')}</div>
          {label && <div className="label">{label}</div>}
          <div className="contact">
            {resume.basics.email && <span className="contact-item">{resume.basics.email}</span>}
            {resume.basics.phone && <span className="contact-item">{resume.basics.phone}</span>}
            {resume.basics.url && (
              <a className="contact-item" href={resume.basics.url}>
                {resume.basics.url.replace(/^https?:\/\//, '')}
              </a>
            )}
            {L(resume.basics.location, locale) && (
              <span className="contact-item">{L(resume.basics.location, locale)}</span>
            )}
            {(resume.basics.profiles ?? []).map((p) => (
              <a key={p.url} className="contact-item" href={p.url} target="_blank" rel="noreferrer">{p.network} · {p.username}</a>
            ))}
          </div>
          {summary && <p className="summary">{summary}</p>}
        </header>

        {keywords.length > 0 && (
          <div className="keywords">
            {keywords.map((k, i) => (
              <span key={i} className="kw">{k}</span>
            ))}
          </div>
        )}
        {summary && <div className="pride-block">{summary}</div>}

        <div className="grid">
          <div className="col-main">
            {main.map((s, i) => (
              <section className="section" data-type={s.type} key={s.id}>
                <div className="sec-num">{i + 1}</div>
                <div className="sec-title">{L(s.title, locale)}</div>
                <div className="sec-body">{renderItem(s, locale)}</div>
              </section>
            ))}
          </div>
          <div className="col-side">
            <div className="side-block" data-type="basics">
              <div className="side-title">{locale === 'zh' ? '基本信息' : 'Basics'}</div>
              {label && (
                <div className="info-line">
                  <span className="k">{locale === 'zh' ? '岗位' : 'Role'}</span>
                  {label}
                </div>
              )}
              {L(resume.basics.location, locale) && (
                <div className="info-line">
                  <span className="k">{locale === 'zh' ? '城市' : 'City'}</span>
                  {L(resume.basics.location, locale)}
                </div>
              )}
              {resume.basics.email && (
                <div className="info-line"><span className="k">Email</span>{resume.basics.email}</div>
              )}
              {resume.basics.phone && (
                <div className="info-line">
                  <span className="k">{locale === 'zh' ? '电话' : 'Tel'}</span>
                  {resume.basics.phone}
                </div>
              )}
            </div>
            {side.map((s) => (
              <div className="side-block" data-type={s.type} key={s.id}>
                <div className="side-title">{L(s.title, locale)}</div>
                <div className="sec-body">{renderItem(s, locale)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────── 各 section 类型渲染（规范 class 词表） ───────── */
function renderItem(section: Section, locale: Locale): ReactNode {
  switch (section.type) {
    case 'work':
      return (section.items as WorkItem[]).map((w) => <Entry key={w.id} item={w} locale={locale} />)
    case 'education':
      return (section.items as EducationItem[]).map((e) => <Entry key={e.id} item={e} locale={locale} edu />)
    case 'projects':
      return (section.items as ProjectItem[]).map((p) => <Project key={p.id} item={p} locale={locale} />)
    case 'skills':
      return <SkillRows items={section.items as SkillItem[]} locale={locale} />
    case 'awards':
      return (section.items as AwardItem[]).map((a) => <Award key={a.id} item={a} locale={locale} />)
    case 'publications':
      return (section.items as PublicationItem[]).map((p) => <Pub key={p.id} item={p} locale={locale} />)
    case 'matches':
      return (section.items as MatchItem[]).map((m) => <Match key={m.id} item={m} locale={locale} />)
    case 'domains':
      return (section.items as DomainItem[]).map((d) => <Domain key={d.id} item={d} locale={locale} />)
    case 'workflow':
      return (section.items as WorkflowStep[]).map((s, i) => <Wf key={s.id} item={s} index={i} locale={locale} />)
    case 'community':
      return (section.items as CommunityItem[]).map((c) => <Comm key={c.id} item={c} />)
    case 'custom':
      return <CustomItems items={section.items as Record<string, unknown>[]} locale={locale} />
    default:
      return <div className="empty">—</div>
  }
}

function Entry({ item, locale, edu }: { item: WorkItem | EducationItem; locale: Locale; edu?: boolean }) {
  const w = item as WorkItem
  const e = item as EducationItem
  const date = fmtDateRange(item.startDate, item.endDate, locale)
  const points = (item.highlights ?? []).filter((h) => L(h, locale))
  return (
    <div className="entry">
      <div className="entry-head">
        <span className="entry-title">
          {edu ? L(e.institution, locale) : L(w.position, locale)}
          {!edu && L(w.name, locale) ? <span className="entry-org"> · {L(w.name, locale)}</span> : null}
          {edu && L(e.studyType, locale) ? <span className="entry-org"> · {L(e.studyType, locale)}</span> : null}
        </span>
        {date && <span className="entry-date">{date}</span>}
      </div>
      {edu && L(e.area, locale) && <div className="entry-org">{L(e.area, locale)}</div>}
      {points.length > 0 && (
        <ul className="entry-points">
          {points.map((h, i) => <li key={i}>{L(h, locale)}</li>)}
        </ul>
      )}
    </div>
  )
}

function Project({ item, locale }: { item: ProjectItem; locale: Locale }) {
  const link = item.url || item.repoUrl
  const points = (item.highlights ?? []).filter((h) => L(h, locale))
  return (
    <div className="project" data-badge={item.badge || undefined}>
      <div className="project-head">
        <span className="project-name">{L(item.name, locale)}</span>
        {link && <a className="project-link" href={link}>{link.replace(/^https?:\/\//, '')}</a>}
      </div>
      {(item.languages ?? []).length > 0 && (
        <div className="project-meta">
          {(item.languages ?? []).join(' · ')}{item.stars !== undefined ? ` · ★ ${item.stars}` : ''}
        </div>
      )}
      {L(item.description, locale) && <p className="project-desc">{L(item.description, locale)}</p>}
      {points.length > 0 && (
        <ul className="project-points">
          {points.map((h, i) => <li key={i}>{L(h, locale)}</li>)}
        </ul>
      )}
    </div>
  )
}

function SkillRows({ items, locale }: { items: SkillItem[]; locale: Locale }) {
  if (!items.length) return <div className="empty">—</div>
  return (
    <div>
      {items.map((s) => (
        <div className="skill-row" key={s.id}>
          <span className="skill-key">{L(s.name, locale)}</span>
          <span className="skill-val">{L(s.level, locale) || (s.keywords ?? []).join(' · ')}</span>
        </div>
      ))}
    </div>
  )
}

function Award({ item, locale }: { item: AwardItem; locale: Locale }) {
  return (
    <div className="award">
      <div className="award-title">{L(item.title, locale)}</div>
      <div className="award-meta">{[L(item.awarder, locale), item.date].filter(Boolean).join(' · ')}</div>
    </div>
  )
}

function Pub({ item, locale }: { item: PublicationItem; locale: Locale }) {
  return (
    <div className="pub">
      <div className="pub-name">{L(item.name, locale)}</div>
      <div className="pub-date">{[L(item.publisher, locale), item.date].filter(Boolean).join(' · ')}</div>
    </div>
  )
}

function Match({ item, locale }: { item: MatchItem; locale: Locale }) {
  return (
    <div className="match">
      <div className="match-tag">{L(item.tag, locale)}</div>
      <div className="match-body">{L(item.body, locale)}</div>
    </div>
  )
}

function Domain({ item, locale }: { item: DomainItem; locale: Locale }) {
  return (
    <div className="domain">
      {item.icon && <span className="domain-icon">{item.icon}</span>}
      <div>
        <div className="domain-name">{L(item.name, locale)}</div>
        {L(item.sub, locale) && <div className="domain-sub">{L(item.sub, locale)}</div>}
      </div>
    </div>
  )
}

function Wf({ item, index, locale }: { item: WorkflowStep; index: number; locale: Locale }) {
  return (
    <div className="wf" data-index={index + 1}>
      <div className="wf-label">{index + 1}. {L(item.label, locale)}</div>
      <div className="wf-text">{L(item.text, locale)}</div>
    </div>
  )
}

function Comm({ item }: { item: CommunityItem }) {
  return (
    <div className="comm">
      <span className="comm-platform">{item.platform}</span>
      <span className="comm-handle">@{item.handle}</span>
    </div>
  )
}

function CustomItems({ items, locale }: { items: Record<string, unknown>[]; locale: Locale }) {
  if (!items.length) return <div className="empty">—</div>
  return (
    <>
      {items.flatMap((it, i) =>
        Object.entries(it)
          .filter(([k]) => k !== 'id')
          .map(([k, v], j) => {
            const text =
              typeof v === 'string'
                ? v
                : v && typeof v === 'object' && ('zh' in v || 'en' in v)
                  ? L(v as Localized, locale)
                  : String(v ?? '')
            return (
              <div className="custom-item" key={`${i}_${j}`}>
                <span className="custom-k">{k}</span>
                <span className="custom-v">{text}</span>
              </div>
            )
          }),
      )}
    </>
  )
}

/* ───────── 工厂：绑定某生成模板 id，作为 TemplateEntry.Component 注册 ───────── */
export function makeCustomComponent(id: string): FC<TemplateProps> {
  const Bound: FC<TemplateProps> = ({ resume, locale }) => {
    const tpl = useTemplateStore((s) => s.generated.find((g) => g.id === id))
    useScopedStyle(id, tpl?.css ?? '', tpl?.fonts ?? [])
    if (!tpl) return null
    return <CustomBody resume={resume} locale={locale} rootClass="tpl-custom" />
  }
  Bound.displayName = `CustomTemplate:${id}`
  return Bound
}
