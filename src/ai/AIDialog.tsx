/**
 * AIDialog：AI 能力入口 + 提案审阅
 *
 * 三个 tab：优化润色 / 目标公司包装 / 翻译。
 * 产出 Proposal 后，逐项 diff，用户接受才写入 store。
 */
import { useState } from 'react'
import { clsx } from 'clsx'
import { useResumeStore } from '@/store/resumeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import { pick } from '@/types/resume'
import type { Resume } from '@/types/resume'
import type { OptimizeProposal, TailorProposal, TranslateProposal } from '@/types/ai'
import { Overlay } from '@/importers/ImportDialog'
import { optimizeItems, tailorToCompany, translateItems } from './features'

type Tab = 'optimize' | 'tailor' | 'translate'

export function AIDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('optimize')
  return (
    <Overlay onClose={onClose}>
      <div className="w-[760px] max-w-[94vw] max-h-[88vh] overflow-hidden bg-white rounded-lg shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-chrome-border">
          <h2 className="text-base font-semibold">AI 助手</h2>
          <button className="text-chrome-muted hover:text-chrome-ink" onClick={onClose}>✕</button>
        </div>
        <div className="flex gap-1 px-5 py-2 border-b border-chrome-border">
          {([
            ['optimize', '优化润色'],
            ['tailor', '目标公司包装'],
            ['translate', '翻译'],
          ] as [Tab, string][]).map(([k, label]) => (
            <button
              key={k}
              className={clsx('px-3 py-1.5 text-xs rounded', tab === k ? 'bg-chrome-ink text-white' : 'border border-chrome-border hover:bg-chrome-bg')}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'optimize' && <OptimizePanel onClose={onClose} />}
          {tab === 'tailor' && <TailorPanel onClose={onClose} />}
          {tab === 'translate' && <TranslatePanel onClose={onClose} />}
        </div>
      </div>
    </Overlay>
  )
}

/* ───────── 优化润色 ───────── */
function OptimizePanel({ onClose }: { onClose: () => void }) {
  const resume = useResumeStore((s) => s.current)!
  const locale = useUIStore((s) => s.locale)
  const update = useResumeStore((s) => s.update)
  const cfg = useSettingsStore((s) => s.ai)

  const [target, setTarget] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [prop, setProp] = useState<OptimizeProposal | null>(null)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())

  const candidates = resume.sections
    .filter((s) => ['work', 'projects', 'education'].includes(s.type))
    .flatMap((s) => (s.items as unknown as Array<{ id: string; highlights?: { zh?: string; en?: string }[] }>).map((it) => ({
      key: `${s.id}:${it.id}`,
      label: `${pick(s.title, locale)} · ${(it.highlights ?? []).length} 条`,
    })))

  const run = async () => {
    const [secId, itemId] = target.split(':')
    const sec = resume.sections.find((s) => s.id === secId)
    const item = sec?.items.find((i) => i.id === itemId) as { highlights?: { zh?: string; en?: string }[] } | undefined
    if (!item?.highlights?.length) { setErr('该条目没有要点可优化'); return }
    setBusy(true); setErr(''); setProp(null); setAccepted(new Set())
    try {
      if (!cfg.apiKey) throw new Error('请先在「设置」配置 AI 密钥')
      const items = item.highlights.map((h) => pick(h, locale)).filter(Boolean)
      const p = await optimizeItems(cfg, items, pick(sec!.title, locale), locale)
      setProp(p)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const apply = () => {
    if (!prop) return
    const [secId, itemId] = target.split(':')
    update((d) => {
      const sec = d.sections.find((s) => s.id === secId)
      const item = sec?.items.find((i) => i.id === itemId) as { highlights?: { zh?: string; en?: string }[] } | undefined
      if (!item?.highlights) return
      prop.items.forEach((it, i) => {
        if (accepted.has(i)) {
          const idx = item.highlights!.findIndex((h) => pick(h, locale) === it.original)
          if (idx >= 0) item.highlights![idx] = { ...item.highlights![idx], [locale]: it.rewritten }
        }
      })
    })
    onClose()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-chrome-muted mb-1">选择要优化的条目</label>
        <select className="w-full px-2.5 py-1.5 text-sm border border-chrome-border rounded" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">— 选择 —</option>
          {candidates.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <button className="px-3 py-1.5 text-sm bg-chrome-ink text-white rounded hover:bg-black disabled:opacity-50" onClick={run} disabled={busy || !target}>
        {busy ? 'AI 思考中…' : '生成优化建议'}
      </button>
      {err && <div className="text-sm text-red-600">{err}</div>}

      {prop && (
        <div className="space-y-2">
          {prop.items.map((it, i) => (
            <div key={i} className={clsx('border rounded p-2.5', accepted.has(i) ? 'border-green-600 bg-green-50' : 'border-chrome-border')}>
              <div className="text-xs text-chrome-muted line-through mb-1">{it.original}</div>
              <div className="text-sm">{it.rewritten}</div>
              <button
                className="mt-2 text-xs px-2 py-1 border rounded"
                onClick={() => setAccepted((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })}
              >
                {accepted.has(i) ? '✓ 已采纳' : '采纳此条'}
              </button>
            </div>
          ))}
          <button className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50" onClick={apply} disabled={!accepted.size}>
            应用 {accepted.size} 条采纳的改写
          </button>
        </div>
      )}
    </div>
  )
}

/* ───────── 目标公司包装 ───────── */
function TailorPanel({ onClose }: { onClose: () => void }) {
  const resume = useResumeStore((s) => s.current)!
  const locale = useUIStore((s) => s.locale)
  const update = useResumeStore((s) => s.update)
  const cfg = useSettingsStore((s) => s.ai)

  const [company, setCompany] = useState('')
  const [jd, setJd] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [prop, setProp] = useState<TailorProposal | null>(null)
  const [acceptHighlights, setAcceptHighlights] = useState(false)
  const [acceptMatches, setAcceptMatches] = useState(false)
  const [acceptPride, setAcceptPride] = useState(false)

  const run = async () => {
    setBusy(true); setErr(''); setProp(null)
    try {
      if (!cfg.apiKey) throw new Error('请先在「设置」配置 AI 密钥')
      if (!company.trim()) throw new Error('请填写目标公司')
      const p = await tailorToCompany(cfg, resume, company, jd, locale)
      setProp(p)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const apply = () => {
    if (!prop) return
    update((d) => {
      if (acceptHighlights) {
        const sec = d.sections.find((s) => s.type === 'projects')
        if (sec) {
          for (const rw of prop.rewrittenHighlights) {
            const item = sec.items.find((i) => i.id === rw.projectId) as { highlights?: { zh?: string; en?: string }[] } | undefined
            if (item) item.highlights = rw.highlights.map((h) => ({ [locale]: h } as { zh?: string; en?: string }))
          }
          sec.items.sort((a, b) => {
            const af = prop.featuredProjects.find((f) => f.projectId === a.id) ? 0 : 1
            const bf = prop.featuredProjects.find((f) => f.projectId === b.id) ? 0 : 1
            return af - bf
          })
        }
      }
      if (acceptMatches) {
        let sec = d.sections.find((s) => s.type === 'matches')
        const matchItems = prop.matches.map((m, i) => ({ id: `match_ai_${i}`, tag: { [locale]: m.tag } as { zh?: string; en?: string }, body: { [locale]: m.body } as { zh?: string; en?: string } }))
        if (sec) sec.items = matchItems as never[]
        else d.sections.push({ id: 'sec_match_ai', type: 'matches', title: { zh: '招聘要求匹配', en: 'Match' }, layout: 'sidebar', items: matchItems as never[], visible: true })
      }
      if (acceptPride && prop.pride) {
        d.basics.summary = { ...d.basics.summary, [locale]: prop.pride }
      }
    })
    onClose()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-chrome-muted mb-1">目标公司</label>
        <input className="w-full px-2.5 py-1.5 text-sm border border-chrome-border rounded" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="如 字节跳动 / Google" />
      </div>
      <div>
        <label className="block text-xs text-chrome-muted mb-1">岗位描述 / 公司背景</label>
        <textarea className="w-full h-40 px-2.5 py-1.5 text-xs border border-chrome-border rounded" value={jd} onChange={(e) => setJd(e.target.value)} placeholder="粘贴 JD 或公司背景信息" />
      </div>
      <button className="px-3 py-1.5 text-sm bg-chrome-ink text-white rounded hover:bg-black disabled:opacity-50" onClick={run} disabled={busy}>
        {busy ? 'AI 分析中…' : '生成包装建议'}
      </button>
      {err && <div className="text-sm text-red-600">{err}</div>}

      {prop && (
        <div className="space-y-3">
          <div className="border border-chrome-border rounded p-3 bg-chrome-bg">
            <div className="text-xs font-semibold mb-1">建议主推项目</div>
            {prop.featuredProjects.map((f) => {
              const p = (resume.sections.find((s) => s.type === 'projects')?.items as { id: string; name: { zh?: string; en?: string } }[] | undefined)?.find((x) => x.id === f.projectId)
              return <div key={f.projectId} className="text-xs mb-1">• {p ? pick(p.name, locale) : f.projectId}：<span className="text-chrome-muted">{f.reason}</span></div>
            })}
          </div>
          {prop.rewrittenHighlights.length > 0 && (
            <div className="border border-chrome-border rounded p-3">
              <div className="text-xs font-semibold mb-2">改写后的要点</div>
              {prop.rewrittenHighlights.map((rw) => (
                <div key={rw.projectId} className="mb-2">
                  <div className="text-[11px] text-chrome-muted mb-1">{rw.projectId}</div>
                  <ul className="list-disc list-inside text-xs space-y-0.5">
                    {rw.highlights.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {prop.matches.length > 0 && (
            <div className="border border-chrome-border rounded p-3">
              <div className="text-xs font-semibold mb-2">招聘要求 ↔ 匹配</div>
              {prop.matches.map((m, i) => (
                <div key={i} className="text-xs mb-1"><b>{m.tag}</b>：{m.body}</div>
              ))}
            </div>
          )}
          <div className="border border-chrome-border rounded p-3">
            <div className="text-xs font-semibold mb-1">核心优势包装</div>
            <div className="text-sm">{prop.pride}</div>
          </div>

          <div className="space-y-1 text-xs">
            <label className="flex items-center gap-2"><input type="checkbox" checked={acceptHighlights} onChange={(e) => setAcceptHighlights(e.target.checked)} /> 应用改写要点并重排主推项目</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={acceptMatches} onChange={(e) => setAcceptMatches(e.target.checked)} /> 应用"招聘匹配"到侧栏</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={acceptPride} onChange={(e) => setAcceptPride(e.target.checked)} /> 应用核心优势到"引以为傲"</label>
          </div>
          <button className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-800" onClick={apply}>
            应用选中项
          </button>
        </div>
      )}
    </div>
  )
}

/* ───────── 翻译 ───────── */
/** 翻译目标引用：直接定位到 draft 里的 Localized 对象 */
interface TransField {
  label: string
  text: string
  apply: (draft: Resume, value: string) => void
}

function TranslatePanel({ onClose }: { onClose: () => void }) {
  const resume = useResumeStore((s) => s.current)!
  const locale = useUIStore((s) => s.locale)
  const update = useResumeStore((s) => s.update)
  const cfg = useSettingsStore((s) => s.ai)
  const to: 'zh' | 'en' = locale === 'zh' ? 'en' : 'zh'

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [prop, setProp] = useState<TranslateProposal | null>(null)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())

  // 收集当前语言有值、目标语言为空的 Localized 字段
  const fields: TransField[] = []
  const add = (label: string, loc: { zh?: string; en?: string }, apply: (d: Resume, v: string) => void) => {
    const cur = loc[locale]
    if (cur && !loc[to]) fields.push({ label, text: cur, apply })
  }
  // basics
  add('姓名', resume.basics.name, (d, v) => { d.basics.name = { ...d.basics.name, [to]: v } })
  if (resume.basics.label) add('头衔', resume.basics.label, (d, v) => { d.basics.label = { ...d.basics.label!, [to]: v } })
  if (resume.basics.summary) add('核心优势', resume.basics.summary, (d, v) => { d.basics.summary = { ...d.basics.summary!, [to]: v } })
  if (resume.basics.location) add('所在地', resume.basics.location, (d, v) => { d.basics.location = { ...d.basics.location!, [to]: v } })
  // sections
  resume.sections.forEach((sec, si) => {
    add(`段落标题·${pick(sec.title, locale)}`, sec.title, (d, v) => { d.sections[si].title = { ...d.sections[si].title, [to]: v } })
    sec.items.forEach((item, ii) => {
      const it = item as Record<string, unknown>
      const LOCALIZED_KEYS = ['name', 'position', 'institution', 'area', 'studyType', 'level', 'description', 'awarder', 'title', 'tag', 'body', 'label', 'text', 'sub']
      LOCALIZED_KEYS.forEach((k) => {
        const v = it[k]
        if (v && typeof v === 'object' && ('zh' in v || 'en' in v)) {
          add(`${pick(sec.title, locale)}.${k}`, v as { zh?: string; en?: string }, (d, val) => {
            const obj = (d.sections[si].items[ii] as Record<string, unknown>)[k] as { zh?: string; en?: string }
            ;(d.sections[si].items[ii] as Record<string, unknown>)[k] = { ...obj, [to]: val }
          })
        }
      })
      // highlights 数组
      const hl = (it as { highlights?: { zh?: string; en?: string }[] }).highlights
      if (Array.isArray(hl)) {
        hl.forEach((h, hi) => {
          add(`${pick(sec.title, locale)}.亮点[${hi}]`, h, (d, val) => {
            const arr = (d.sections[si].items[ii] as { highlights?: { zh?: string; en?: string }[] }).highlights!
            arr[hi] = { ...arr[hi], [to]: val }
          })
        })
      }
    })
  })

  const run = async () => {
    setBusy(true); setErr(''); setProp(null); setAccepted(new Set())
    try {
      if (!cfg.apiKey) throw new Error('请先在「设置」配置 AI 密钥')
      if (!fields.length) { setErr('没有需要翻译的空字段（目标语言均已填）'); return }
      const p = await translateItems(cfg, fields.map((f) => f.text), locale, to)
      setProp(p)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const apply = () => {
    if (!prop) return
    update((d) => {
      prop.pairs.forEach((pair, i) => {
        if (accepted.has(i)) fields[i].apply(d, pair.target)
      })
    })
    onClose()
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-chrome-muted">
        将把当前语言（{locale === 'zh' ? '中文' : '英文'}）有值、目标语言为空的字段翻译为{to === 'zh' ? '中文' : '英文'}。
        共发现 {fields.length} 个待翻译字段。
      </div>
      <button className="px-3 py-1.5 text-sm bg-chrome-ink text-white rounded hover:bg-black disabled:opacity-50" onClick={run} disabled={busy}>
        {busy ? '翻译中…' : '开始翻译'}
      </button>
      {err && <div className="text-sm text-red-600">{err}</div>}
      {prop && (
        <div className="space-y-2">
          {prop.pairs.map((pair, i) => (
            <div key={i} className={clsx('border rounded p-2 text-xs', accepted.has(i) ? 'border-green-600 bg-green-50' : 'border-chrome-border')}>
              <div className="text-[10px] text-chrome-muted mb-1">{fields[i]?.label}</div>
              <div className="text-chrome-muted mb-1">{pair.source}</div>
              <div>{pair.target}</div>
              <button className="mt-1 text-[11px] px-2 py-0.5 border rounded" onClick={() => setAccepted((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })}>
                {accepted.has(i) ? '✓ 已采纳' : '采纳'}
              </button>
            </div>
          ))}
          <button className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50" onClick={apply} disabled={!accepted.size}>
            应用 {accepted.size} 条翻译
          </button>
        </div>
      )}
    </div>
  )
}
