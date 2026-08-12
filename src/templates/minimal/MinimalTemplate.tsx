/**
 * Minimal / Swiss 模板
 * 单栏、Inter、留白、细线、单色。消费同一 schema。
 */
import type { FC } from 'react'
import type {
  Locale, Section,
  WorkItem, EducationItem, ProjectItem, SkillItem,
  AwardItem, PublicationItem, MatchItem, DomainItem,
  WorkflowStep, CommunityItem,
} from '@/types/resume'
import { pick } from '@/types/resume'
import { registerTemplate, type TemplateProps, type TemplateMeta } from '../registry'
import './minimal.css'

const L = pick

const meta: TemplateMeta = {
  id: 'minimal',
  name: { zh: '极简 / Swiss', en: 'Minimal / Swiss' },
  style: 'Minimal · Inter · 单栏细线',
  thumbnail: '▭',
}

const MinimalTemplate: FC<TemplateProps> = ({ resume, locale }) => {
  const visible = resume.sections.filter((s) => s.visible)
  const keywords = (resume.meta.keywords ?? []).map((k) => L(k, locale)).filter(Boolean)
  return (
    <div className="tpl-minimal">
      <div className="page">
        {/* HEADER */}
        <header className="head">
          <div className="head-left">
            <div className="name">{L(resume.basics.name, locale, '姓名')}</div>
            {L(resume.basics.label, locale) && <div className="label">{L(resume.basics.label, locale)}</div>}
            {L(resume.basics.summary, locale) && <p className="summary">{L(resume.basics.summary, locale)}</p>}
          </div>
          <div className="head-right">
            {resume.basics.image && (
              <img className="avatar" src={resume.basics.image} alt="" crossOrigin="anonymous" />
            )}
            {resume.basics.email && <div>{resume.basics.email}</div>}
            {resume.basics.phone && <div>{resume.basics.phone}</div>}
            {resume.basics.url && <a href={resume.basics.url}>{resume.basics.url.replace(/^https?:\/\//, '')}</a>}
            {L(resume.basics.location, locale) && <div>{L(resume.basics.location, locale)}</div>}
          </div>
        </header>

        {keywords.length > 0 && (
          <div className="keywords">
            {keywords.map((k, i) => <span key={i} className="kw">{k}</span>)}
          </div>
        )}

        {/* SECTIONS */}
        {visible.map((s) => (
          <SectionView key={s.id} section={s} locale={locale} />
        ))}
      </div>
    </div>
  )
}

function SectionView({ section, locale }: { section: Section; locale: Locale }) {
  return (
    <div className="section">
      <div className="sec-title">{L(section.title, locale)}</div>
      {renderBody(section, locale)}
    </div>
  )
}

function renderBody(section: Section, locale: Locale) {
  switch (section.type) {
    case 'work':
      return <>{(section.items as WorkItem[]).map((w) => <EntryView key={w.id} item={w} locale={locale} />)}</>
    case 'education':
      return <>{(section.items as EducationItem[]).map((e) => <EntryView key={e.id} item={e} locale={locale} edu />)}</>
    case 'projects':
      return <>{(section.items as ProjectItem[]).map((p) => <ProjectView key={p.id} item={p} locale={locale} />)}</>
    case 'skills':
      return <SkillGrid items={section.items as SkillItem[]} locale={locale} />
    case 'workflow':
      return <WorkflowView steps={section.items as WorkflowStep[]} locale={locale} />
    case 'matches':
      return <PairList items={section.items as MatchItem[]} locale={locale} />
    case 'domains':
      return <DomainList items={section.items as DomainItem[]} locale={locale} />
    case 'publications':
      return <PubList items={section.items as PublicationItem[]} locale={locale} />
    case 'community':
      return <CommList items={section.items as CommunityItem[]} />
    case 'awards':
      return <AwardList items={section.items as AwardItem[]} locale={locale} />
    default:
      return <div className="empty">—</div>
  }
}

function EntryView({ item, locale, edu }: { item: WorkItem | EducationItem; locale: Locale; edu?: boolean }) {
  const w = item as WorkItem
  const e = item as EducationItem
  const date = [item.startDate, item.endDate].filter(Boolean).join(' — ')
  const points = (item.highlights ?? []).filter((h) => L(h, locale))
  return (
    <div className="entry">
      <div className="entry-head">
        <div>
          <span className="entry-title">
            {edu ? L(e.institution, locale) : L(w.position, locale)}
          </span>
          {!edu && L(w.name, locale) && <span className="entry-org"> · {L(w.name, locale)}</span>}
          {edu && L(e.studyType, locale) && <span className="entry-org"> · {L(e.studyType, locale)}</span>}
        </div>
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

function ProjectView({ item, locale }: { item: ProjectItem; locale: Locale }) {
  const link = item.url || item.repoUrl
  const points = item.highlights.filter((h) => L(h, locale))
  return (
    <div className="project">
      <div className="project-head">
        <span className="project-name">{L(item.name, locale)}</span>
        {link && <a className="project-link" href={link}>{link.replace(/^https?:\/\//, '')}</a>}
      </div>
      {(item.languages ?? []).length > 0 && (
        <div className="project-meta">{(item.languages ?? []).join(' · ')}{item.stars !== undefined ? ` · ★ ${item.stars}` : ''}</div>
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

function SkillGrid({ items, locale }: { items: SkillItem[]; locale: Locale }) {
  if (!items.length) return <div className="empty">—</div>
  return (
    <div className="skill-grid">
      {items.map((s) => (
        <div key={s.id} className="contents">
          <div className="skill-key">{L(s.name, locale)}</div>
          <div className="skill-val">{L(s.level, locale) || (s.keywords ?? []).join(' · ')}</div>
        </div>
      ))}
    </div>
  )
}

function WorkflowView({ steps, locale }: { steps: WorkflowStep[]; locale: Locale }) {
  if (!steps.length) return <div className="empty">—</div>
  return (
    <div className="wf">
      {steps.map((s, i) => (
        <div className="wf-item" key={s.id}>
          <div className="wf-label">{i + 1}. {L(s.label, locale)}</div>
          <div className="wf-text">{L(s.text, locale)}</div>
        </div>
      ))}
    </div>
  )
}

function PairList({ items, locale }: { items: MatchItem[]; locale: Locale }) {
  if (!items.length) return <div className="empty">—</div>
  return (
    <div className="pair-list">
      {items.map((m) => (
        <div className="pair" key={m.id}>
          <div className="pair-tag">{L(m.tag, locale)}</div>
          <div className="pair-body">{L(m.body, locale)}</div>
        </div>
      ))}
    </div>
  )
}

function DomainList({ items, locale }: { items: DomainItem[]; locale: Locale }) {
  if (!items.length) return <div className="empty">—</div>
  return (
    <div>
      {items.map((d) => (
        <div className="domain-row" key={d.id}>
          <span className="domain-icon">{d.icon}</span>
          <span>{L(d.name, locale)}</span>
          {L(d.sub, locale) && <span className="domain-sub">· {L(d.sub, locale)}</span>}
        </div>
      ))}
    </div>
  )
}

function PubList({ items, locale }: { items: PublicationItem[]; locale: Locale }) {
  if (!items.length) return <div className="empty">—</div>
  return (
    <div>
      {items.map((p) => (
        <div className="pub-row" key={p.id}>
          <div className="pub-name">{L(p.name, locale)}</div>
          {p.date && <div className="pub-date">{p.date}</div>}
        </div>
      ))}
    </div>
  )
}

function CommList({ items }: { items: CommunityItem[] }) {
  if (!items.length) return <div className="empty">—</div>
  return (
    <div>
      {items.map((c) => (
        <div className="comm-row" key={c.id}>
          <span className="comm-platform">{c.platform}</span>
          <span>@{c.handle}</span>
        </div>
      ))}
    </div>
  )
}

function AwardList({ items, locale }: { items: AwardItem[]; locale: Locale }) {
  if (!items.length) return <div className="empty">—</div>
  return (
    <div>
      {items.map((a) => (
        <div className="award-row" key={a.id}>
          <div className="award-title">{L(a.title, locale)}</div>
          <div className="award-meta">{[L(a.awarder, locale), a.date].filter(Boolean).join(' · ')}</div>
        </div>
      ))}
    </div>
  )
}

registerTemplate({ meta, Component: MinimalTemplate })
export default MinimalTemplate
