/**
 * 模板工坊对话框：上传参考图片（可选）+ 描述 → AI 生成简历样式 → 隔离实时预览
 * → 可迭代微调 → 保存并应用。
 *
 * 预览隔离：对话框内渲染 CustomBody 用 rootClass="tpl-custom-preview"，候选 CSS 经
 * rewriteRoot 把 .tpl-custom 改写为 .tpl-custom-preview 后注入（data-tpl-id="__preview__"）。
 * 主预览用 .tpl-custom，根类不同 → 两套 CSS 互不影响；对话框不碰 uiStore.templateId。
 * 保存并应用：addGenerated → registerTemplate(makeCustomComponent) → setTemplate → 关闭。
 */
import { useRef, useState } from 'react'
import { Sparkles, Upload, X, Send, Wand2, Save } from 'lucide-react'
import { Overlay } from '@/importers/ImportDialog'
import { useSettingsStore } from '@/store/settingsStore'
import { useResumeStore } from '@/store/resumeStore'
import { useUIStore } from '@/store/uiStore'
import { useTemplateStore } from '@/store/templateStore'
import { registerTemplate } from '@/templates/registry'
import { CustomBody, makeCustomComponent } from '@/templates/custom/CustomTemplate'
import { useScopedStyle, rewriteRoot } from '@/templates/custom/cssRuntime'
import { generateTemplateStyle, type StyleTurn } from '@/ai/templateStyle'
import { t } from '@/i18n'
import type { GeneratedTemplateInput } from '@/types/template'

export function TemplateStudioDialog({ onClose }: { onClose: () => void }) {
  const cfg = useSettingsStore((s) => s.ai)
  const locale = useUIStore((s) => s.locale)
  const setTemplate = useUIStore((s) => s.setTemplate)
  const current = useResumeStore((s) => s.current)
  const addGenerated = useTemplateStore((s) => s.addGenerated)

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [turns, setTurns] = useState<StyleTurn[]>([])
  const [candidate, setCandidate] = useState<GeneratedTemplateInput | null>(null)
  const [refine, setRefine] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  // 预览样式注入（hook 必须无条件调用；无 candidate 时注入空样式）
  useScopedStyle(
    '__preview__',
    candidate ? rewriteRoot(candidate.css, '.tpl-custom', '.tpl-custom-preview') : '',
    candidate?.fonts ?? [],
  )

  const onImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setImageDataUrl(reader.result as string)
    reader.readAsDataURL(f)
  }

  const runGenerate = async () => {
    if (!cfg.apiKey) { setErr(t('tsNoKey', locale)); return }
    if (!description.trim() && !imageDataUrl) { setErr(t('tsEmpty', locale)); return }
    setBusy(true); setErr(''); setNotice('')
    const firstTurn: StyleTurn = {
      role: 'user',
      text: description.trim() || '（无文字描述，请参考图片样式生成一份简历模板样式）',
    }
    try {
      const { template, usedVision } = await generateTemplateStyle(cfg, {
        imageDataUrl,
        turns: [firstTurn],
        locale,
      })
      setCandidate(template)
      if (!usedVision && imageDataUrl) setNotice(t('tsVisionFallback', locale))
      setTurns([firstTurn, { role: 'assistant', text: JSON.stringify(template) }])
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const runRefine = async () => {
    if (!candidate || !refine.trim() || busy) return
    setBusy(true); setErr(''); setNotice('')
    const refineTurn: StyleTurn = { role: 'user', text: refine.trim() }
    try {
      const { template, usedVision } = await generateTemplateStyle(cfg, {
        imageDataUrl,
        turns: [...turns, refineTurn],
        locale,
      })
      setCandidate(template)
      if (!usedVision && imageDataUrl) setNotice(t('tsVisionFallback', locale))
      setTurns((prev) => [...prev, refineTurn, { role: 'assistant', text: JSON.stringify(template) }])
      setRefine('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveApply = () => {
    if (!candidate) return
    const saved = addGenerated(candidate)
    registerTemplate({
      meta: { id: saved.id, name: saved.name, style: saved.style, thumbnail: '✨' },
      Component: makeCustomComponent(saved.id),
    })
    setTemplate(saved.id)
    onClose()
  }

  const onRefineKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void runRefine()
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="w-[980px] max-w-[96vw] h-[88vh] overflow-hidden bg-white rounded-lg shadow-2xl flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 h-12 border-b border-chrome-border">
          <h2 className="text-base font-semibold flex items-center gap-1.5">
            <Sparkles size={16} className="text-chrome-accent" /> {t('templateStudio', locale)}
          </h2>
          <button className="text-chrome-muted hover:text-chrome-ink" onClick={onClose}>✕</button>
        </div>

        {/* 上方控制区：图片 + 描述 + 生成 */}
        <div className="px-5 py-3 border-b border-chrome-border bg-chrome-bg/50">
          <div className="flex gap-3">
            {/* 图片上传 */}
            <div className="flex-shrink-0">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImageFile} />
              {imageDataUrl ? (
                <div className="relative w-28 h-28 border border-chrome-border rounded overflow-hidden bg-white">
                  <img src={imageDataUrl} alt="ref" className="w-full h-full object-contain" />
                  <button
                    className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center bg-black/50 text-white rounded text-[10px] hover:bg-black/70"
                    onClick={() => setImageDataUrl(null)}
                    title={locale === 'zh' ? '移除图片' : 'Remove image'}
                  ><X size={11} /></button>
                </div>
              ) : (
                <button
                  className="w-28 h-28 border-2 border-dashed border-chrome-border rounded flex flex-col items-center justify-center text-chrome-muted hover:border-chrome-accent hover:text-chrome-accent text-[10px] gap-1"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={18} />
                  {t('tsDropImage', locale)}
                </button>
              )}
            </div>

            {/* 描述 */}
            <div className="flex-1 flex flex-col gap-2">
              <textarea
                className="flex-1 min-h-[72px] w-full p-2 text-sm bg-chrome-input border border-chrome-border rounded resize-none focus:outline-none focus:border-chrome-accent"
                placeholder={t('tsDescriptionPh', locale)}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy}
              />
              <button
                className="self-start px-3 py-1.5 text-xs font-semibold bg-chrome-ink text-white rounded hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
                onClick={() => void runGenerate()}
                disabled={busy || (!description.trim() && !imageDataUrl)}
              >
                <Wand2 size={13} /> {busy ? t('tsGenerating', locale) : t('tsGenerate', locale)}
              </button>
            </div>
          </div>
        </div>

        {/* 预览区 */}
        <div className="flex-1 overflow-auto bg-chrome-bg p-4 min-h-0">
          {candidate && current ? (
            <div style={{ width: 794, margin: '0 auto', background: '#fff', boxShadow: '0 2px 14px rgba(0,0,0,.15)' }}>
              <CustomBody resume={current} locale={locale} rootClass="tpl-custom-preview" />
            </div>
          ) : (
            <div className="text-chrome-muted text-sm text-center mt-16">{t('tsEmpty', locale)}</div>
          )}
        </div>

        {/* 下方：状态 + 微调 + 保存 */}
        <div className="px-5 py-3 border-t border-chrome-border bg-chrome-bg/50 space-y-2">
          {err && <div className="text-xs text-red-600">{err}</div>}
          {notice && <div className="text-xs text-amber-600">{notice}</div>}
          <div className="text-[10px] text-chrome-muted">{t('tsCssWarning', locale)}</div>

          {candidate && (
            <div className="flex items-end gap-2">
              <textarea
                className="flex-1 min-h-[44px] max-h-24 p-2 text-xs bg-chrome-input border border-chrome-border rounded resize-none focus:outline-none focus:border-chrome-accent"
                placeholder={t('tsRefinePh', locale)}
                value={refine}
                onChange={(e) => setRefine(e.target.value)}
                onKeyDown={onRefineKey}
                disabled={busy}
              />
              <button
                className="px-3 py-2 text-xs font-semibold border border-chrome-border rounded hover:bg-chrome-bg flex items-center gap-1.5 disabled:opacity-40"
                onClick={() => void runRefine()}
                disabled={busy || !refine.trim()}
              >
                <Send size={12} /> {t('tsRefine', locale)}
              </button>
              <button
                className="px-3 py-2 text-xs font-semibold bg-green-700 text-white rounded hover:bg-green-800 flex items-center gap-1.5 disabled:opacity-40"
                onClick={saveApply}
                disabled={busy}
              >
                <Save size={12} /> {t('tsSaveApply', locale)}
              </button>
            </div>
          )}
        </div>
      </div>
    </Overlay>
  )
}
