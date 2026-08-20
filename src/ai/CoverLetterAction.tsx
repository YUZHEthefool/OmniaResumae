/**
 * 求职信生成（CopilotPanel quickMode 'cover'）
 *
 * 输入目标公司 + JD → AI 基于当前简历生成求职信 → 渲染 Markdown + 复制/下载。
 * 纯文本产出，不写回 store（求职信不是简历字段）。
 */
import { useState } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import { t } from '@/i18n'
import type { CoverLetterProposal } from '@/types/ai'
import { generateCoverLetter } from './features'
import { renderMarkdown } from './markdown'
import { copyText } from '@/utils/clipboard'
import { slugify } from '@/utils/slug'

export function CoverLetterAction() {
  const resume = useResumeStore((s) => s.current)!
  const locale = useUIStore((s) => s.locale)
  const cfg = useSettingsStore((s) => s.ai)

  const [company, setCompany] = useState('')
  const [jd, setJd] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [prop, setProp] = useState<CoverLetterProposal | null>(null)
  const [copied, setCopied] = useState(false)

  const run = async () => {
    setBusy(true); setErr(''); setProp(null); setCopied(false)
    try {
      if (!cfg.apiKey) throw new Error(t('coverNoKey', locale))
      if (!company.trim()) throw new Error(t('coverNoCompany', locale))
      const p = await generateCoverLetter(cfg, resume, company, jd, locale)
      setProp(p)
    } catch (e) { setErr(`${t('coverErr', locale)}${(e as Error).message}`) } finally { setBusy(false) }
  }

  const doCopy = async () => {
    if (!prop) return
    const ok = await copyText(prop.body)
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500) }
  }

  const doDownload = () => {
    if (!prop) return
    const blob = new Blob([prop.body], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slugify(company) || 'cover-letter'}.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="space-y-2.5">
      <input
        className="w-full text-xs p-1.5 border border-copilot-border rounded bg-copilot-surface text-copilot-ink placeholder:text-copilot-dim focus:outline-none focus:border-copilot-accent"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        placeholder={t('coverCompany', locale)}
      />
      <textarea
        className="w-full h-24 text-xs p-1.5 border border-copilot-border rounded bg-copilot-surface text-copilot-ink placeholder:text-copilot-dim resize-none focus:outline-none focus:border-copilot-accent"
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        placeholder={t('coverJd', locale)}
      />
      <button
        className="w-full px-3 py-1.5 text-xs font-semibold bg-copilot-accent text-white rounded hover:opacity-90 disabled:opacity-40"
        onClick={run}
        disabled={busy || !company.trim()}
      >
        {busy ? t('coverGenerating', locale) : t('coverGenerate', locale)}
      </button>
      {err && <div className="text-xs text-red-400">{err}</div>}
      {prop && (
        <div className="space-y-2">
          <div
            className="text-xs text-copilot-ink leading-relaxed markdown-body border border-copilot-border rounded p-2.5 bg-copilot-surface max-h-[50vh] overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(prop.body) }}
          />
          <div className="flex gap-1.5">
            <button
              className="flex-1 px-3 py-1.5 text-xs font-semibold bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-40"
              onClick={doCopy}
              disabled={copied}
            >
              {copied ? t('coverCopied', locale) : t('coverCopy', locale)}
            </button>
            <button
              className="flex-1 px-3 py-1.5 text-xs border border-copilot-border rounded text-copilot-muted hover:text-copilot-ink hover:bg-copilot-surface"
              onClick={doDownload}
            >
              {t('coverDownload', locale)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
