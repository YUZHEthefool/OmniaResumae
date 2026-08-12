/**
 * Brutalist 模板 — 移植自 resume-template.html
 * 数据驱动：遍历 resume.sections，按 layout(type) 渲染对应块。
 * 同一 schema 可切换其它模板。
 */
import type { FC } from 'react'
import type {
  Resume, Locale, Section,
  SkillItem, ProjectItem, WorkflowStep,
  WorkItem, EducationItem, AwardItem, PublicationItem,
  MatchItem, DomainItem, CommunityItem,
} from '@/types/resume'
import { pick } from '@/types/resume'
import { registerTemplate, type TemplateProps, type TemplateMeta } from '../registry'
import './brutalist.css'

const L = pick

const meta: TemplateMeta = {
  id: 'brutalist',
  name: { zh: '粗野主义', en: 'Brutalist' },
  style: 'Brutalism · 黑黄红 · 粗描边',
  thumbnail: '▮',
}

const BrutalistTemplate: FC<TemplateProps> = ({ resume, locale }) => {
  const visible = resume.sections.filter((s) => s.visible)
  const mainSections = visible.filter((s) => s.layout === 'main')
  const sideSections = visible.filter((s) => s.layout === 'sidebar')

  const targetRole = L(resume.meta.targetRole, locale) || L(resume.basics.label, locale)
  const eduFirst = firstItem<EducationItem>(resume, 'education')

  const keywords = (resume.meta.keywords ?? []).map((k) => L(k, locale)).filter(Boolean)

  return (
    <div className="tpl-brutalist">
      <div className="page">
        {/* ═══ HEADER ═══ */}
        <header className="header">
          <div className="header-left">
            <span className="chip">{locale === 'zh' ? '简历 / Resume' : 'Resume'}</span>
            {resume.basics.image && (
              <img className="avatar" src={resume.basics.image} alt="" crossOrigin="anonymous" />
            )}
            <span className="name">{L(resume.basics.name, locale, '姓名')}</span>
            {resume.basics.nameRomanized && (
              <span className="name-sub">{resume.basics.nameRomanized}</span>
            )}
            {L(resume.basics.summary, locale) && (
              <div className="pride-block">
                <span className="pride-label">{locale === 'zh' ? '引以为傲' : 'PRIDE'}</span>
                <span className="pride-text">{L(resume.basics.summary, locale)}</span>
              </div>
            )}
          </div>
          <div className="header-right">
            {targetRole && (
              <MetaGroup label={locale === 'zh' ? '申请岗位' : 'Target Role'} value={targetRole} red />
            )}
            {eduFirst && (
              <MetaGroup
                label={locale === 'zh' ? '学历 / 专业' : 'Education'}
                value={`${L(eduFirst.studyType, locale) || L(eduFirst.area, locale)} · ${L(eduFirst.institution, locale)}`.replace(/^\s·\s|·\s$/, '')}
              />
            )}
            {resume.basics.email && (
              <MetaGroup label="Email" value={resume.basics.email} />
            )}
            {resume.basics.phone && (
              <MetaGroup label={locale === 'zh' ? '电话' : 'Phone'} value={resume.basics.phone} />
            )}
            {(resume.basics.url || (L(resume.basics.location, locale))) && (
              <MetaGroup
                label={locale === 'zh' ? '网站 / 所在地' : 'Web / Location'}
                value={[resume.basics.url?.replace(/^https?:\/\//, ''), L(resume.basics.location, locale)].filter(Boolean).join(' · ')}
              />
            )}
          </div>
        </header>

        {/* ─── divider bar ─── */}
        {keywords.length > 0 && (
          <div className="divider-bar">
            {keywords.flatMap((k, i) => [
              <span key={`k${i}`}>{k}</span>,
              i < keywords.length - 1 ? (
                <span key={`s${i}`} className="divider-sep">·</span>
              ) : null,
            ])}
          </div>
        )}

        {/* ═══ BODY ═══ */}
        <div className="body-grid">
          <div className="col-main">
            {mainSections.map((s, i) => (
              <MainSection key={s.id} section={s} locale={locale} index={i + 1} />
            ))}
          </div>
          <aside>
            {sideSections.map((s) => (
              <SidebarSection key={s.id} section={s} locale={locale} />
            ))}
          </aside>
        </div>

        {/* ═══ FOOTER ═══ */}
        <footer className="footer">
          <span className="footer-l">
            {[L(resume.basics.name, locale), L(eduFirst?.area, locale), targetRole]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="footer-r">{resume.basics.nameRomanized || L(resume.basics.name, locale, '')}</span>
        </footer>
      </div>
    </div>
  )
}

/* ───────── 子组件 ───────── */

function MetaGroup({ label, value, red }: { label: string; value: string; red?: boolean }) {
  if (!value?.trim()) return null
  return (
    <div className="meta-group">
      <span className="meta-label">{label}</span>
      <span className={`meta-value${red ? ' red' : ''}`}>{value}</span>
    </div>
  )
}

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function MainSection({ section, locale, index }: { section: Section; locale: Locale; index: number }) {
  return (
    <div className="section">
      <div className="sec-head">
        <span className="sec-num">{pad2(index)}</span>
        <span className="sec-title">{L(section.title, locale)}</span>
      </div>
      {renderMainBody(section, locale)}
    </div>
  )
}

function renderMainBody(section: Section, locale: Locale) {
  switch (section.type) {
    case 'skills':
      return <SkillTable items={section.items as SkillItem[]} locale={locale} />
    case 'projects': {
      const projs = section.items as ProjectItem[]
      const own = projs.filter((p) => p.kind !== 'contrib')
      const contrib = projs.filter((p) => p.kind === 'contrib')
      return (
        <>
          {own.length > 0 && (
            <div className="proj-group">
              <div className="proj-group-head">{locale === 'zh' ? '个人项目' : 'Personal Projects'}</div>
              {own.map((p) => <ProjectCard key={p.id} item={p} locale={locale} />)}
            </div>
          )}
          {contrib.length > 0 && (
            <div className="proj-group">
              <div className="proj-group-head">{locale === 'zh' ? '参与 / 贡献项目' : 'Contributed Projects'}</div>
              {contrib.map((p) => <ProjectCard key={p.id} item={p} locale={locale} />)}
            </div>
          )}
        </>
      )
    }
    case 'workflow':
      return <Workflow steps={section.items as WorkflowStep[]} locale={locale} />
    case 'work':
      return (
        <>
          {(section.items as WorkItem[]).map((w) => (
            <Entry key={w.id} item={w} locale={locale} />
          ))}
        </>
      )
    case 'education':
      return (
        <>
          {(section.items as EducationItem[]).map((e) => (
            <Entry key={e.id} item={e} locale={locale} edu />
          ))}
        </>
      )
    case 'awards':
      return (
        <>
          {(section.items as AwardItem[]).map((a) => (
            <AwardRow key={a.id} item={a} locale={locale} />
          ))}
        </>
      )
    default:
      // 其它 type 在主栏用通用列表兜底
      return <FallbackList section={section} locale={locale} />
  }
}

function SkillTable({ items, locale }: { items: SkillItem[]; locale: Locale }) {
  if (items.length === 0) return <Empty />
  return (
    <div className="skill-table">
      {items.map((s) => (
        <div className="skill-row" key={s.id}>
          <span className="skill-key">{L(s.name, locale)}</span>
          <span className="skill-val" data-edit={`level::${s.id}`}>{L(s.level, locale) || (s.keywords ?? []).join(' · ')}</span>
        </div>
      ))}
    </div>
  )
}

function ProjectCard({ item, locale }: { item: ProjectItem; locale: Locale }) {
  const badge = item.badge || 'oss'
  const badgeClass = badge === 'dev' ? 'dev' : badge === 'patent' || badge === 'pat' ? 'pat' : 'oss'
  const badgeLabel =
    badge === 'dev' ? (locale === 'zh' ? '开发中' : 'WIP')
    : badge === 'patent' || badge === 'pat' ? (locale === 'zh' ? '专利' : 'Patent')
    : 'Open Source'
  const link = item.url || item.repoUrl
  const highlights = item.highlights.filter((h) => L(h, locale))
  return (
    <div className={`project-card ${badgeClass}`}>
      <div className="project-inner">
        <div className="project-head">
          <span className="project-name">{L(item.name, locale)}</span>
          <span className={`badge ${badgeClass}`}>{badgeLabel}</span>
        </div>
        {(item.stars !== undefined || (item.languages ?? []).length > 0) && (
          <div className="project-meta">
            {[
              (item.languages ?? []).join('/'),
              item.stars !== undefined ? `★ ${item.stars}` : '',
            ].filter(Boolean).join('  ·  ')}
          </div>
        )}
        {L(item.description, locale) && (
          <p className="project-desc" data-edit={`description::${item.id}`}>{L(item.description, locale)}</p>
        )}
        {highlights.length > 0 && (
          <ul className="project-points">
            {highlights.map((h, i) => (
              <li key={i} data-edit={`highlights::${item.id}::${i}`}>{L(h, locale)}</li>
            ))}
          </ul>
        )}
        {link && (
          <a className="project-link" href={link} target="_blank" rel="noreferrer">
            {link.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>
    </div>
  )
}

function Workflow({ steps, locale }: { steps: WorkflowStep[]; locale: Locale }) {
  if (steps.length === 0) return <Empty />
  return (
    <div className="workflow">
      {steps.map((s, i) => (
        <div className="wf-step" key={s.id}>
          <span className="wf-num">{i + 1}</span>
          <div className="wf-body">
            <span className="wf-label">{L(s.label, locale)}</span>
            <span className="wf-text">{L(s.text, locale)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Entry({ item, locale, edu }: { item: WorkItem | EducationItem; locale: Locale; edu?: boolean }) {
  const name = edu
    ? L((item as EducationItem).institution, locale)
    : `${L((item as WorkItem).position, locale)} · ${L((item as WorkItem).name, locale)}`
  const date = [item.startDate, item.endDate].filter(Boolean).join(' - ')
  const highlights = (item.highlights ?? []).filter((h) => L(h, locale))
  return (
    <div className="entry">
      <div className="entry-title">
        <span className="entry-name">{name.replace(/^ · | · $/g, '')}</span>
        {date && <span className="entry-date">{date}</span>}
      </div>
      {edu && (item as EducationItem).area && L((item as EducationItem).area, locale) && (
        <p className="entry-summary">{L((item as EducationItem).area, locale)}</p>
      )}
      {highlights.length > 0 && (
        <ul className="entry-points">
          {highlights.map((h, i) => (
            <li key={i} data-edit={`highlights::${item.id}::${i}`}>{L(h, locale)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AwardRow({ item, locale }: { item: AwardItem; locale: Locale }) {
  return (
    <div className="award-row">
      <div className="award-title">{L(item.title, locale)}</div>
      <div className="award-meta">
        {[L(item.awarder, locale), item.date].filter(Boolean).join(' · ')}
      </div>
    </div>
  )
}

function SidebarSection({ section, locale }: { section: Section; locale: Locale }) {
  return (
    <div className="sidebar-section">
      <div className="sb-title">{L(section.title, locale)}</div>
      {renderSidebarBody(section, locale)}
    </div>
  )
}

function renderSidebarBody(section: Section, locale: Locale) {
  switch (section.type) {
    case 'matches':
      return <MatchList items={section.items as MatchItem[]} locale={locale} />
    case 'domains':
      return <DomainTags items={section.items as DomainItem[]} locale={locale} />
    case 'publications':
      return (
        <>
          {(section.items as PublicationItem[]).map((p) => (
            <div className="patent-card" key={p.id}>
              <span className="patent-card-label">Patent / Pub</span>
              <p className="patent-card-title">{L(p.name, locale)}</p>
              {p.date && <span className="patent-status">{p.date}</span>}
            </div>
          ))}
        </>
      )
    case 'community':
      return (
        <>
          {(section.items as CommunityItem[]).map((c) => (
            <a className="community-row" key={c.id} href={c.url} target="_blank" rel="noreferrer">
              <span className="community-platform">{c.platform}</span>
              <span className="community-handle">@{c.handle}</span>
              {c.url && <span className="community-url">{c.url.replace(/^https?:\/\//, '')}</span>}
            </a>
          ))}
        </>
      )
    case 'awards':
      return (
        <>
          {(section.items as AwardItem[]).map((a) => (
            <AwardRow key={a.id} item={a} locale={locale} />
          ))}
        </>
      )
    case 'skills':
      return <SkillTable items={section.items as SkillItem[]} locale={locale} />
    default:
      return <FallbackList section={section} locale={locale} />
  }
}

function MatchList({ items, locale }: { items: MatchItem[]; locale: Locale }) {
  if (items.length === 0) return <Empty />
  return (
    <div className="match-list">
      {items.map((m) => (
        <div className="match-item" key={m.id}>
          <div className="match-head">{L(m.tag, locale)}</div>
          <div className="match-body">{L(m.body, locale)}</div>
        </div>
      ))}
    </div>
  )
}

function DomainTags({ items, locale }: { items: DomainItem[]; locale: Locale }) {
  if (items.length === 0) return <Empty />
  return (
    <div className="domain-tags">
      {items.map((d) => (
        <div className="domain-tag" key={d.id}>
          {d.icon && <span className="domain-tag-icon">{d.icon}</span>}
          <div>
            <div className="domain-tag-text">{L(d.name, locale)}</div>
            {L(d.sub, locale) && <div className="domain-tag-sub">{L(d.sub, locale)}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function FallbackList({ section, locale }: { section: Section; locale: Locale }) {
  const items = section.items as Array<Record<string, unknown>>
  if (!items || items.length === 0) return <Empty />
  return (
    <div className="match-list">
      {items.map((it, i) => (
        <div className="match-item" key={i}>
          <div className="match-body">
            {Object.values(it)
              .map((v) => (v && typeof v === 'object' ? L(v as never, locale) : String(v ?? '')))
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      ))}
    </div>
  )
}

function Empty() {
  return <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: '#999' }}>—</div>
}

/* ───────── 工具 ───────── */
function firstItem<T>(resume: Resume, type: string): T | undefined {
  const sec = resume.sections.find((s) => s.type === type && s.visible)
  const items = sec?.items as T[] | undefined
  return items?.[0]
}

registerTemplate({ meta, Component: BrutalistTemplate })
export default BrutalistTemplate
