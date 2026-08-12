/**
 * ImportDialog：导入迁移主弹窗
 *
 * 流程：选来源 → 读文件/粘贴 → 解析 → 预览提取条目 → 合并入当前简历（绝不静默覆盖）
 * LaTeX/PDF/MD 都可再走 "AI 结构化复核" 得到更可靠的结构。
 */
import { useState, useRef } from 'react'
import { clsx } from 'clsx'
import type { Resume } from '@/types/resume'
import { useResumeStore } from '@/store/resumeStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { parseMarkdownToFragment, type ImportFragment } from './markdown'
import { parseLatexToFragment } from './latex'
import { parsePdfToFragment, extractPdfText } from './pdf'
import { structureViaAI } from '@/ai/aiStructure'

type Source = 'markdown' | 'latex' | 'pdf' | 'paste'

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState<Source>('markdown')
  const [raw, setRaw] = useState('')
  const [frag, setFrag] = useState<ImportFragment | null>(null)
  const [aiResume, setAIResume] = useState<Resume | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [mode, setMode] = useState<'replace' | 'append'>('append')
  const fileRef = useRef<HTMLInputElement>(null)
  const locale = useUIStore((s) => s.locale)

  const handleFile = async (f: File) => {
    setBusy(true); setErr(''); setInfo('')
    try {
      if (source === 'markdown') {
        setRaw(await f.text())
        setFrag(parseMarkdownToFragment(await f.text()))
        setAIResume(null)
      } else if (source === 'latex') {
        setRaw(await f.text())
        setFrag(parseLatexToFragment(await f.text()))
        setAIResume(null)
      } else if (source === 'pdf') {
        // PDF：只提取原文，结构化交给 AI（主路径）。启发式仅作无 key 时兜底。
        const txt = await extractPdfText(f)
        setRaw(txt)
        setFrag(null)
        setAIResume(null)
        const cfg = useSettingsStore.getState().ai
        if (cfg.apiKey) {
          setInfo('PDF 已提取全文，正在交给 AI 结构化…')
          const r = await structureViaAI(cfg, txt, locale)
          setAIResume(r)
          setInfo('✓ AI 已读全文并完成结构化')
        } else {
          setInfo('PDF 已提取全文。建议在「设置」配置 AI 密钥后点下方"AI 结构化"——AI 读全文填写比启发式可靠得多。')
          // 兜底：无 key 时提供启发式结果供参考
          setFrag(await parsePdfToFragment(f))
        }
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const runPaste = () => {
    setErr('')
    try {
      if (source === 'markdown') setFrag(parseMarkdownToFragment(raw))
      else if (source === 'latex') setFrag(parseLatexToFragment(raw))
      setAIResume(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const runAI = async () => {
    setBusy(true); setErr(''); setInfo('正在交给 AI 结构化…')
    try {
      const cfg = useSettingsStore.getState().ai
      if (!cfg.apiKey) throw new Error('请先在「设置」中配置 AI 密钥')
      const text = raw || (frag ? JSON.stringify(frag) : '')
      if (!text.trim()) throw new Error('没有可结构化的文本')
      const r = await structureViaAI(cfg, text, locale)
      setAIResume(r)
      setInfo('✓ AI 已读全文并完成结构化')
    } catch (e) {
      setErr((e as Error).message)
      setInfo('')
    } finally {
      setBusy(false)
    }
  }

  const merge = useResumeStore((s) => s.update)

  const doMerge = () => {
    if (!aiResume && !frag) return
    merge((d) => {
      if (aiResume) {
        // AI 结构化：整份覆盖或追加
        if (mode === 'replace') {
          d.basics = aiResume.basics
          d.sections = aiResume.sections
        } else {
          // append：追加 sections，basics 字段缺失才补
          d.basics = { ...aiResume.basics, ...d.basics }
          // 同 type 的 section 追加 items，否则新增 section
          for (const s of aiResume.sections) {
            const exist = d.sections.find((x) => x.type === s.type)
            if (exist) exist.items.push(...(s.items as never[]))
            else d.sections.push(s)
          }
        }
      } else if (frag) {
        if (frag.basics) d.basics = { ...d.basics, ...frag.basics }
        for (const s of frag.sections) {
          const exist = d.sections.find((x) => x.type === s.type)
          if (exist) exist.items.push(...(s.items as never[]))
          else d.sections.push(s as never)
        }
      }
    })
    onClose()
  }

  return (
    <Overlay onClose={onClose}>
      <div className="w-[760px] max-w-[94vw] max-h-[88vh] overflow-hidden bg-white rounded-lg shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-chrome-border">
          <h2 className="text-base font-semibold">导入简历</h2>
          <button className="text-chrome-muted hover:text-chrome-ink" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 来源选择 */}
          <div className="flex gap-1.5">
            {([
              ['markdown', 'Markdown'],
              ['latex', 'LaTeX'],
              ['pdf', 'PDF'],
              ['paste', '粘贴文本'],
            ] as [Source, string][]).map(([k, label]) => (
              <button
                key={k}
                className={clsx(
                  'px-3 py-1.5 text-xs rounded border',
                  source === k ? 'bg-chrome-ink text-white border-chrome-ink' : 'border-chrome-border hover:bg-chrome-bg',
                )}
                onClick={() => { setSource(k); setFrag(null); setAIResume(null); setRaw(''); setInfo(''); setErr('') }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 文件输入 / 粘贴 */}
          {source !== 'paste' ? (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept={source === 'pdf' ? '.pdf' : source === 'latex' ? '.tex' : '.md,.markdown,.txt'}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
              />
              <button
                className="px-3 py-2 text-sm border border-chrome-border rounded hover:bg-chrome-bg"
                onClick={() => fileRef.current?.click()}
              >
                选择{source.toUpperCase()} 文件
              </button>
              {(source === 'latex' || source === 'pdf') && (
                <span className="ml-3 text-xs text-chrome-muted">
                  {source === 'latex' ? 'LaTeX 解析为 best-effort 正则启发式' : 'PDF 文本提取可能顺序错乱'}，建议用下方「AI 结构化复核」。
                </span>
              )}
            </div>
          ) : (
            <div>
              <textarea
                className="w-full h-40 p-2 text-xs font-mono border border-chrome-border rounded"
                placeholder={source === 'paste' ? '粘贴简历文本（Markdown / LaTeX / 纯文本）' : ''}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
              <button className="mt-2 px-3 py-1.5 text-xs border border-chrome-border rounded hover:bg-chrome-bg" onClick={runPaste}>
                启发式解析
              </button>
            </div>
          )}

          {busy && <div className="text-sm text-chrome-muted">处理中…</div>}
          {info && <div className="text-sm text-chrome-accent">{info}</div>}
          {err && <div className="text-sm text-red-600">错误：{err}</div>}

          {/* 预览 */}
          {frag && !aiResume && (
            <div className="border border-chrome-border rounded p-3 bg-chrome-bg">
              <div className="text-xs font-semibold mb-2">启发式解析结果（合并前可改）</div>
              {frag.basics?.name && <div className="text-sm">姓名：{frag.basics.name.zh || frag.basics.name.en}</div>}
              <div className="text-xs text-chrome-muted mt-1">
                {frag.sections.length} 个段落：
                {frag.sections.map((s) => ` ${s.title.zh || s.title.en}(${s.items.length})`).join(' · ')}
              </div>
            </div>
          )}

          {/* AI 结构化预览 */}
          {aiResume && (
            <div className="border border-chrome-border rounded p-3 bg-chrome-bg">
              <div className="text-xs font-semibold mb-2 text-green-700">✓ AI 结构化完成</div>
              <div className="text-sm">{aiResume.basics.name.zh || aiResume.basics.name.en || '（未识别姓名）'}</div>
              <div className="text-xs text-chrome-muted mt-1">
                {aiResume.sections.length} 个段落：
                {aiResume.sections.map((s) => ` ${s.title.zh || s.title.en}(${s.items.length})`).join(' · ')}
              </div>
            </div>
          )}

          {/* AI 结构化按钮：有结果则隐藏；有原文但无结果时为主操作 */}
          {(frag || raw) && !aiResume && (
            <button
              className="px-3 py-1.5 text-xs bg-chrome-ink text-white rounded hover:bg-black disabled:opacity-50"
              onClick={runAI}
              disabled={busy}
            >
              {source === 'pdf' ? 'AI 结构化（读全文填写，推荐）' : 'AI 结构化（更可靠）'}
            </button>
          )}

          {/* 合并模式 */}
          {(aiResume || frag) && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-chrome-muted">合并方式：</span>
              {(['append', 'replace'] as const).map((mm) => (
                <label key={mm} className="flex items-center gap-1 text-xs">
                  <input type="radio" checked={mode === mm} onChange={() => setMode(mm)} />
                  {mm === 'append' ? '追加到当前简历' : '替换当前简历'}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-chrome-border">
          <button className="px-3 py-1.5 text-sm border border-chrome-border rounded hover:bg-chrome-bg" onClick={onClose}>取消</button>
          <button
            className="px-3 py-1.5 text-sm bg-chrome-ink text-white rounded hover:bg-black disabled:opacity-50"
            onClick={doMerge}
            disabled={!aiResume && !frag}
          >
            合并导入
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function Overlay({
  children, onClose, closeOnOverlay = true,
}: {
  children: React.ReactNode
  onClose: () => void
  /** 点遮罩透明区域是否关闭；设置弹窗等需保留输入时不关闭 */
  closeOnOverlay?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={closeOnOverlay ? onClose : undefined}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}

export { Overlay }
