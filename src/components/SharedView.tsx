/**
 * 只读分享视图：从 #r= 解码的简历，无编辑器，仅预览 + 切模板/语言/缩放 + 导出 + 「在本站编辑」。
 *
 * 不读 resumeStore.current（避免把分享简历落进用户的 Dexie）；模板切换用 setTemplateId
 * （不镜像到 resumeStore），「在本站编辑」时才经 createFromResume 把它存为用户的新简历。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useResumeStore } from '@/store/resumeStore'
import { useTemplateStore } from '@/store/templateStore'
import { listTemplates, getTemplate } from '@/templates/registry'
import { ResumePreview } from '@/components/preview/ResumePreview'
import { exportPDF, printResume, exportImage } from '@/export/pdf'
import { exportHTML } from '@/export/html'
import { exportDocx } from '@/export/docx'
import { resumeToMarkdown } from '@/export/markdown'
import { resumeToPlainText } from '@/export/plaintext'
import { resumeToJsonResume } from '@/export/jsonResume'
import { copyText } from '@/utils/clipboard'
import { slugify } from '@/utils/slug'
import { t } from '@/i18n'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function SharedView() {
  const resume = useUIStore((s) => s.sharedResume)!
  const setSharedResume = useUIStore((s) => s.setSharedResume)
  const locale = useUIStore((s) => s.locale)
  const setLocale = useUIStore((s) => s.setLocale)
  const templateId = useUIStore((s) => s.templateId)
  const setTemplateId = useUIStore((s) => s.setTemplateId)
  const zoom = useUIStore((s) => s.zoom)
  const setZoom = useUIStore((s) => s.setZoom)
  const createFromResume = useResumeStore((s) => s.createFromResume)
  const generated = useTemplateStore((s) => s.generated)
  const templates = useMemo(() => listTemplates(), [generated])
  const previewRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<null | 'templates' | 'export'>(null)
  const [busy, setBusy] = useState(false)

  // 打开分享链接时，先用作者选择的模板预览（若该模板已注册）；之后用户可自由切换
  useEffect(() => {
    if (resume.templateId && getTemplate(resume.templateId)) setTemplateId(resume.templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const name = slugify(resume.name) || 'resume'
  const dl = (fn: () => Promise<unknown>) => async () => {
    setBusy(true); setMenu(null)
    try { await fn() } catch (e) { alert(t('exportFailed', locale) + (e as Error).message) } finally { setBusy(false) }
  }

  const editInApp = async () => {
    // 存为用户的新简历（createFromResume 落盘 + 切为 current），应用分享页所选模板，再退出只读视图
    const id = await createFromResume(resume)
    useResumeStore.getState().update((d) => { if (d.id === id) d.templateId = templateId })
    history.replaceState(null, '', location.pathname)
    setSharedResume(null)
  }

  return (
    <div className="h-full flex flex-col bg-chrome-bg">
      {menu && <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />}

      {/* 精简顶栏 */}
      <div className="flex items-center gap-2 px-3 h-12 bg-chrome-panel border-b border-chrome-border text-chrome-ink overflow-x-auto min-w-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        <div className="font-bold tracking-tight mr-1 select-none">Omnia<span className="text-chrome-muted">Resumae</span></div>

        {/* 模板 */}
        <div className="relative">
          <button className="px-2.5 py-1.5 text-xs rounded hover:bg-chrome-bg" onClick={() => setMenu(menu === 'templates' ? null : 'templates')}>
            {templates.find((tp) => tp.meta.id === templateId)?.meta.name[locale] ?? t('template', locale)} ▾
          </button>
          {menu === 'templates' && (
            <div className="absolute top-full mt-1 min-w-[200px] bg-white border border-chrome-border rounded shadow-lg p-1 z-50 left-0">
              {templates.map((tp) => (
                <button
                  key={tp.meta.id}
                  className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded flex items-center gap-2 ${tp.meta.id === templateId ? 'bg-chrome-bg' : ''}`}
                  onClick={() => { setTemplateId(tp.meta.id); setMenu(null) }}
                >
                  <span className="text-base">{tp.meta.thumbnail}</span>
                  <span>{tp.meta.name[locale]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 语言 */}
        <div className="flex items-center bg-chrome-bg rounded border border-chrome-border">
          {(['zh', 'en'] as const).map((l) => (
            <button key={l} className={`px-2.5 py-1 text-xs font-semibold ${locale === l ? 'bg-chrome-ink text-chrome-bg' : 'text-chrome-muted'}`} onClick={() => setLocale(l)}>
              {l === 'zh' ? '中' : 'EN'}
            </button>
          ))}
        </div>

        {/* 缩放 */}
        <div className="flex items-center gap-0.5">
          <button className="w-6 h-6 flex items-center justify-center text-sm rounded hover:bg-chrome-bg" onClick={() => setZoom(zoom - 0.1)}>−</button>
          <span className="text-[11px] w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button className="w-6 h-6 flex items-center justify-center text-sm rounded hover:bg-chrome-bg" onClick={() => setZoom(zoom + 0.1)}>+</button>
        </div>

        <div className="flex-1" />

        {/* 导出 */}
        <div className="relative">
          <button className="px-3 py-1.5 text-xs font-semibold bg-chrome-ink text-chrome-bg rounded hover:opacity-80 disabled:opacity-60" onClick={() => setMenu(menu === 'export' ? null : 'export')} disabled={busy}>
            {busy ? t('exporting', locale) : t('export', locale)} ▾
          </button>
          {menu === 'export' && (
            <div className="absolute top-full mt-1 min-w-[220px] bg-white border border-chrome-border rounded shadow-lg p-1 z-50 right-0">
              <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={dl(() => exportPDF(previewRef.current!, resume, locale, 'single'))}>{t('exportSinglePdf', locale)}</button>
              <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={dl(() => exportPDF(previewRef.current!, resume, locale, 'multi'))}>{t('exportMultiPdf', locale)}</button>
              <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={dl(() => exportImage(previewRef.current!, resume, locale))}>{t('exportImage', locale)}</button>
              <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={dl(() => exportHTML(previewRef.current!, resume, locale))}>{t('exportHtml', locale)}</button>
              <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={dl(() => exportDocx(previewRef.current!, resume, locale))}>{t('exportWord', locale)}</button>
              <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={() => { setMenu(null); download(new Blob([resumeToMarkdown(resume, locale)], { type: 'text/markdown' }), `${name}.md`) }}>{t('exportMarkdown', locale)}</button>
              <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={() => { setMenu(null); download(new Blob([JSON.stringify(resumeToJsonResume(resume, locale), null, 2)], { type: 'application/json' }), `${name}.jsonresume.json`) }}>{t('exportJsonResume', locale)}</button>
              <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={async () => { setMenu(null); await copyText(resumeToPlainText(resume, locale)); alert(t('copied', locale)) }}>{t('exportPlainText', locale)}</button>
              <div className="border-t border-chrome-border my-1" />
              <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={() => { setMenu(null); printResume(previewRef.current!, resume, locale) }}>{t('printVector', locale)}</button>
            </div>
          )}
        </div>

        {/* 在本站编辑：存为新简历并进入编辑器 */}
        <button className="px-3 py-1.5 text-xs font-semibold border border-chrome-border rounded hover:bg-chrome-bg" onClick={() => void editInApp()}>{t('sharedViewEdit', locale)}</button>
      </div>

      {/* 预览 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto" style={{ width: 960 }}>
          <ResumePreview ref={previewRef} resume={resume} locale={locale} templateId={templateId} zoom={zoom} />
        </div>
      </div>
    </div>
  )
}
