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

/** 列出用户相关仓库：自己的 + 所属组织的（无 PAT 也能查任意公开用户）。
 *  组织仓库通过 /users/{u}/orgs → /orgs/{org}/repos 获取。
 *  去重后按 star 降序。 */
export async function listUserRepos(username: string, pat: string): Promise<GHRepo[]> {
  const u = encodeURIComponent(username)
  // 1) 自己的仓库
  const ownRes = await fetch(`${API}/users/${u}/repos?per_page=100&sort=updated`, { headers: headers(pat) })
  if (ownRes.status === 404) throw new Error(`用户 ${username} 不存在`)
  if (!ownRes.ok) {
    if (ownRes.status === 403) throw new Error('GitHub 限流或 PAT 无效（403）。可稍后重试或填入有效 PAT。')
    throw new Error(`GitHub API ${ownRes.status}`)
  }
  const own = (await ownRes.json()) as GHRepo[]

  // 2) 所属组织 → 每个组织的仓库
  let orgRepos: GHRepo[] = []
  try {
    const orgsRes = await fetch(`${API}/users/${u}/orgs?per_page=100`, { headers: headers(pat) })
    if (orgsRes.ok) {
      const orgs = (await orgsRes.json()) as { login: string }[]
      // 并行拉每个组织仓库
      const results = await Promise.all(
        orgs.map((o) =>
          fetch(`${API}/orgs/${encodeURIComponent(o.login)}/repos?per_page=100&sort=updated`, { headers: headers(pat) })
            .then((r) => (r.ok ? (r.json() as Promise<GHRepo[]>) : []))
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
 *  含 owner(自己的) + collaborator(参与贡献的) + organization_member(所属组织的)。
 *  affiliation 参数一把覆盖"参与/贡献/组织"三类。 */
export async function listMyRepos(pat: string): Promise<GHRepo[]> {
  if (!pat) throw new Error('列出自己的仓库需要 PAT')
  const res = await fetch(
    `${API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
    { headers: headers(pat) },
  )
  if (!res.ok) throw new Error(`GitHub API ${res.status}（PAT 可能无效）`)
  const data = (await res.json()) as GHRepo[]
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

export async function getRepoDetail(repo: GHRepo, pat: string): Promise<GHRepoDetail> {
  const owner = repo.full_name.split('/')[0]
  const name = repo.name
  // languages：返回 { "Python": 12345, ... }
  const langRes = await fetch(`${API}/repos/${owner}/${name}/languages`, { headers: headers(pat) })
  const langData = langRes.ok ? ((await langRes.json()) as Record<string, number>) : {}
  const languages = Object.keys(langData)

  // readme（base64 或直接 json，API 返回 base64 content）
  let readme = ''
  try {
    const rmRes = await fetch(`${API}/repos/${owner}/${name}/readme`, { headers: headers(pat) })
    if (rmRes.ok) {
      const rm = (await rmRes.json()) as { content?: string; encoding?: string }
      if (rm.content) {
        readme = rm.encoding === 'base64' ? atob(rm.content.replace(/\n/g, '')) : rm.content
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

/** 搜某用户提过的 PR，去重得到贡献过的仓库 owner/name 列表 */
export async function searchContributedRepos(username: string, pat: string): Promise<ContributedRepo[]> {
  const u = encodeURIComponent(username)
  const seen = new Set<string>()
  let page = 1
  for (let i = 0; i < 10; i++) {
    const res = await fetch(
      `${API}/search/issues?q=author:${u}+type:pr&per_page=100&sort=created&order=desc&page=${page}`,
      { headers: headers(pat) },
    )
    if (!res.ok) {
      if (res.status === 403) throw new Error('搜索限流（403），稍后重试')
      break // 搜索失败不阻塞主流程
    }
    const data = (await res.json()) as { items?: { repository_url?: string }[] }
    const items = data.items ?? []
    if (!items.length) break
    for (const it of items) {
      // repository_url 形如 https://api.github.com/repos/{owner}/{name}
      const m = it.repository_url?.match(/\/repos\/([^/]+)\/([^/]+)$/)
      if (m) seen.add(`${m[1]}/${m[2]}`)
    }
    if (items.length < 100) break
    page++
  }
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
 *  - username 非空（useMine 时从 /user 取）→ own/org 走 listUserRepos 逻辑 + 贡献搜索
 *  - pat 为空时贡献搜索受 60/h 限流，但仍尝试 */
export async function listAllRepos(username: string, pat: string): Promise<GHRepo[]> {
  // 1) own + org（复用 listUserRepos 的拉取）
  let ownAndOrg: GHRepo[] = []
  if (username) {
    try {
      ownAndOrg = await listUserRepos(username, pat)
    } catch { /* 用户名查失败时仍尝试贡献搜索 */ }
  }
  // 2) contributed（PR）
  let contrib: GHRepo[] = []
  try {
    const contributed = await searchContributedRepos(username, pat)
    // 并行取每个仓库详情（过滤掉已在 ownAndOrg 的）
    const existing = new Set(ownAndOrg.map((r) => r.full_name.toLowerCase()))
    const toFetch = contributed.filter((c) => !existing.has(`${c.owner}/${c.name}`.toLowerCase()))
    contrib = (await Promise.all(
      toFetch.map((c) => getRepoByName(c.owner, c.name, pat).catch(() => null)),
    )).filter((r): r is GHRepo => !!r && !r.fork && !r.archived)
  } catch { /* 贡献搜索失败不阻塞 */ }

  const map = new Map<number, GHRepo>()
  for (const r of [...ownAndOrg, ...contrib]) map.set(r.id, r)
  return [...map.values()].sort((a, b) => b.stargazers_count - a.stargazers_count)
}
