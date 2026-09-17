/**
 * GitHub REST API v3 客户端（纯浏览器，CORS 开放）
 * 无 PAT 60 req/h；带 PAT 5000/h 且可读私有仓。
 * PAT 仅从 settingsStore 读取，存 localStorage，仅发往 api.github.com。
 */

export interface GHRepo {
  id: number
  name: string
  full_name: string // "owner/name"
  owner: { login: string }
  description: string | null
  html_url: string
  homepage: string | null
  stargazers_count: number
  forks_count: number
  language: string | null
  topics: string[]
  updated_at: string
  fork: boolean
  archived: boolean
  visibility?: string
}

const API = 'https://api.github.com'

function headers(pat: string): HeadersInit {
  return pat ? { Accept: 'application/vnd.github+json', Authorization: `Bearer ${pat}` } : { Accept: 'application/vnd.github+json' }
}

/** 从 Link 响应头解析 rel="next" 的下一页 URL；无则 null */
function parseNextLink(link: string | null): string | null {
  if (!link) return null
  const m = link.match(/<([^>]+)>;\s*rel="next"/)
  return m ? m[1] : null
}

/** 已拿到首页响应后，跟随 Link rel="next" 翻页（封顶 maxPages 防滥用），累积结果 */
async function pagedFrom<T>(firstRes: Response, pat: string, maxPages = 10): Promise<T[]> {
  let out = (await firstRes.json()) as T[]
  let next = parseNextLink(firstRes.headers.get('Link'))
  for (let i = 0; i < maxPages - 1 && next; i++) {
    const res = await fetch(next, { headers: headers(pat) })
    // 中途失败（如限流）抛错让调用方提示，而非静默返回截断的部分结果
    if (!res.ok) throw new Error(`GitHub 分页失败 ${res.status}（可能限流），结果可能不完整`)
    out = out.concat((await res.json()) as T[])
    next = parseNextLink(res.headers.get('Link'))
  }
  return out
}

/** base64 → UTF-8 字符串：atob 得到 Latin-1 二进制串，需经 TextDecoder 还原 CJK/多字节，否则中文 README 乱码 */
function decodeBase64Utf8(b64: string): string {
  try {
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return ''
  }
}

/** 列出用户相关仓库：自己的 + 所属组织的（无 PAT 也能查任意公开用户）。
 *  组织仓库通过 /users/{u}/orgs → /orgs/{org}/repos 获取；全程跟随 Link 分页。
 *  去重后按 star 降序。 */
export async function listUserRepos(username: string, pat: string): Promise<GHRepo[]> {
  const u = encodeURIComponent(username)
  // 1) 自己的仓库（首页单独判 404/403 以给出准确提示，再跟随分页）
  const first = await fetch(`${API}/users/${u}/repos?per_page=100&sort=updated`, { headers: headers(pat) })
  if (first.status === 404) throw new Error(`用户 ${username} 不存在`)
  if (!first.ok) {
    if (first.status === 403) throw new Error('GitHub 限流或 PAT 无效（403）。可稍后重试或填入有效 PAT。')
    throw new Error(`GitHub API ${first.status}`)
  }
  const own = await pagedFrom<GHRepo>(first, pat)

  // 2) 所属组织 → 每个组织的仓库（含分页，单组织失败不阻塞）
  let orgRepos: GHRepo[] = []
  try {
    const orgsFirst = await fetch(`${API}/users/${u}/orgs?per_page=100`, { headers: headers(pat) })
    if (orgsFirst.ok) {
      const orgs = await pagedFrom<{ login: string }>(orgsFirst, pat)
      const results = await Promise.all(
        orgs.map((o) =>
          fetch(`${API}/orgs/${encodeURIComponent(o.login)}/repos?per_page=100&sort=updated`, { headers: headers(pat) })
            .then((r) => (r.ok ? pagedFrom<GHRepo>(r, pat) : []))
            .catch(() => [] as GHRepo[]),
        ),
      )
      orgRepos = results.flat()
    }
  } catch { /* 组织拉取失败不阻塞 */ }

  // 去重（按 id），过滤 fork/archived，按 star 降序
  const map = new Map<number, GHRepo>()
  for (const r of [...own, ...orgRepos]) {
    if (!r.fork && !r.archived) map.set(r.id, r)
  }
  return [...map.values()].sort((a, b) => b.stargazers_count - a.stargazers_count)
}

/** 带 PAT 时列出当前认证用户的全部相关仓库：
 *  含 owner(自己的) + collaborator(参与贡献的) + organization_member(所属组织的)——含私有仓。
 *  走 /user/repos（而非 /users/{login}/repos，后者即便带 PAT 也只返回公开仓）。 */
export async function listMyRepos(pat: string): Promise<GHRepo[]> {
  if (!pat) throw new Error('列出自己的仓库需要 PAT')
  const first = await fetch(
    `${API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
    { headers: headers(pat) },
  )
  if (!first.ok) {
    if (first.status === 403) throw new Error('GitHub 限流或 PAT 无效（403）')
    throw new Error(`GitHub API ${first.status}（PAT 可能无效）`)
  }
  const data = await pagedFrom<GHRepo>(first, pat)
  const map = new Map<number, GHRepo>()
  for (const r of data) {
    if (!r.fork && !r.archived) map.set(r.id, r)
  }
  return [...map.values()].sort((a, b) => b.stargazers_count - a.stargazers_count)
}

export interface GHRepoDetail {
  languages: string[]
  readme: string
  stars: number
  topics: string[]
  url: string
  description: string | null
}

/** 仓库语言列表（按代码量降序，API 原生顺序）。抽出来是因为 PR 导入只要语言、
 *  不该为了它把整份 README 也拉下来。 */
export async function getRepoLanguages(owner: string, name: string, pat: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/languages`,
      { headers: headers(pat) },
    )
    if (!res.ok) return []
    return Object.keys((await res.json()) as Record<string, number>)
  } catch {
    return []
  }
}

export async function getRepoDetail(repo: GHRepo, pat: string): Promise<GHRepoDetail> {
  const owner = repo.full_name.split('/')[0]
  const name = repo.name
  // languages：返回 { "Python": 12345, ... }
  const languages = await getRepoLanguages(owner, name, pat)

  // readme（API 返回 base64 content；需 UTF-8 解码，否则 CJK 乱码）
  let readme = ''
  try {
    const rmRes = await fetch(`${API}/repos/${owner}/${name}/readme`, { headers: headers(pat) })
    if (rmRes.ok) {
      const rm = (await rmRes.json()) as { content?: string; encoding?: string }
      if (rm.content) {
        readme = rm.encoding === 'base64' ? decodeBase64Utf8(rm.content.replace(/\n/g, '')) : rm.content
      }
    }
  } catch { /* ignore */ }

  return {
    languages,
    readme,
    stars: repo.stargazers_count,
    topics: repo.topics ?? [],
    url: repo.html_url,
    description: repo.description,
  }
}

/* ───────── 通过 PR 贡献过的仓库 ─────────
 * affiliation 只覆盖 owner/collaborator/organization_member，不含"提过 PR 的他人仓库"。
 * 用搜索 API：/search/issues?q=author:{user}+type:pr → 取每条 repository_url 去重 → 取仓库详情。
 * 注意：搜索 API 1000 条上限、30 req/min 限流。
 */
export interface ContributedRepo {
  owner: string
  name: string
  html_url: string
}

/** 搜某用户提过的 PR，去重得到贡献过的仓库 owner/name 列表。
 *  复用 searchAuthoredPulls，避免同一份搜索结果维护两条翻页路径；顺带共享它的 memo。 */
export async function searchContributedRepos(username: string, pat: string): Promise<ContributedRepo[]> {
  const pulls = await searchAuthoredPulls(username, pat)
  const seen = new Set(pulls.map((p) => p.repo))
  return [...seen].map((full) => {
    const [owner, name] = full.split('/')
    return { owner, name, html_url: `https://github.com/${full}` }
  })
}

/** 取单个仓库详情（owner/name → GHRepo） */
export async function getRepoByName(owner: string, name: string, pat: string): Promise<GHRepo | null> {
  const res = await fetch(`${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, { headers: headers(pat) })
  if (!res.ok) return null
  return (await res.json()) as GHRepo
}

/** 统一入口：own + org + contributed，去重，按 star 降序。
 *  - useMine && pat：own/org 走 listMyRepos（/user/repos，含私有 + collaborator + 组织成员），
 *    贡献搜索以 authLogin 为 author。
 *  - 否则：own/org 走 listUserRepos（公开），贡献搜索以 username 为 author。
 *  - own/org 拉取失败（如限流）且啥也没拿到时，抛出真实原因，而非误报"没有可见仓库"。 */
export async function listAllRepos(username: string, pat: string, useMine = false, authLogin = ''): Promise<GHRepo[]> {
  let ownAndOrg: GHRepo[] = []
  let ownError: Error | null = null
  try {
    if (useMine && pat) ownAndOrg = await listMyRepos(pat)
    else if (username) ownAndOrg = await listUserRepos(username, pat)
  } catch (e) {
    ownError = e as Error
  }

  let contrib: GHRepo[] = []
  try {
    const author = useMine && pat ? authLogin : username
    if (author) {
      const contributed = await searchContributedRepos(author, pat)
      // 并行取每个仓库详情（过滤掉已在 ownAndOrg 的）
      const existing = new Set(ownAndOrg.map((r) => r.full_name.toLowerCase()))
      const toFetch = contributed.filter((c) => !existing.has(`${c.owner}/${c.name}`.toLowerCase()))
      contrib = (await Promise.all(
        toFetch.map((c) => getRepoByName(c.owner, c.name, pat).catch(() => null)),
      )).filter((r): r is GHRepo => !!r && !r.fork && !r.archived)
    }
  } catch { /* 贡献搜索失败不阻塞 */ }

  if (!ownAndOrg.length && !contrib.length && ownError) throw ownError

  const map = new Map<number, GHRepo>()
  for (const r of [...ownAndOrg, ...contrib]) map.set(r.id, r)
  return [...map.values()].sort((a, b) => b.stargazers_count - a.stargazers_count)
}

/* ═══════════════ 拉取请求（PR）═══════════════
 * 仓库级数据（README/语言/stars）只能说明「项目是什么」，说明不了「你做了什么」。
 * 这一段把 PR 变成一等数据源：标题/描述/是否合并/代码量，供简历要点提炼。
 */

export interface GHPull {
  /** "owner/name" */
  repo: string
  number: number
  title: string
  body: string
  url: string
  /** 是否已合并：来自搜索结果的 pull_request.merged_at，不需要额外请求 */
  merged: boolean
  createdAt: string
  closedAt: string | null
  comments: number
  /** 以下三项仅在 attachPullStats 补过统计后存在 */
  additions?: number
  deletions?: number
  changedFiles?: number
}

export interface GHPullStats {
  additions: number
  deletions: number
  changedFiles: number
  merged: boolean
  comments: number
  reviewComments: number
}

/** 单 PR 详情 = 统计 + 标题/正文/状态。正文是写简历要点的原始素材。 */
export interface GHPullDetail extends GHPullStats {
  title: string
  body: string
  url: string
  state: string
  createdAt: string
}

/** 取 PAT 持有者的 login。失败返回空串（调用方据此回退到用户名模式，而不是直接报错）。
 *  login 对一个 PAT 是稳定的，故成功结果做 memo——agent 每轮调 list_my_pulls 都要用它，
 *  不缓存的话每次都白打一次 /user。失败不缓存（可能只是临时限流）。 */
export async function getAuthLogin(pat: string): Promise<string> {
  if (!pat) return ''
  const hit = pullCache.get('authlogin')
  if (hit && Date.now() - hit.at < PULL_TTL) return hit.v as string
  try {
    const res = await fetch(`${API}/user`, { headers: headers(pat) })
    if (!res.ok) return ''
    const login = ((await res.json()) as { login?: string }).login ?? ''
    if (login) pullCache.set('authlogin', { at: Date.now(), v: login })
    return login
  } catch {
    return ''
  }
}

/** PR 相关查询的 memo。agent 一轮对话里会反复调同一个工具，而 PR 列表变化很慢。
 *  只覆盖 PR 路径——listMyRepos / getRepoDetail 保持每次新拉，用户点「列出仓库」预期拿到新鲜数据。 */
const PULL_TTL = 5 * 60 * 1000
const pullCache = new Map<string, { at: number; v: unknown }>()

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = pullCache.get(key)
  if (hit && Date.now() - hit.at < PULL_TTL) return Promise.resolve(hit.v as T)
  return fn().then((v) => {
    pullCache.set(key, { at: Date.now(), v })
    return v
  })
}

/** 搜索 API 硬上限：单条查询最多返回 1000 条 */
const SEARCH_MAX = 1000

interface SearchPullItem {
  number: number
  title?: string
  body?: string | null
  html_url: string
  created_at: string
  closed_at: string | null
  comments?: number
  repository_url?: string
  pull_request?: { merged_at?: string | null }
}

/** 搜某作者提交的 PR（含未合并），按创建时间倒序，封顶 max 条。
 *  搜索 API 限流很紧（认证 30/min、匿名 10/min），故结果做 5 分钟 memo。 */
export async function searchAuthoredPulls(
  author: string,
  pat: string,
  opts: { mergedOnly?: boolean; max?: number } = {},
): Promise<GHPull[]> {
  const a = author.trim()
  if (!a) throw new Error('缺少 GitHub 用户名')
  const max = Math.max(1, Math.min(opts.max ?? SEARCH_MAX, SEARCH_MAX))
  const key = `pulls:${a}:${opts.mergedOnly ? 'merged' : 'all'}:${max}`
  return cached(key, async () => {
    const q = `author:${encodeURIComponent(a)}+type:pr${opts.mergedOnly ? '+is:merged' : ''}`
    const out: GHPull[] = []
    const pages = Math.ceil(max / 100)
    for (let page = 1; page <= pages; page++) {
      const res = await fetch(
        `${API}/search/issues?q=${q}&per_page=100&sort=created&order=desc&page=${page}`,
        { headers: headers(pat) },
      )
      if (!res.ok) {
        // 一条都没拿到时抛出真实原因（UI 要提示）；已有结果则保留并停止翻页，不因中途限流丢数据
        if (!out.length) {
          if (res.status === 403 || res.status === 429) {
            throw new Error('搜索限流（403）。稍后重试，或在「设置」配置 PAT 提高额度。')
          }
          if (res.status === 422) throw new Error('搜索条件无效（422）')
          throw new Error(`GitHub 搜索失败 ${res.status}`)
        }
        break
      }
      const data = (await res.json()) as { items?: SearchPullItem[] }
      const items = data.items ?? []
      if (!items.length) break
      for (const it of items) {
        // repository_url 形如 https://api.github.com/repos/{owner}/{name}
        const m = it.repository_url?.match(/\/repos\/([^/]+)\/([^/]+)$/)
        if (!m) continue
        out.push({
          repo: `${m[1]}/${m[2]}`,
          number: it.number,
          title: it.title ?? '',
          body: it.body ?? '',
          url: it.html_url,
          merged: !!it.pull_request?.merged_at,
          createdAt: it.created_at,
          closedAt: it.closed_at,
          comments: it.comments ?? 0,
        })
        if (out.length >= max) break
      }
      if (out.length >= max || items.length < 100) break
    }
    return out
  })
}

/** 单 PR 详情。失败区分「被限流」与「其它失败」：前者要停止后续批量补统计，后者只是这一条没有。 */
async function fetchPullDetailRaw(
  repo: string,
  num: number,
  pat: string,
): Promise<{ detail: GHPullDetail | null; rateLimited: boolean }> {
  const [owner, name] = repo.split('/')
  if (!owner || !name) return { detail: null, rateLimited: false }
  const res = await fetch(
    `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls/${num}`,
    { headers: headers(pat) },
  )
  if (!res.ok) return { detail: null, rateLimited: res.status === 403 || res.status === 429 }
  const d = (await res.json()) as {
    title?: string; body?: string | null; html_url?: string; state?: string; created_at?: string
    additions?: number; deletions?: number; changed_files?: number
    merged?: boolean; comments?: number; review_comments?: number
  }
  return {
    detail: {
      title: d.title ?? '',
      body: d.body ?? '',
      url: d.html_url ?? `https://github.com/${repo}/pull/${num}`,
      state: d.state ?? '',
      createdAt: d.created_at ?? '',
      additions: d.additions ?? 0,
      deletions: d.deletions ?? 0,
      changedFiles: d.changed_files ?? 0,
      merged: !!d.merged,
      comments: d.comments ?? 0,
      reviewComments: d.review_comments ?? 0,
    },
    rateLimited: false,
  }
}

/** 取单个 PR 详情（带 memo）。供 AI 工具按需精查某一条 PR。 */
export async function getPullDetail(repo: string, num: number, pat: string): Promise<GHPullDetail> {
  const key = `pullstats:${repo}#${num}`
  const hit = pullCache.get(key)
  if (hit && Date.now() - hit.at < PULL_TTL) return hit.v as GHPullDetail
  const { detail, rateLimited } = await fetchPullDetailRaw(repo, num, pat)
  if (!detail) throw new Error(rateLimited ? 'GitHub 限流（403）' : `PR ${repo}#${num} 详情获取失败`)
  pullCache.set(key, { at: Date.now(), v: detail })
  return detail
}

/** 给前 limit 条 PR 补代码量统计（返回新数组）。
 *  匿名时 core 限额只有 60/h，故调用方按有无 PAT 给不同上限；并发封顶 6，别把限额打爆。
 *  中途被限流就停止补、保留已拿到的——**绝不能因为补统计失败而丢 PR**。 */
export async function attachPullStats(pulls: GHPull[], pat: string, limit: number): Promise<GHPull[]> {
  const n = Math.max(0, Math.min(limit, pulls.length))
  if (!n) return pulls.slice()
  const out = pulls.slice()
  const CONC = 6
  let stopped = false
  for (let i = 0; i < n && !stopped; i += CONC) {
    const hi = Math.min(i + CONC, n)
    const batch = await Promise.all(
      out.slice(i, hi).map((p) => fetchPullDetailRaw(p.repo, p.number, pat)),
    )
    batch.forEach((r, k) => {
      if (r.rateLimited) { stopped = true; return }
      if (!r.detail) return
      const idx = i + k
      out[idx] = {
        ...out[idx],
        additions: r.detail.additions,
        deletions: r.detail.deletions,
        changedFiles: r.detail.changedFiles,
        // 搜索结果里的 merged 可能滞后；详情是权威值，以它为准
        merged: r.detail.merged,
      }
    })
  }
  return out
}

/** 按有无 PAT 决定补多少条统计：core 限额匿名 60/h、带 PAT 5000/h。
 *  匿名时收紧到 5，避免把限额吃光导致后面的仓库/详情查询全线 403。 */
export function statsBudget(pat: string): number {
  return pat ? 30 : 5
}

export interface RepoContribution {
  /** "owner/name" */
  repo: string
  url: string
  /** 已合并的排在前面，其余按创建时间倒序 */
  pulls: GHPull[]
  totalPulls: number
  mergedCount: number
  additions: number
  deletions: number
  /** 有代码量统计的 PR 条数：additions/deletions 只对这部分求和，展示时要标注基数 */
  statsCount: number
  firstAt: string
  lastAt: string
}

/** 按仓库聚合 PR。纯函数（无网络、无 DOM），便于单独验证。 */
export function groupPullsByRepo(pulls: GHPull[]): RepoContribution[] {
  const byRepo = new Map<string, GHPull[]>()
  for (const p of pulls) {
    const arr = byRepo.get(p.repo)
    if (arr) arr.push(p)
    else byRepo.set(p.repo, [p])
  }
  const out: RepoContribution[] = []
  for (const [repo, list] of byRepo) {
    const sorted = list.slice().sort((a, b) => {
      if (a.merged !== b.merged) return a.merged ? -1 : 1
      return b.createdAt.localeCompare(a.createdAt)
    })
    const times = list.map((p) => p.createdAt).sort()
    const withStats = list.filter((p) => p.additions !== undefined)
    out.push({
      repo,
      url: `https://github.com/${repo}`,
      pulls: sorted,
      totalPulls: list.length,
      mergedCount: list.filter((p) => p.merged).length,
      additions: withStats.reduce((s, p) => s + (p.additions ?? 0), 0),
      deletions: withStats.reduce((s, p) => s + (p.deletions ?? 0), 0),
      statsCount: withStats.length,
      firstAt: times[0] ?? '',
      lastAt: times[times.length - 1] ?? '',
    })
  }
  // 合并数多的排前面——那是最有说服力的素材；同分按 PR 总数
  return out.sort((a, b) => b.mergedCount - a.mergedCount || b.totalPulls - a.totalPulls)
}
