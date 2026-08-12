/**
 * GitHubImportDialog：从 GitHub 导入项目
 *
 * 输入用户名（+ 可选 PAT，存 settingsStore）→ 列仓 → 勾选 → 取详情 → 转 ProjectItem 合并。
 */
import { useState } from 'react'
import { clsx } from 'clsx'
import type { ProjectItem, Locale } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import { uid } from '@/schema/defaults'
import { listAllRepos, getRepoDetail, type GHRepo } from './client'
import { Overlay } from '@/importers/ImportDialog'

export function GitHubImportDialog({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState('')
  const [useMine, setUseMine] = useState(false)
  const [pat, setPat] = useState(useSettingsStore.getState().githubPAT)
  const [repos, setRepos] = useState<GHRepo[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [myLogin, setMyLogin] = useState('') // PAT 模式下认证用户的 login，用于判断 own/contrib
  const locale = useUIStore((s) => s.locale)
  const setGithubPAT = useSettingsStore((s) => s.setGithubPAT)
  const merge = useResumeStore((s) => s.update)

  const load = async () => {
    setBusy(true); setErr(''); setRepos([]); setSelected(new Set())
    try {
      setGithubPAT(pat) // 持久化 PAT
      let login = ''
      if (useMine && pat) {
        // 拿认证用户名以判断 own/contrib + 作为贡献搜索的 author
        try {
          const u = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' } })
          if (u.ok) login = (await u.json()).login
        } catch { /* ignore */ }
        setMyLogin(login)
      } else {
        setMyLogin('')
      }
      const target = useMine ? login : username.trim()
      if (!target) { setErr('请填用户名或勾选用 PAT 列我的仓库'); return }
      // 统一入口：own + org + contributed(PR)，覆盖各种贡献方式
      const list = await listAllRepos(target, pat)
      setRepos(list)
      if (!list.length) setErr('没有可见仓库')
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

  const doImport = async () => {
    setBusy(true); setErr('')
    try {
      const picks = repos.filter((r) => selected.has(r.id))
      const ownerLogin = useMine ? myLogin : username.trim()
      const items: ProjectItem[] = []
      for (const r of picks) {
        const detail = await getRepoDetail(r, pat)
        const isOwn = ownerLogin ? r.owner?.login?.toLowerCase() === ownerLogin.toLowerCase() : true
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
        if (sec) sec.items.push(...(items as never[]))
        else d.sections.push({
          id: uid('sec'), type: 'projects', title: { zh: '开发项目', en: 'Projects' },
          layout: 'main', items: items as never[], visible: true,
        })
      })
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="w-[640px] max-w-[94vw] max-h-[88vh] overflow-hidden bg-white rounded-lg shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-chrome-border">
          <h2 className="text-base font-semibold">从 GitHub 导入项目</h2>
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
              className="w-full px-2.5 py-1.5 text-sm border border-chrome-border rounded"
              placeholder="GitHub 用户名，如 octocat"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}
          <input
            type="password"
            className="w-full px-2.5 py-1.5 text-sm border border-chrome-border rounded"
            placeholder="Personal Access Token（可选，提高限流并读私有仓；仅存本机）"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
          />
          <p className="text-[11px] text-chrome-muted leading-relaxed">
            {useMine
              ? '将列出你拥有的、参与贡献的、以及所属组织的仓库（affiliation 全覆盖）。'
              : '将列出该用户的公开仓库 + 其所属组织的公开仓库。贡献过的他人仓库需用 PAT 查自己。'}
          </p>
          <button
            className="px-3 py-1.5 text-sm bg-chrome-ink text-white rounded hover:bg-black disabled:opacity-50"
            onClick={load}
            disabled={busy || (!useMine && !username.trim())}
          >
            {busy ? '加载中…' : '列出仓库'}
          </button>
          {err && <div className="text-sm text-red-600">{err}</div>}

          {/* 列表 */}
          {repos.length > 0 && (
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
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-chrome-border">
          <button className="px-3 py-1.5 text-sm border border-chrome-border rounded hover:bg-chrome-bg" onClick={onClose}>取消</button>
          <button
            className={clsx('px-3 py-1.5 text-sm rounded', selected.size ? 'bg-chrome-ink text-white hover:bg-black' : 'bg-chrome-ink text-white opacity-50')}
            onClick={doImport}
            disabled={!selected.size || busy}
          >
            导入 {selected.size || ''} 个项目
          </button>
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
