/**
 * GitHubImportDialog：从 GitHub 导入项目
 *
 * 两种模式：
 *  - 仓库：输入用户名（+ 可选 PAT，存 settingsStore）→ 列仓 → 勾选 → 取详情 → 转 ProjectItem 合并。
 *  - PR 贡献：搜用户提交过的 PR → 按仓库分组勾选 → 转要点合并（已存在的仓库**追加**要点）。
 *    PR 模式解决的是「README 只能说明项目是什么，说明不了我做了什么」——要点取材自 PR 标题本身。
 */
import { useState } from 'react'
import { clsx } from 'clsx'
import type { ProjectItem, Localized, Locale } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import { uid } from '@/schema/defaults'
import {
  listAllRepos, getRepoDetail, getAuthLogin, getRepoByName, getRepoLanguages,
  searchAuthoredPulls, attachPullStats, statsBudget, groupPullsByRepo,
  type GHRepo, type GHPull, type RepoContribution,
} from './client'
import { planPullImport, normRepoUrl, formatLines, type PullRepoMeta } from './pullImport'
import { Overlay } from '@/importers/ImportDialog'

const pullKey = (p: GHPull) => `${p.repo}#${p.number}`

export function GitHubImportDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'repos' | 'pulls'>('repos')
  const [username, setUsername] = useState('')
  const [useMine, setUseMine] = useState(false)
  const [pat, setPat] = useState(useSettingsStore.getState().githubPAT)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [myLogin, setMyLogin] = useState('') // PAT 模式下认证用户的 login，用于判断 own/contrib
  const locale = useUIStore((s) => s.locale)
  const setGithubPAT = useSettingsStore((s) => s.setGithubPAT)
  const merge = useResumeStore((s) => s.update)

  // 仓库模式
  const [repos, setRepos] = useState<GHRepo[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // PR 模式
  const [pulls, setPulls] = useState<GHPull[]>([])
  const [groups, setGroups] = useState<RepoContribution[]>([])
  const [pickedPulls, setPickedPulls] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [includeStats, setIncludeStats] = useState(true)

  /** 解析出本次要查询的 author：PAT 模式用认证 login，否则用输入的用户名 */
  const resolveAuthor = async (): Promise<string> => {
    setGithubPAT(pat) // 持久化 PAT
    let login = ''
    if (useMine && pat) {
      login = await getAuthLogin(pat)
      if (!login) { setErr('PAT 无效或已过期，拿不到认证用户'); return '' }
    }
    setMyLogin(login)
    const target = useMine ? login : username.trim()
    if (!target) { setErr('请填用户名或勾选用 PAT 列我的仓库'); return '' }
    return target
  }

  const loadRepos = async () => {
    setBusy(true); setErr(''); setRepos([]); setSelected(new Set())
    try {
      setGithubPAT(pat)
      let login = ''
      if (useMine && pat) {
        login = await getAuthLogin(pat)
        setMyLogin(login)
      } else {
        setMyLogin('')
      }
      const target = useMine ? login : username.trim()
      if (!target && !(useMine && pat)) { setErr('请填用户名或勾选用 PAT 列我的仓库'); return }
      // 统一入口：own + org + contributed(PR)，覆盖各种贡献方式。
      // useMine+PAT 时走 /user/repos（含私有仓 + collaborator + 组织成员），贡献搜索以认证 login 为 author。
      const list = await listAllRepos(username.trim(), pat, useMine, login)
      setRepos(list)
      if (!list.length) setErr(useMine ? '没有可见仓库（或 PAT 无权限 / 被限流）' : '没有可见仓库')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const loadPulls = async () => {
    setBusy(true); setErr(''); setPulls([]); setGroups([]); setPickedPulls(new Set())
    try {
      const author = await resolveAuthor()
      if (!author) return
      const found = await searchAuthoredPulls(author, pat)
      if (!found.length) { setErr('没有找到该用户提交的 PR'); return }
      // 代码量统计要逐条打详情，按有无 PAT 限额；超限部分只是没有行数，不影响列出与勾选
      const withStats = await attachPullStats(found, pat, statsBudget(pat))
      setPulls(withStats)
      setGroups(groupPullsByRepo(withStats))
      // 默认只勾已合并的：简历上更可信，避免用户误把未落地的工作写进去
      setPickedPulls(new Set(withStats.filter((p) => p.merged).map(pullKey)))
      setCollapsed(new Set())
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: number) => {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const togglePull = (key: string) => {
    setPickedPulls((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }

  const toggleGroup = (g: RepoContribution) => {
    setPickedPulls((s) => {
      const n = new Set(s)
      const keys = g.pulls.map(pullKey)
      const allOn = keys.every((k) => n.has(k))
      for (const k of keys) { if (allOn) n.delete(k); else n.add(k) }
      return n
    })
  }

  const doImport = async () => {
    setBusy(true); setErr('')
    try {
      const picks = repos.filter((r) => selected.has(r.id))
      const ownerLogin = useMine ? myLogin : username.trim()
      const items: ProjectItem[] = []
      for (const r of picks) {
        const detail = await getRepoDetail(r, pat)
        // 仅当确知 ownerLogin 且匹配时才标 own；拿不到 login（/user 失败）时标 contrib，避免误标
        const isOwn = !!ownerLogin && r.owner?.login?.toLowerCase() === ownerLogin.toLowerCase()
        items.push({
          id: uid('proj'),
          name: { zh: r.name, en: r.name },
          description: { [locale]: r.description || summarizeReadme(detail.readme) } as { zh?: string; en?: string },
          url: r.homepage || r.html_url,
          repoUrl: r.html_url,
          keywords: [...detail.languages, ...detail.topics].slice(0, 12),
          stars: detail.stars,
          languages: detail.languages,
          highlights: readmeToHighlights(detail.readme, locale),
          badge: 'oss',
          kind: isOwn ? 'own' : 'contrib',
        })
      }
      merge((d) => {
        const sec = d.sections.find((s) => s.type === 'projects')
        // 按 repoUrl 去重，避免重复导入同一仓库产生重复条目
        const existing = new Set((sec?.items as { repoUrl?: string }[] | undefined)?.map((it) => it.repoUrl).filter(Boolean) ?? [])
        const fresh = items.filter((it) => !it.repoUrl || !existing.has(it.repoUrl))
        if (sec) sec.items.push(...(fresh as never[]))
        else if (fresh.length) d.sections.push({
          id: uid('sec'), type: 'projects', title: { zh: '开发项目', en: 'Projects' },
          layout: 'main', items: fresh as never[], visible: true,
        })
      })
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doImportPulls = async () => {
    setBusy(true); setErr('')
    try {
      const picked = pulls.filter((p) => pickedPulls.has(pullKey(p)))
      if (!picked.length) { setErr('请先勾选要导入的 PR'); return }
      const sec = useResumeStore.getState().current?.sections.find((s) => s.type === 'projects')
      const existing = (sec?.items ?? []) as ProjectItem[]
      const existingUrls = new Set(existing.map((it) => normRepoUrl(it.repoUrl)).filter(Boolean))
      // 只为「会新建」的仓库拉详情：已存在的条目只追加要点，不碰它的描述/关键词（那可能是用户手改过的）
      const needMeta = [...new Set(picked.map((p) => p.repo))]
        .filter((r) => !existingUrls.has(normRepoUrl(`https://github.com/${r}`)))
      const meta: Record<string, PullRepoMeta> = {}
      await Promise.all(needMeta.map(async (full) => {
        const [owner, name] = full.split('/')
        try {
          const [repo, languages] = await Promise.all([
            getRepoByName(owner, name, pat),
            getRepoLanguages(owner, name, pat),
          ])
          if (repo) {
            meta[full] = {
              description: repo.description, homepage: repo.homepage, htmlUrl: repo.html_url,
              languages, topics: repo.topics ?? [], stars: repo.stargazers_count,
            }
          }
        } catch { /* 拿不到详情也能导入：只是没有语言/stars，要点不受影响 */ }
      }))

      const ownerLogin = useMine ? myLogin : username.trim()
      const plan = planPullImport(picked, existing, { locale, ownerLogin, includeStats, meta })

      merge((d) => {
        let target = d.sections.find((s) => s.type === 'projects')
        if (!target && plan.create.length) {
          target = {
            id: uid('sec'), type: 'projects', title: { zh: '开发项目', en: 'Projects' },
            layout: 'main', items: [], visible: true,
          } as never
          d.sections.push(target as never)
        }
        if (!target) return
        target.items.push(...(plan.create as never[]))
        for (const a of plan.append) {
          const it = target.items.find((x) => (x as { id: string }).id === a.itemId) as { highlights?: Localized[] } | undefined
          if (it) it.highlights = [...(it.highlights ?? []), ...a.highlights]
        }
      })
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pickedCount = pickedPulls.size
  const pickedRepoCount = new Set(pulls.filter((p) => pickedPulls.has(pullKey(p))).map((p) => p.repo)).size
  // 一条统计都没补到（匿名限额用尽/全部失败）时不显示这个开关，免得勾了没效果
  const hasStats = pulls.some((p) => p.additions !== undefined)
  const isPulls = mode === 'pulls'

  return (
    <Overlay onClose={onClose}>
      <div className="w-[640px] max-w-[94vw] max-h-[88vh] overflow-hidden bg-white rounded-lg shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-chrome-border">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">从 GitHub 导入</h2>
            <div className="flex items-center bg-chrome-bg rounded border border-chrome-border">
              {([['repos', '仓库'], ['pulls', 'PR 贡献']] as const).map(([m, label]) => (
                <button
                  key={m}
                  className={clsx('px-2.5 py-1 text-xs font-semibold', mode === m ? 'bg-chrome-ink text-chrome-bg' : 'text-chrome-muted')}
                  onClick={() => { setMode(m); setErr('') }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button className="text-chrome-muted hover:text-chrome-ink" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 输入 */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={useMine} onChange={(e) => setUseMine(e.target.checked)} />
              用 PAT 列我的仓库
            </label>
          </div>
          {!useMine && (
            <input
              className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded"
              placeholder="GitHub 用户名，如 octocat"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}
          <input
            type="password"
            className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded"
            placeholder="Personal Access Token（可选，提高限流并读私有仓；仅存本机）"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
          />
          <p className="text-[11px] text-chrome-muted leading-relaxed">
            {isPulls
              ? '搜出该用户提交过的 Pull Request（含未合并），按仓库分组。导入后要点取材自 PR 标题——这才是「你做了什么」的证据；已存在的项目条目会追加要点而非新增重复项目。'
              : useMine
                ? '将列出你拥有的、参与贡献的、以及所属组织的仓库（affiliation 全覆盖）。'
                : '将列出该用户的公开仓库 + 其所属组织的公开仓库。贡献过的他人仓库需用 PAT 查自己。'}
          </p>
          <button
            className="px-3 py-1.5 text-sm bg-chrome-ink text-chrome-bg rounded hover:bg-black disabled:opacity-50"
            onClick={isPulls ? loadPulls : loadRepos}
            disabled={busy || (!useMine && !username.trim())}
          >
            {busy ? '加载中…' : isPulls ? '搜索 PR' : '列出仓库'}
          </button>
          {err && <div className="text-sm text-red-600">{err}</div>}

          {/* 仓库列表 */}
          {!isPulls && repos.length > 0 && (
            <div className="border border-chrome-border rounded divide-y divide-chrome-border max-h-[50vh] overflow-y-auto">
              {repos.map((r) => (
                <label key={r.id} className="flex items-start gap-3 p-2.5 hover:bg-chrome-bg cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{r.name}</span>
                      <span className="text-[11px] text-chrome-muted">★ {r.stargazers_count}</span>
                      {r.language && <span className="text-[11px] text-chrome-muted">· {r.language}</span>}
                    </div>
                    {r.description && <div className="text-xs text-chrome-muted mt-0.5 line-clamp-2">{r.description}</div>}
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* PR 分组列表 */}
          {isPulls && groups.length > 0 && (
            <div className="border border-chrome-border rounded max-h-[50vh] overflow-y-auto divide-y divide-chrome-border">
              {groups.map((g) => {
                const isCollapsed = collapsed.has(g.repo)
                const keys = g.pulls.map(pullKey)
                const on = keys.filter((k) => pickedPulls.has(k)).length
                return (
                  <div key={g.repo}>
                    <div className="flex items-center gap-2 px-2.5 py-2 bg-chrome-bg">
                      <input
                        type="checkbox"
                        checked={on === keys.length && keys.length > 0}
                        ref={(el) => { if (el) el.indeterminate = on > 0 && on < keys.length }}
                        onChange={() => toggleGroup(g)}
                      />
                      <button
                        className="flex-1 min-w-0 text-left"
                        onClick={() => setCollapsed((s) => {
                          const n = new Set(s)
                          if (n.has(g.repo)) n.delete(g.repo); else n.add(g.repo)
                          return n
                        })}
                      >
                        <span className="text-[11px] text-chrome-muted mr-1">{isCollapsed ? '▸' : '▾'}</span>
                        <span className="text-sm font-semibold">{g.repo}</span>
                        <span className="text-[11px] text-chrome-muted ml-2">
                          {g.totalPulls} 个 PR · 已合并 {g.mergedCount}
                          {g.statsCount > 0 && (
                            <> · 合计 <span className="text-green-700">+{formatLines(g.additions)}</span> / <span className="text-red-600">−{formatLines(g.deletions)}</span> 行</>
                          )}
                        </span>
                      </button>
                    </div>
                    {!isCollapsed && g.pulls.map((p) => (
                      <label key={pullKey(p)} className="flex items-start gap-3 pl-7 pr-2.5 py-2 hover:bg-chrome-bg cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={pickedPulls.has(pullKey(p))}
                          onChange={() => togglePull(pullKey(p))}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-chrome-ink break-words">{p.title || `#${p.number}`}</div>
                          <div className="text-[11px] text-chrome-muted mt-0.5">
                            <span className={p.merged ? 'text-green-700' : ''}>{p.merged ? '已合并' : '未合并'}</span>
                            <span> · #{p.number} · {p.createdAt.slice(0, 10)}</span>
                            {p.additions !== undefined && (
                              <span> · +{formatLines(p.additions)} / −{formatLines(p.deletions ?? 0)} · {p.changedFiles} 文件</span>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {isPulls && hasStats && (
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={includeStats} onChange={(e) => setIncludeStats(e.target.checked)} />
              附带代码量统计（新建的项目条目，要点首位加一行「贡献 N 个已合并 PR，累计 +x / −y 行」）
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-chrome-border">
          <button className="px-3 py-1.5 text-sm border border-chrome-border rounded hover:bg-chrome-bg" onClick={onClose}>取消</button>
          {isPulls ? (
            <button
              className={clsx('px-3 py-1.5 text-sm rounded bg-chrome-ink text-chrome-bg', pickedCount && !busy ? 'hover:bg-black' : 'opacity-50')}
              onClick={doImportPulls}
              disabled={!pickedCount || busy}
            >
              导入选中的 {pickedCount || ''} 个 PR{pickedRepoCount ? `（${pickedRepoCount} 个仓库）` : ''}
            </button>
          ) : (
            <button
              className={clsx('px-3 py-1.5 text-sm rounded bg-chrome-ink text-chrome-bg', selected.size && !busy ? 'hover:bg-black' : 'opacity-50')}
              onClick={doImport}
              disabled={!selected.size || busy}
            >
              导入 {selected.size || ''} 个项目
            </button>
          )}
        </div>
      </div>
    </Overlay>
  )
}

function summarizeReadme(readme: string): string {
  const firstPara = readme.split(/\n\s*\n/).find((p) => p.trim() && !p.startsWith('#') && !p.startsWith('!')) || ''
  return firstPara.replace(/[`*#>\-\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140)
}

function readmeToHighlights(readme: string, locale: Locale): { zh?: string; en?: string }[] {
  // 提取 "## Features" / "## 特性" 段落的 bullet
  const m = readme.match(/##\s*(Features|特性|亮点|Highlights)[\s\S]*?(?=\n##|$)/i)
  if (!m) return []
  const bullets = m[0].split('\n')
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, '').replace(/[`*]/g, '').trim())
    .filter(Boolean)
    .slice(0, 4)
  return bullets.map((b) => ({ [locale]: b } as { zh?: string; en?: string }))
}
