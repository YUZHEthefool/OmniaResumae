/**
 * Serif Classic 模板 — 思源宋、蓝主色、双栏（参照 LapisCV serif）
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
import './serif-classic.css'

const L = pick

const meta: TemplateMeta = {
  id: 'serif-classic',
  name: { zh: '衬线经典', en: 'Serif Classic' },
  style: 'Serif · 思源宋 · 蓝主色双栏',
  thumbnail: '▤',
}

const SerifClassicTemplate: FC<TemplateProps> = ({ resume, locale }) => {
  const visible = resume.sections.filter((s) => s.visible)
  const main = visible.filter((s) => s.layout === 'main')
  const side = visible.filter((s) => s.layout === 'sidebar')
  const keywords = (resume.meta.keywords ?? []).map((k) => L(k, locale)).filter(Boolean)
  return (
    <div className="tpl-serif">
      <div className="page">
        <header className="head">
          {resume.basics.image && (
            <img className="avatar" src={resume.basics.image} alt="" crossOrigin="anonymous" />
          )}
          <div className="name">{L(resume.basics.name, locale, '姓名')}</div>
          {L(resume.basics.label, locale) && <div className="label">{L(resume.basics.label, locale)}</div>}
          <div className="contact">
            {resume.basics.email && <span>{resume.basics.email}</span>}
            {resume.basics.phone && <span>{resume.basics.phone}</span>}
            {resume.basics.url && <a href={resume.basics.url}>{resume.basics.url.replace(/^https?:\/\//, '')}</a>}
            {L(resume.basics.location, locale) && <span>{L(resume.basics.location, locale)}</span>}
          </div>
          {L(resume.basics.summary, locale) && <p className="summary">{L(resume.basics.summary, locale)}</p>}
        </header>

        {keywords.length > 0 && (
          <div className="keywords">
            {keywords.map((k, i) => <span key={i} className="kw">{k}</span>)}
          </div>
        )}

        <div className="grid">
          <div className="col-main">
            {main.map((s) => <SectionView key={s.id} section={s} locale={locale} />)}
          </div>
          <div className="col-side">
            {/* 基本信息（侧栏顶部） */}
            <div className="side-block">
              <div className="side-title">{locale === 'zh' ? '基本信息' : 'Basics'}</div>
              {L(resume.basics.label, locale) && <div className="info-line"><span className="k">{locale === 'zh' ? '岗位' : 'Role'}: </span>{L(resume.basics.label, locale)}</div>}
              {resume.basics.location && L(resume.basics.location, locale) && <div className="info-line"><span className="k">{locale === 'zh' ? '城市' : 'City'}: </span>{L(resume.basics.location, locale)}</div>}
              {resume.basics.email && <div className="info-line"><span className="k">Email: </span>{resume.basics.email}</div>}
              {resume.basics.phone && <div className="info-line"><span className="k">{locale === 'zh' ? '电话' : 'Tel'}: </span>{resume.basics.phone}</div>}
            </div>
            {side.map((s) => <SideSection key={s.id} section={s} locale={locale} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionView({ section, locale }: { section: Section; locale: Locale }) {
  return (
    <div className="section">
      <div className="sec-title">{L(section.title, locale)}</div>
      {renderMain(section, locale)}
    </div>
  )
}

function renderMain(section: Section, locale: Locale) {
  switch (section.type) {
    case 'work': return <>{(section.items as WorkItem[]).map((w) => <Entry key={w.id} item={w} locale={locale} />)}</>
    case 'education': return <>{(section.items as EducationItem[]).map((e) => <Entry key={e.id} item={e} locale={locale} edu />)}</>
    case 'projects': return <>{(section.items as ProjectItem[]).map((p) => <Project key={p.id} item={p} locale={locale} />)}</>
    case 'skills': return <SkillRows items={section.items as SkillItem[]} locale={locale} />
    case 'workflow': return <>{(section.items as WorkflowStep[]).map((s, i) => (
      <div className="wf" key={s.id}>
        <div className="wf-label">{i + 1}. {L(s.label, locale)}</div>
        <div className="wf-text">{L(s.text, locale)}</div>
      </div>
    ))}</>
    case 'awards': return <>{(section.items as AwardItem[]).map((a) => (
      <div className="award" key={a.id}>
        <div className="award-title">{L(a.title, locale)}</div>
        <div className="award-meta">{[L(a.awarder, locale), a.date].filter(Boolean).join(' · ')}</div>
      </div>
    ))}</>
    default: return <div className="empty">—</div>
  }
}

function Entry({ item, locale, edu }: { item: WorkItem | EducationItem; locale: Locale; edu?: boolean }) {
  const w = item as WorkItem; const e = item as EducationItem
  const date = [item.startDate, item.endDate].filter(Boolean).join(' — ')
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
      {points.length > 0 && <ul className="entry-points">{points.map((h, i) => <li key={i}>{L(h, locale)}</li>)}</ul>}
    </div>
  )
}

function Project({ item, locale }: { item: ProjectItem; locale: Locale }) {
  const link = item.url || item.repoUrl
  const points = (item.highlights ?? []).filter((h) => L(h, locale))
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
      {points.length > 0 && <ul className="project-points">{points.map((h, i) => <li key={i}>{L(h, locale)}</li>)}</ul>}
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

function SideSection({ section, locale }: { section: Section; locale: Locale }) {
  return (
    <div className="side-block">
      <div className="side-title">{L(section.title, locale)}</div>
      {renderSide(section, locale)}
    </div>
  )
}

function renderSide(section: Section, locale: Locale) {
  switch (section.type) {
    case 'matches':
      if (!(section.items as MatchItem[]).length) return <div className="empty">—</div>
      return <>{(section.items as MatchItem[]).map((m) => (
        <div className="match" key={m.id}>
          <div className="match-tag">{L(m.tag, locale)}</div>
          <div className="match-body">{L(m.body, locale)}</div>
        </div>
      ))}</>
    case 'domains':
      if (!(section.items as DomainItem[]).length) return <div className="empty">—</div>
      return <>{(section.items as DomainItem[]).map((d) => (
        <div className="domain" key={d.id}>
          <div>
            <div>{L(d.name, locale)}</div>
            {L(d.sub, locale) && <div className="domain-sub">{L(d.sub, locale)}</div>}
          </div>
        </div>
      ))}</>
    case 'publications':
      if (!(section.items as PublicationItem[]).length) return <div className="empty">—</div>
      return <>{(section.items as PublicationItem[]).map((p) => (
        <div className="pub" key={p.id}>
          <div className="pub-name">{L(p.name, locale)}</div>
          {p.date && <div className="pub-date">{p.date}</div>}
        </div>
      ))}</>
    case 'community':
      if (!(section.items as CommunityItem[]).length) return <div className="empty">—</div>
      return <>{(section.items as CommunityItem[]).map((c) => (
        <div className="comm" key={c.id}><span className="p">{c.platform} </span>@{c.handle}</div>
      ))}</>
    case 'awards':
      if (!(section.items as AwardItem[]).length) return <div className="empty">—</div>
      return <>{(section.items as AwardItem[]).map((a) => (
        <div className="award" key={a.id}>
          <div className="award-title">{L(a.title, locale)}</div>
          <div className="award-meta">{[L(a.awarder, locale), a.date].filter(Boolean).join(' · ')}</div>
        </div>
      ))}</>
    case 'skills':
      return <SkillRows items={section.items as SkillItem[]} locale={locale} />
    default:
      // work/education/projects/workflow 等被放到侧栏时，回退到主栏渲染，避免内容被吞
      return renderMain(section, locale)
  }
}

registerTemplate({ meta, Component: SerifClassicTemplate })
export default SerifClassicTemplate
