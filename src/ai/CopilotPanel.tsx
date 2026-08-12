/**
 * AI Copilot 右侧停靠面板
 * 用户描述需求（可选附已有材料）→ AI 生成完整简历 → 预览 → 选择「新建简历 / 覆盖当前」填入。
 * 默认收起，由 TopBar 的 Sparkles 切换钮控制（uiStore.copilotOpen）。
 * 不自动写入：只有点填入按钮才写 store，守住「AI 产出是提案」不变量。
 */
import { useRef, useState } from 'react'
import { Sparkles, PanelRightClose, Upload, X } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useResumeStore } from '@/store/resumeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { generateResume } from '@/ai/generate'
import { extractPdfText } from '@/importers/pdf'
import { t } from '@/i18n'
import { pick } from '@/types/resume'
import type { Resume } from '@/types/resume'

export function CopilotPanel() {
  const cfg = useSettingsStore((s) => s.ai)
  const locale = useUIStore((s) => s.locale)
  const setCopilotOpen = useUIStore((s) => s.setCopilotOpen)
  const create = useResumeStore((s) => s.create)
  const update = useResumeStore((s) => s.update)

  const [prompt, setPrompt] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [gen, setGen] = useState<Resume | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      if (f.name.toLowerCase().endsWith('.pdf')) setSourceText(await extractPdfText(f))
      else setSourceText(await f.text())
      setFileName(f.name)
    } catch (e2) {
      setErr((e2 as Error).message)
    }
  }

  const run = async () => {
    setErr('')
    setGen(null)
    if (!cfg.apiKey) { setErr(t('copilotNoKey', locale)); return }
    if (!prompt.trim() && !sourceText.trim()) { setErr(t('copilotNoInput', locale)); return }
    setBusy(true)
    try {
      const r = await generateResume(cfg, prompt.trim(), locale, sourceText.trim() || undefined)
      setGen(r)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const fillNew = async () => {
    if (!gen) return
    await create() // 新建空档并切为 current
    update((d) => {
      d.basics = gen.basics
      d.sections = gen.sections
      d.meta = gen.meta
      // 保留新档的 id / name / templateId / createdAt
    })
    setGen(null)
    setCopilotOpen(false)
  }

  const fillOverwrite = () => {
    if (!gen) return
    update((d) => {
      d.basics = gen.basics
      d.sections = gen.sections
      d.meta = gen.meta
      // 保留 id / name / templateId / createdAt / locale
    })
    setGen(null)
    setCopilotOpen(false)
  }

  return (
    <aside className="w-[360px] flex-shrink-0 h-full border-l border-chrome-border bg-chrome-panel flex flex-col">
      <header className="flex items-center justify-between px-3 h-10 border-b border-chrome-border">
        <h2 className="text-xs font-semibold flex items-center gap-1.5">
          <Sparkles size={14} /> {t('copilot', locale)}
        </h2>
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-chrome-muted hover:text-chrome-ink hover:bg-chrome-bg"
          onClick={() => setCopilotOpen(false)}
          title={locale === 'zh' ? '收起' : 'Close'}
        >
          <PanelRightClose size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 描述 */}
        <div>
          <label className="text-xs font-semibold text-chrome-ink">{t('copilotPromptLabel', locale)}</label>
          <textarea
            className="mt-1 w-full h-24 text-xs p-2 border border-chrome-border rounded resize-none focus:outline-none focus:border-chrome-ink"
            placeholder={t('copilotPromptPlaceholder', locale)}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {/* 已有材料 */}
        <div>
          <label className="text-xs font-semibold text-chrome-ink">{t('copilotSourceLabel', locale)}</label>
          <p className="text-[11px] text-chrome-muted">{t('copilotSourceHint', locale)}</p>
          <div className="mt-1 flex items-center gap-2">
            <button
              className="flex items-center gap-1 px-2 py-1 text-xs border border-chrome-border rounded hover:bg-chrome-bg"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={12} /> {t('copilotImportFile', locale)}
            </button>
            {fileName && (
              <span className="flex items-center gap-1 text-[11px] text-chrome-muted">
                {fileName}
                <button
                  className="text-chrome-muted hover:text-red-600"
                  onClick={() => { setFileName(null); setSourceText('') }}
                >
                  <X size={11} />
                </button>
              </span>
            )}
            <input ref={fileRef} type="file" accept=".md,.markdown,.txt,.tex,.pdf" className="hidden" onChange={onFile} />
          </div>
          <textarea
            className="mt-1 w-full h-20 text-xs p-2 border border-chrome-border rounded resize-none focus:outline-none focus:border-chrome-ink"
            placeholder={locale === 'zh' ? '或在此粘贴材料文本' : 'Or paste material text here'}
            value={sourceText}
            onChange={(e) => { setSourceText(e.target.value); setFileName(null) }}
          />
        </div>

        {/* 生成 */}
        <button
          className="w-full px-3 py-2 text-xs font-semibold bg-chrome-ink text-white rounded hover:bg-black disabled:opacity-50"
          disabled={busy}
          onClick={run}
        >
          {busy ? t('copilotGenerating', locale) : t('copilotGenerate', locale)}
        </button>

        {err && <div className="text-xs text-red-600">{err}</div>}

        {/* 预览 */}
        {gen && (
          <div className="space-y-2">
            <div className="border border-chrome-border rounded p-3 bg-chrome-bg">
              <div className="text-xs font-semibold mb-1 text-green-700">✓ {t('copilotPreviewTitle', locale)}</div>
              <div className="text-sm font-medium">
                {pick(gen.basics.name, locale) || (locale === 'zh' ? '（未识别姓名）' : '(no name)')}
              </div>
              <div className="text-xs text-chrome-muted mt-1">
                {gen.sections.length} {locale === 'zh' ? '个段落' : 'sections'}：
                {gen.sections.map((s) => ` ${pick(s.title, locale)}(${s.items.length})`).join(' · ')}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 px-3 py-2 text-xs font-semibold bg-chrome-ink text-white rounded hover:bg-black"
                onClick={fillNew}
              >
                {t('copilotNewDoc', locale)}
              </button>
              <button
                className="flex-1 px-3 py-2 text-xs font-semibold border border-chrome-border rounded hover:bg-chrome-bg"
                onClick={fillOverwrite}
              >
                {t('copilotOverwrite', locale)}
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
