/**
 * JD 关键词匹配度（CopilotPanel quickMode 'jdmatch'）
 *
 * 贴岗位描述（JD）→ AI 提取关键词并与简历对比 → 展示匹配% + 命中/缺失词 chips。
 * 可选"把缺失词加入 meta.keywords"，写回 store（保留另一语言，按当前语种追加）。
 */
import { useState } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import { t } from '@/i18n'
import type { JDProposal } from '@/types/ai'
import type { Localized } from '@/types/resume'
import { analyzeJD } from './features'

export function JDMatchAction() {
  const resume = useResumeStore((s) => s.current)!
  const locale = useUIStore((s) => s.locale)
  const update = useResumeStore((s) => s.update)
  const cfg = useSettingsStore((s) => s.ai)

  const [jd, setJd] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [prop, setProp] = useState<JDProposal | null>(null)
  const [added, setAdded] = useState(false)

  const run = async () => {
    setBusy(true); setErr(''); setProp(null); setAdded(false)
    try {
      if (!cfg.apiKey) throw new Error(t('jdNoKey', locale))
      if (!jd.trim()) throw new Error(locale === 'zh' ? '请粘贴岗位描述' : 'Please paste a job description')
      const p = await analyzeJD(cfg, jd, resume, locale)
      setProp(p)
    } catch (e) { setErr(`${t('jdErr', locale)}${(e as Error).message}`) } finally { setBusy(false) }
  }

  const addMissing = () => {
    if (!prop?.missing.length) return
    update((d) => {
      // 把缺失词按当前语种追加进 meta.keywords，保留已有词与另一语言。
      const existing = d.meta.keywords ?? []
      const existingCur = new Set(existing.map((k) => (k[locale] ?? '').toLowerCase()))
      const toAdd = prop.missing.filter((w) => !existingCur.has(w.toLowerCase()))
      if (toAdd.length) {
        d.meta.keywords = [...existing, ...toAdd.map((w) => ({ [locale]: w } as Localized))]
      }
    })
    setAdded(true)
  }

  const scoreColor = (s: number) => (s >= 75 ? 'text-green-400' : s >= 50 ? 'text-amber-400' : 'text-red-400')

  return (
    <div className="space-y-2.5">
      <textarea
        className="w-full text-xs p-2 border border-copilot-border rounded bg-copilot-surface text-copilot-ink focus:outline-none focus:border-copilot-accent resize-none"
        rows={5}
        placeholder={t('jdPaste', locale)}
        value={jd}
        onChange={(e) => setJd(e.target.value)}
      />
      <button
        className="w-full px-3 py-1.5 text-xs font-semibold bg-copilot-accent text-white rounded hover:opacity-90 disabled:opacity-40"
        onClick={run}
        disabled={busy || !jd.trim()}
      >
        {busy ? t('jdAnalyzing', locale) : t('jdAnalyze', locale)}
      </button>
      {err && <div className="text-xs text-red-400">{err}</div>}
      {prop && (
        <div className="space-y-2.5">
          {/* 匹配度大号数字 */}
          <div className="flex items-center gap-3 p-2.5 rounded bg-copilot-surface border border-copilot-border">
            <span className={`text-3xl font-bold ${scoreColor(prop.score)}`}>{prop.score}%</span>
            <span className="text-[11px] text-copilot-muted">{t('jdScore', locale)}</span>
          </div>
          {/* 命中关键词 */}
          {prop.matched.length > 0 && (
            <div>
              <div className="text-[11px] text-copilot-muted mb-1">{t('jdMatched', locale)}（{prop.matched.length}）</div>
              <div className="flex flex-wrap gap-1">
                {prop.matched.map((k, i) => (
                  <span key={i} className="px-1.5 py-0.5 text-[11px] rounded bg-green-900/40 text-green-300 border border-green-800/40">{k}</span>
                ))}
              </div>
            </div>
          )}
          {/* 缺失关键词 */}
          {prop.missing.length > 0 && (
            <div>
              <div className="text-[11px] text-copilot-muted mb-1">{t('jdMissing', locale)}（{prop.missing.length}）</div>
              <div className="flex flex-wrap gap-1">
                {prop.missing.map((k, i) => (
                  <span key={i} className="px-1.5 py-0.5 text-[11px] rounded bg-red-900/40 text-red-300 border border-red-800/40">{k}</span>
                ))}
              </div>
              <button
                className="mt-2 w-full px-2 py-1 text-[11px] border border-copilot-border rounded text-copilot-muted hover:text-copilot-ink hover:bg-copilot-surface disabled:opacity-40"
                onClick={addMissing}
                disabled={added}
              >
                {added ? (locale === 'zh' ? '已加入' : 'Added') : t('jdAddKeywords', locale)}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
