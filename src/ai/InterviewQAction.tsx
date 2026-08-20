/**
 * 面试问答准备（CopilotPanel quickMode 'interview'）
 *
 * 输入目标岗位 → AI 基于当前简历生成面试题 + 答题要点 → 列表展示 + 复制全部。
 * 纯文本产出，不写回 store。
 */
import { useState } from 'react'
import { useResumeStore } from '@/store/resumeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import { t } from '@/i18n'
import type { InterviewQProposal } from '@/types/ai'
import { generateInterviewQ } from './features'
import { renderMarkdown } from './markdown'
import { copyText } from '@/utils/clipboard'

export function InterviewQAction() {
  const resume = useResumeStore((s) => s.current)!
  const locale = useUIStore((s) => s.locale)
  const cfg = useSettingsStore((s) => s.ai)

  const [jobRole, setJobRole] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [prop, setProp] = useState<InterviewQProposal | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)

  const run = async () => {
    setBusy(true); setErr(''); setProp(null); setCopied(false); setOpen(new Set())
    try {
      if (!cfg.apiKey) throw new Error(t('interviewNoKey', locale))
      if (!jobRole.trim()) throw new Error(t('interviewNoRole', locale))
      const p = await generateInterviewQ(cfg, resume, jobRole, locale)
      setProp(p)
      // 默认展开第一条
      if (p.questions.length) setOpen(new Set([0]))
    } catch (e) { setErr(`${t('interviewErr', locale)}${(e as Error).message}`) } finally { setBusy(false) }
  }

  const toggle = (i: number) =>
    setOpen((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  const doCopyAll = async () => {
    if (!prop) return
    const text = prop.questions.map((q, i) => `Q${i + 1}: ${q.q}\nA: ${q.a}`).join('\n\n')
    const ok = await copyText(text)
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500) }
  }

  return (
    <div className="space-y-2.5">
      <input
        className="w-full text-xs p-1.5 border border-copilot-border rounded bg-copilot-surface text-copilot-ink placeholder:text-copilot-dim focus:outline-none focus:border-copilot-accent"
        value={jobRole}
        onChange={(e) => setJobRole(e.target.value)}
        placeholder={t('interviewRole', locale)}
      />
      <button
        className="w-full px-3 py-1.5 text-xs font-semibold bg-copilot-accent text-white rounded hover:opacity-90 disabled:opacity-40"
        onClick={run}
        disabled={busy || !jobRole.trim()}
      >
        {busy ? t('interviewGenerating', locale) : t('interviewGenerate', locale)}
      </button>
      {err && <div className="text-xs text-red-400">{err}</div>}
      {prop && prop.questions.length > 0 && (
        <div className="space-y-2">
          {prop.questions.map((qa, i) => (
            <div key={i} className="border border-copilot-border rounded p-2 bg-copilot-surface">
              <button
                className="w-full flex items-start gap-1.5 text-left"
                onClick={() => toggle(i)}
              >
                <span className="text-[10px] text-copilot-accent font-mono mt-0.5 flex-shrink-0">Q{i + 1}</span>
                <span className="text-xs text-copilot-ink flex-1">{qa.q}</span>
                <span className="text-[10px] text-copilot-dim flex-shrink-0 mt-0.5">{open.has(i) ? '▾' : '▸'}</span>
              </button>
              {open.has(i) && (
                <div
                  className="mt-1.5 pl-5 text-[11px] text-copilot-dim leading-relaxed markdown-body"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(qa.a) }}
                />
              )}
            </div>
          ))}
          <button
            className="w-full px-3 py-1.5 text-xs font-semibold bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-40"
            onClick={doCopyAll}
            disabled={copied}
          >
            {copied ? t('coverCopied', locale) : t('interviewCopyAll', locale)}
          </button>
        </div>
      )}
    </div>
  )
}
