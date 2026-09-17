/**
 * PR → 简历条目的转换层（纯函数：不碰 store、不碰 DOM，便于单独验证）
 *
 * 与仓库导入的区别在于「遇到已存在的项目怎么办」：仓库导入是整体跳过（同一个仓库导两次
 * 没有新信息），而 PR 导入是**追加要点**——用户第二次挑选同一仓库里另外几个 PR，正是
 * 「基于 PR 细粒度改简历」的主路径，跳过会把这条路径堵死。
 */
import type { Locale, Localized, ProjectItem } from '@/types/resume'
import type { GHPull } from './client'
import { groupPullsByRepo } from './client'
import { uid } from '@/schema/defaults'

/** 仓库级补充信息（来自 getRepoByName/getRepoDetail），只用于新建条目 */
export interface PullRepoMeta {
  description?: string | null
  homepage?: string | null
  htmlUrl?: string
  languages?: string[]
  topics?: string[]
  stars?: number
}

export interface PullImportOptions {
  locale: Locale
  /** 认证用户 login（或手填的用户名），用于判断仓库归属 own/contrib */
  ownerLogin: string
  /** 是否在要点首位插入代码量汇总行 */
  includeStats: boolean
  /** 每个仓库最多生成几条 PR 要点 */
  maxHighlights?: number
  /** 仓库详情，键为 "owner/name" */
  meta?: Record<string, PullRepoMeta>
}

export interface PullImportPlan {
  /** 需要新建的项目条目 */
  create: ProjectItem[]
  /** 需要追加到已有条目的要点（按 id 定位） */
  append: { itemId: string; repo: string; name: string; highlights: Localized[] }[]
  summary: {
    repos: number
    pulls: number
    created: number
    appended: number
    /** 因为要点文本已存在而被跳过的条数 */
    duplicated: number
  }
}

/** 仓库 URL 归一化：导入与匹配都要用它，否则 "https://github.com/a/b" 与 ".../b/" 会被当成两个仓库 */
export function normRepoUrl(url: string | undefined): string {
  if (!url) return ''
  return url.trim().replace(/\/+$/, '').replace(/\.git$/, '').toLowerCase()
}

/** 代码量格式化：1200 → "1.2k"。用于要点里的汇总行，不追求精确 */
export function formatLines(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`
}

/** PR 标题 → 简历要点文本。清掉 markdown 标记与首尾噪声，保留「做了什么」的信息量 */
function pullToText(title: string, max = 140): string {
  const t = title
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:：]+/, '')
    .replace(/[\s.。;；]+$/, '')
    .trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** 代码量汇总行。只在确实补到统计时才生成——否则 additions 全是 0，会写成「+0 / −0 行」 */
function statsLine(
  merged: number,
  total: number,
  additions: number,
  deletions: number,
  statsCount: number,
  locale: Locale,
): string {
  const base = locale === 'zh'
    ? `贡献 ${merged} 个已合并 PR（共 ${total} 个）`
    : `${merged} merged pull requests (${total} total)`
  if (!statsCount) return base
  const lines = `+${formatLines(additions)} / −${formatLines(deletions)}`
  return locale === 'zh'
    ? `${base}，累计 ${lines} 行`
    : `${base}, ${lines} lines`
}

/**
 * 规划一次 PR 导入。
 * `existing` 传当前 projects 段的条目，用于决定「新建」还是「追加要点」。
 */
export function planPullImport(
  pulls: GHPull[],
  existing: Pick<ProjectItem, 'id' | 'name' | 'repoUrl' | 'highlights'>[],
  opts: PullImportOptions,
): PullImportPlan {
  const { locale, ownerLogin, includeStats } = opts
  const maxHi = Math.max(1, opts.maxHighlights ?? 6)

  // 已有条目按归一化 repoUrl 建索引：同仓库后续追加要点，而不是再建一条重复项目
  const byUrl = new Map<string, Pick<ProjectItem, 'id' | 'name' | 'repoUrl' | 'highlights'>>()
  for (const it of existing) {
    const key = normRepoUrl(it.repoUrl)
    if (key) byUrl.set(key, it)
  }

  const plan: PullImportPlan = {
    create: [],
    append: [],
    summary: { repos: 0, pulls: 0, created: 0, appended: 0, duplicated: 0 },
  }

  for (const g of groupPullsByRepo(pulls)) {
    const url = normRepoUrl(opts.meta?.[g.repo]?.htmlUrl ?? g.url)
    const target = byUrl.get(url)
    // 已在该条目里出现过的要点文本，避免重复导入同一批 PR 时堆叠重复条目
    const seen = new Set(
      (target?.highlights ?? []).map((h) => (h?.[locale] ?? '').trim()).filter(Boolean),
    )

    const texts: string[] = []
    // 汇总行只在**新建条目**时写。追加场景下不能写：要重算就得知道上次导入覆盖了哪些 PR，
    // 而 highlights 是无标记的纯文本，无从恢复；硬加会让同一仓库堆出多条互相矛盾的行数
    // （「贡献 2 个已合并 PR」和「贡献 1 个已合并 PR」并排出现在简历上）。
    if (includeStats && !target) {
      texts.push(statsLine(g.mergedCount, g.totalPulls, g.additions, g.deletions, g.statsCount, locale))
    }
    for (const p of g.pulls) {
      if (texts.length >= maxHi) break
      const text = pullToText(p.title)
      if (!text || seen.has(text)) { plan.summary.duplicated++; continue }
      texts.push(text)
    }

    plan.summary.repos++
    plan.summary.pulls += g.totalPulls

    if (!texts.length) continue
    const highlights = texts.map((t) => ({ [locale]: t }) as Localized)

    if (target) {
      plan.append.push({ itemId: target.id, repo: g.repo, name: g.repo, highlights })
      plan.summary.appended++
      continue
    }

    const m = opts.meta?.[g.repo]
    const repoName = g.repo.split('/')[1] ?? g.repo
    const isOwn = !!ownerLogin && g.repo.split('/')[0].toLowerCase() === ownerLogin.toLowerCase()
    const fallbackDesc = locale === 'zh'
      ? `在 ${g.repo} 贡献 ${g.totalPulls} 个 PR${g.statsCount ? `，累计 +${formatLines(g.additions)} / −${formatLines(g.deletions)} 行` : ''}`
      : `Contributed ${g.totalPulls} pull requests to ${g.repo}`
    plan.create.push({
      id: uid('proj'),
      name: { zh: repoName, en: repoName },
      description: { [locale]: (m?.description ?? '').trim() || fallbackDesc } as Localized,
      url: m?.homepage || m?.htmlUrl || g.url,
      repoUrl: m?.htmlUrl || g.url,
      keywords: [...(m?.languages ?? []), ...(m?.topics ?? [])].slice(0, 12),
      stars: m?.stars,
      languages: m?.languages ?? [],
      highlights,
      badge: 'oss',
      kind: isOwn ? 'own' : 'contrib',
    })
    plan.summary.created++
  }

  return plan
}
