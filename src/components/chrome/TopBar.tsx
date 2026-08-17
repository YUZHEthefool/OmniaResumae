/**
 * TopBar：顶部工具栏
 * 简历列表 / 语言 / 模板 / 缩放 / 导入 / GitHub / 模板工坊 / AI / 导出 / 设置
 * 导入 / GitHub / 模板工坊 / 设置 均已接入弹窗；导出在顶栏下拉。
 */
import { useState, useRef, useEffect, useMemo, type RefObject } from 'react'
import { clsx } from 'clsx'
import { useResumeStore, type SaveStatus } from '@/store/resumeStore'
import { useUIStore } from '@/store/uiStore'
import { listTemplates, unregisterTemplate } from '@/templates/registry'
import { exportPDF, printResume, exportImage } from '@/export/pdf'
import { resumeToMarkdown } from '@/export/markdown'
import { resumeToJsonResume } from '@/export/jsonResume'
import { exportHTML } from '@/export/html'
import { ImportDialog } from '@/importers/ImportDialog'
import { GitHubImportDialog } from '@/github/GitHubImportDialog'
import { SettingsDialog } from '@/components/dialogs/SettingsDialog'
import { TemplateStudioDialog } from '@/components/dialogs/TemplateStudioDialog'
import { useTemplateStore } from '@/store/templateStore'
import { slugify } from '@/utils/slug'
import { t } from '@/i18n'
import { Github, Sparkles, Sun, Moon, Undo2, Redo2 } from 'lucide-react'

export function TopBar({ previewRef }: { previewRef: RefObject<HTMLDivElement> }) {
  const locale = useUIStore((s) => s.locale)
  const setLocale = useUIStore((s) => s.setLocale)
  const templateId = useUIStore((s) => s.templateId)
  const setTemplate = useUIStore((s) => s.setTemplate)
  const zoom = useUIStore((s) => s.zoom)
  const setZoom = useUIStore((s) => s.setZoom)
  const copilotOpen = useUIStore((s) => s.copilotOpen)
  const setCopilotOpen = useUIStore((s) => s.setCopilotOpen)
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const importOpen = useUIStore((s) => s.importOpen)
  const setImportOpen = useUIStore((s) => s.setImportOpen)
  const importFile = useUIStore((s) => s.importFile)
  const setImportFile = useUIStore((s) => s.setImportFile)

  const current = useResumeStore((s) => s.current)
  const list = useResumeStore((s) => s.list)
  const select = useResumeStore((s) => s.select)
  const create = useResumeStore((s) => s.create)
  const remove = useResumeStore((s) => s.remove)
  const duplicate = useResumeStore((s) => s.duplicate)
  const saveStatus = useResumeStore((s) => s.saveStatus)
  const canUndo = useResumeStore((s) => s.past.length > 0)
  const canRedo = useResumeStore((s) => s.future.length > 0)

  const [exporting, setExporting] = useState(false)
  const [menu, setMenu] = useState<null | 'resumes' | 'templates' | 'export'>(null)
  const [dialog, setDialog] = useState<null | 'github' | 'settings' | 'studio'>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // 订阅生成模板：增删时重渲染（listTemplates 读 registry，不订阅则删非当前模板下拉不刷新）
  const generated = useTemplateStore((s) => s.generated)
  const templates = useMemo(() => listTemplates(), [generated])

  const doExport = async (mode: 'single' | 'multi') => {
    if (!current || !previewRef.current) return
    setExporting(true)
    setMenu(null)
    try {
      await exportPDF(previewRef.current, current, locale, mode)
    } catch (e) {
      console.error(e)
      alert(t('exportFailed', locale) + (e as Error).message)
    } finally {
      setExporting(false)
    }
  }
  const doPrint = () => {
    if (!current || !previewRef.current) return
    setMenu(null)
    printResume(previewRef.current, current, locale)
  }
  const doExportImage = async () => {
    if (!current || !previewRef.current) return
    setExporting(true)
    setMenu(null)
    try {
      await exportImage(previewRef.current, current, locale)
    } catch (e) {
      console.error(e)
      alert(t('exportFailed', locale) + (e as Error).message)
    } finally {
      setExporting(false)
    }
  }
  const doExportHtml = async () => {
    if (!current || !previewRef.current) return
    setExporting(true)
    setMenu(null)
    try {
      await exportHTML(previewRef.current, current, locale)
    } catch (e) {
      console.error(e)
      alert(t('exportFailed', locale) + (e as Error).message)
    } finally {
      setExporting(false)
    }
  }
  const doExportJson = () => {
    if (!current) return
    setMenu(null)
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slugify(current.name) || 'resume'}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const doExportMarkdown = () => {
    if (!current) return
    setMenu(null)
    const blob = new Blob([resumeToMarkdown(current, locale)], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slugify(current.name) || 'resume'}.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const doExportJsonResume = () => {
    if (!current) return
    setMenu(null)
    const blob = new Blob([JSON.stringify(resumeToJsonResume(current, locale), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slugify(current.name) || 'resume'}.jsonresume.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div ref={barRef} className="flex items-center gap-1 px-3 h-12 bg-chrome-panel border-b border-chrome-border text-chrome-ink">
      {/* 品牌 */}
      <div className="font-bold tracking-tight mr-2 select-none">
        Omnia<span className="text-chrome-muted">Resumae</span>
      </div>

      {/* 项目仓库 */}
      <a
        href="https://github.com/YUZHEthefool/OmniaResumae"
        target="_blank"
        rel="noopener noreferrer"
        title="GitHub"
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-chrome-bg text-chrome-muted"
      >
        <Github size={16} />
      </a>

      {/* 主题切换 */}
      <button
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-chrome-bg text-chrome-muted"
        title={theme === 'dark' ? (locale === 'zh' ? '切到浅色' : 'Light mode') : (locale === 'zh' ? '切到深色' : 'Dark mode')}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <Divider />

      {/* 保存状态指示 */}
      <SaveStatusBadge status={saveStatus} locale={locale} />
      <button
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-chrome-bg text-chrome-muted disabled:opacity-30 disabled:hover:bg-transparent"
        title={t('undo', locale)}
        onClick={() => useResumeStore.getState().undo()}
        disabled={!canUndo}
      >
        <Undo2 size={15} />
      </button>
      <button
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-chrome-bg text-chrome-muted disabled:opacity-30 disabled:hover:bg-transparent"
        title={t('redo', locale)}
        onClick={() => useResumeStore.getState().redo()}
        disabled={!canRedo}
      >
        <Redo2 size={15} />
      </button>

      {/* 简历列表 */}
      <div className="relative">
        <button
          className={btnCls}
          onClick={() => setMenu(menu === 'resumes' ? null : 'resumes')}
        >
          {current?.name ?? t('resumes', locale)} ▾
        </button>
        {menu === 'resumes' && (
          <Dropdown>
            {list.map((r) => (
              <DropdownItem
                key={r.id}
                active={r.id === current?.id}
                onClick={() => { void select(r.id); setMenu(null) }}
                onCopy={() => { void duplicate(r.id) }}
                onRemove={() => {
                  if (!window.confirm(t('confirmDeleteResume', locale).replace('{name}', r.name))) return
                  setMenu(null)
                  void remove(r.id)
                }}
              >
                {r.name}
              </DropdownItem>
            ))}
            <div className="border-t border-chrome-border mt-1 pt-1">
              <button
                className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded"
                onClick={() => { void create(); setMenu(null) }}
              >
                + {t('newResume', locale)}
              </button>
            </div>
          </Dropdown>
        )}
      </div>

      {/* 语言 */}
      <div className="flex items-center bg-chrome-bg rounded border border-chrome-border">
        {(['zh', 'en'] as const).map((l) => (
          <button
            key={l}
            className={clsx('px-2.5 py-1 text-xs font-semibold', locale === l ? 'bg-chrome-ink text-chrome-bg' : 'text-chrome-muted')}
            onClick={() => setLocale(l)}
          >
            {l === 'zh' ? '中' : 'EN'}
          </button>
        ))}
      </div>

      {/* 模板 */}
      <div className="relative">
        <button className={btnCls} onClick={() => setMenu(menu === 'templates' ? null : 'templates')}>
          {templates.find((t) => t.meta.id === templateId)?.meta.name[locale] ?? t('template', locale)} ▾
        </button>
        {menu === 'templates' && (
          <Dropdown>
            {templates.map((tp) => (
              <DropdownItem
                key={tp.meta.id}
                active={tp.meta.id === templateId}
                onClick={() => { setTemplate(tp.meta.id); setMenu(null) }}
                onRemove={
                  tp.meta.id.startsWith('gen_')
                    ? () => {
                        setMenu(null)
                        useTemplateStore.getState().removeGenerated(tp.meta.id)
                        unregisterTemplate(tp.meta.id)
                        if (templateId === tp.meta.id) setTemplate('serif-classic')
                      }
                    : undefined
                }
              >
                <span className="text-base mr-2">{tp.meta.thumbnail}</span>
                <span>{tp.meta.name[locale]}</span>
                <span className="block text-[10px] text-chrome-muted">{tp.meta.style}</span>
              </DropdownItem>
            ))}
          </Dropdown>
        )}
      </div>

      {/* 缩放 */}
      <div className="flex items-center gap-0.5">
        <IconBtn onClick={() => setZoom(zoom - 0.1)} title="-">−</IconBtn>
        <span className="text-[11px] w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <IconBtn onClick={() => setZoom(zoom + 0.1)} title="+">+</IconBtn>
      </div>

      <div className="flex-1" />

      {/* 后续 Phase 占位 */}
      <button className={btnClsGhost} title={t('import', locale)} onClick={() => setImportOpen(true)}>{t('import', locale)}</button>
      <button className={btnClsGhost} title={t('github', locale)} onClick={() => setDialog('github')}>{t('github', locale)}</button>
      <button className={btnClsGhost} title={t('templateStudio', locale)} onClick={() => setDialog('studio')}>{t('templateStudio', locale)}</button>
      {/* AI Copilot 切换：图标式，默认收起，点开右侧停靠面板 */}
      <button
        className={clsx(
          'w-7 h-7 flex items-center justify-center rounded',
          copilotOpen ? 'bg-chrome-ink text-chrome-bg' : 'text-chrome-muted hover:bg-chrome-bg',
        )}
        title={t('copilot', locale)}
        onClick={() => setCopilotOpen(!copilotOpen)}
      >
        <Sparkles size={16} />
      </button>
      <button className={btnClsGhost} title={t('settings', locale)} onClick={() => setDialog('settings')}>{t('settings', locale)}</button>

      <Divider />

      {/* 导出 */}
      <div className="relative">
        <button
          className="px-3 py-1.5 text-xs font-semibold bg-chrome-ink text-chrome-bg rounded hover:opacity-80 disabled:opacity-60"
          onClick={() => setMenu(menu === 'export' ? null : 'export')}
          disabled={exporting}
        >
          {exporting ? t('exporting', locale) : t('export', locale)} ▾
        </button>
        {menu === 'export' && (
          <Dropdown align="right">
            <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={() => doExport('single')}>
              {t('exportSinglePdf', locale)}
            </button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={() => doExport('multi')}>
              {t('exportMultiPdf', locale)}
            </button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={doExportImage}>
              {t('exportImage', locale)}
            </button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={doExportHtml}>
              {t('exportHtml', locale)}
            </button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={doExportJson}>
              {t('exportJson', locale)}
            </button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={doExportMarkdown}>
              {t('exportMarkdown', locale)}
            </button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={doExportJsonResume}>
              {t('exportJsonResume', locale)}
            </button>
            <div className="border-t border-chrome-border my-1" />
            <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={doPrint}>
              {t('printVector', locale)}
            </button>
          </Dropdown>
        )}
      </div>

      {/* 弹窗 */}
      {importOpen && <ImportDialog initialFile={importFile} onClose={() => { setImportOpen(false); setImportFile(null) }} />}
      {dialog === 'github' && <GitHubImportDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'studio' && <TemplateStudioDialog onClose={() => setDialog(null)} />}
    </div>
  )
}

/* ─── 小部件 ─── */
const btnCls = 'px-2.5 py-1.5 text-xs rounded hover:bg-chrome-bg border border-transparent'
const btnClsGhost = 'px-2.5 py-1.5 text-xs rounded hover:bg-chrome-bg text-chrome-muted disabled:opacity-40 disabled:cursor-not-allowed'

function Divider() {
  return <div className="w-px h-6 bg-chrome-border mx-1" />
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button type="button" title={title} onClick={onClick} className="w-6 h-6 flex items-center justify-center text-sm rounded hover:bg-chrome-bg">
      {children}
    </button>
  )
}

function Dropdown({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <div className={clsx('absolute top-full mt-1 min-w-[200px] bg-white border border-chrome-border rounded shadow-lg p-1 z-50', align === 'right' ? 'right-0' : 'left-0')}>
      {children}
    </div>
  )
}

function DropdownItem({
  children, active, onClick, onCopy, onRemove,
}: {
  children: React.ReactNode
  active?: boolean
  onClick: () => void
  onCopy?: () => void
  onRemove?: () => void
}) {
  const locale = useUIStore((s) => s.locale)
  return (
    <div className={clsx('flex items-center group rounded', active && 'bg-chrome-bg')}>
      <button className="flex-1 text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={onClick}>
        {children}
      </button>
      {onCopy && (
        <button
          className="px-1.5 py-1 text-chrome-muted opacity-0 group-hover:opacity-100 hover:text-chrome-ink text-xs"
          onClick={(e) => { e.stopPropagation(); onCopy() }}
          title={t('duplicate', locale)}
        >
          ⧉
        </button>
      )}
      {onRemove && (
        <button
          className="px-2 py-1 text-chrome-muted opacity-0 group-hover:opacity-100 hover:text-red-600 text-xs"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          title={t('deleteItem', locale)}
        >
          ✕
        </button>
      )}
    </div>
  )
}

/** 保存状态徽章：保存中（脉冲灰）/ 已保存（绿，1.5s 后隐）/ 保存失败（红） */
function SaveStatusBadge({ status, locale }: { status: SaveStatus; locale: 'zh' | 'en' }) {
  const [display, setDisplay] = useState<SaveStatus>(status)
  useEffect(() => {
    setDisplay(status)
    if (status === 'saved') {
      const id = setTimeout(() => setDisplay('idle'), 1500)
      return () => clearTimeout(id)
    }
  }, [status])
  if (display === 'idle') return null
  const cfg = {
    saving: { cls: 'text-chrome-muted', dot: 'bg-chrome-muted', pulse: true, text: t('saving', locale) },
    saved: { cls: 'text-green-600', dot: 'bg-green-500', pulse: false, text: t('saved', locale) },
    error: { cls: 'text-red-600', dot: 'bg-red-500', pulse: false, text: t('saveFailed', locale) },
  }[display]
  return (
    <span className={`flex items-center gap-1 text-[11px] ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
      {cfg.text}
    </span>
  )
}
