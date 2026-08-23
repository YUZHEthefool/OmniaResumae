/**
 * 简历差异对比（纯函数，无 AI）
 *
 * 用于快照恢复前预览"恢复将产生的变化"：from = 当前简历，to = 快照内容。
 * 按 id 对齐 section / item，逐字段比较，产出人类可读的变更清单（added/removed/changed）。
 * Localized 字段只比较当前语种（双语全比噪声过大）；highlights 按索引比较。
 * 不追求 JSON 级完备，覆盖用户最关心的：basics、段落/条目增删、标题、关键文本字段、要点。
 */
import type { Resume, Locale, Localized, Section } from '@/types/resume'
import { pick } from '@/types/resume'

export interface DiffChange {
  type: 'added' | 'removed' | 'changed'
  path: string
  from?: string
  to?: string
}

const cap = (s: string | undefined | null): string => {
  const v = (s ?? '').trim()
  return v.length > 80 ? v.slice(0, 77) + '…' : v
}

function locStr(v: unknown, l: Locale): string {
  if (!v || typeof v !== 'object') return ''
  return ((v as Localized)[l] ?? '').trim()
}

function sectionLabel(s: Section, l: Locale): string {
  return pick(s.title, l) || s.type
}

/** 条目主标识：取第一个有值的 name/position/institution/title/tag/label/platform */
function itemLabel(it: Record<string, unknown>, l: Locale): string {
  for (const k of ['name', 'position', 'institution', 'title', 'tag', 'label', 'platform']) {
    const v = it[k]
    if (v && typeof v === 'object') {
      const t = pick(v as Localized, l)
      if (t) return t
    }
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return '#?'
}

type Item = { id: string } & Record<string, unknown>
const asItems = (a: unknown): Item[] => (a as Item[]) ?? []

const LOC_FIELDS = ['name', 'position', 'institution', 'area', 'studyType', 'description', 'title', 'tag', 'body', 'label', 'text', 'sub', 'awarder', 'publisher', 'level']
const STR_FIELDS = ['url', 'repoUrl', 'date', 'startDate', 'endDate', 'platform', 'badge', 'icon']

function classify(a: string, b: string): DiffChange['type'] {
  if (a && !b) return 'removed'
  if (!a && b) return 'added'
  return 'changed'
}

export function diffResumes(cur: Resume, snap: Resume, locale: Locale): DiffChange[] {
  const out: DiffChange[] = []

  // basics（Localized 字段按当前语种比较）
  const b1 = cur.basics as unknown as Record<string, unknown>
  const b2 = snap.basics as unknown as Record<string, unknown>
  for (const k of ['name', 'label', 'summary', 'location', 'nameRomanized']) {
    const a = locStr(b1[k], locale), b = locStr(b2[k], locale)
    if (a !== b) out.push({ type: classify(a, b), path: `${k} (${locale})`, from: cap(a) || undefined, to: cap(b) || undefined })
  }
  for (const k of ['email', 'phone', 'url']) {
    const a = ((b1[k] as string) ?? '').trim(), b = ((b2[k] as string) ?? '').trim()
    if (a !== b) out.push({ type: classify(a, b), path: k, from: cap(a) || undefined, to: cap(b) || undefined })
  }

  // meta
  const trA = locStr(cur.meta?.targetRole, locale), trB = locStr(snap.meta?.targetRole, locale)
  if (trA !== trB) out.push({ type: classify(trA, trB), path: `meta.targetRole (${locale})`, from: cap(trA) || undefined, to: cap(trB) || undefined })
  const kwA = (cur.meta?.keywords ?? []).map((k) => pick(k, locale)).filter(Boolean).join('、')
  const kwB = (snap.meta?.keywords ?? []).map((k) => pick(k, locale)).filter(Boolean).join('、')
  if (kwA !== kwB) out.push({ type: 'changed', path: `meta.keywords (${locale})`, from: cap(kwA) || undefined, to: cap(kwB) || undefined })

  // sections（按 id 对齐）
  const snapSecs = new Map(snap.sections.map((s) => [s.id, s]))
  for (const s of cur.sections) if (!snapSecs.has(s.id)) out.push({ type: 'removed', path: sectionLabel(s, locale) })
  for (const s of snap.sections) if (!cur.sections.some((c) => c.id === s.id)) out.push({ type: 'added', path: sectionLabel(s, locale) })

  for (const s of cur.sections) {
    const o = snapSecs.get(s.id)
    if (!o) continue
    const sl = sectionLabel(s, locale)
    if (pick(s.title, locale) !== pick(o.title, locale)) {
      out.push({ type: 'changed', path: `${sl} · title (${locale})`, from: cap(pick(s.title, locale)) || undefined, to: cap(pick(o.title, locale)) || undefined })
    }
    if (s.layout !== o.layout) out.push({ type: 'changed', path: `${sl} · layout`, from: s.layout, to: o.layout })
    if (s.visible !== o.visible) out.push({ type: 'changed', path: `${sl} · visible`, from: String(s.visible), to: String(o.visible) })

    const ci = new Map(asItems(s.items).map((it) => [it.id, it]))
    const oi = new Map(asItems(o.items).map((it) => [it.id, it]))
    for (const it of asItems(s.items)) if (!oi.has(it.id)) out.push({ type: 'removed', path: `${sl} · ${itemLabel(it, locale)}` })
    for (const it of asItems(o.items)) if (!ci.has(it.id)) out.push({ type: 'added', path: `${sl} · ${itemLabel(it, locale)}` })

    for (const it of asItems(s.items)) {
      const jt = oi.get(it.id)
      if (!jt) continue
      const il = itemLabel(it, locale)
      for (const k of LOC_FIELDS) {
        if (!(k in it) && !(k in jt)) continue
        const a = locStr(it[k], locale), b = locStr(jt[k], locale)
        if (a !== b) out.push({ type: classify(a, b), path: `${sl} · ${il} · ${k} (${locale})`, from: cap(a) || undefined, to: cap(b) || undefined })
      }
      for (const k of STR_FIELDS) {
        if (!(k in it) && !(k in jt)) continue
        const a = ((it[k] as string) ?? '').trim(), b = ((jt[k] as string) ?? '').trim()
        if (a !== b) out.push({ type: classify(a, b), path: `${sl} · ${il} · ${k}`, from: cap(a) || undefined, to: cap(b) || undefined })
      }
      const ha = (it.highlights as Localized[] | undefined) ?? []
      const hb = (jt.highlights as Localized[] | undefined) ?? []
      for (let i = 0; i < Math.max(ha.length, hb.length); i++) {
        const a = locStr(ha[i], locale), b = locStr(hb[i], locale)
        if (a !== b) out.push({ type: classify(a, b), path: `${sl} · ${il} · highlights[${i}] (${locale})`, from: cap(a) || undefined, to: cap(b) || undefined })
      }
    }
  }
  return out
}
