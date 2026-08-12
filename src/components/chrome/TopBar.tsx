/**
 * TopBar：顶部工具栏
 * 简历列表 / 语言 / 模板 / 缩放 / 导入 / GitHub / AI / 导出 / 设置
 * 导入·GitHub·AI·设置 在后续 Phase 接入；当前为占位按钮。
 */
import { useState, useRef, useEffect, type RefObject } from 'react'
import { clsx } from 'clsx'
import { useResumeStore } from '@/store/resumeStore'
import { useUIStore } from '@/store/uiStore'
import { listTemplates } from '@/templates/registry'
import { exportPDF, printResume } from '@/export/pdf'
import { ImportDialog } from '@/importers/ImportDialog'
import { GitHubImportDialog } from '@/github/GitHubImportDialog'
import { AIDialog } from '@/ai/AIDialog'
import { SettingsDialog } from '@/components/dialogs/SettingsDialog'
import { t } from '@/i18n'
import { Github, Sparkles } from 'lucide-react'

export function TopBar({ previewRef }: { previewRef: RefObject<HTMLDivElement> }) {
  const locale = useUIStore((s) => s.locale)
  const setLocale = useUIStore((s) => s.setLocale)
  const templateId = useUIStore((s) => s.templateId)
  const setTemplate = useUIStore((s) => s.setTemplate)
  const zoom = useUIStore((s) => s.zoom)
  const setZoom = useUIStore((s) => s.setZoom)
  const copilotOpen = useUIStore((s) => s.copilotOpen)
  const setCopilotOpen = useUIStore((s) => s.setCopilotOpen)

  const current = useResumeStore((s) => s.current)
  const list = useResumeStore((s) => s.list)
  const select = useResumeStore((s) => s.select)
  const create = useResumeStore((s) => s.create)
  const remove = useResumeStore((s) => s.remove)

  const [exporting, setExporting] = useState(false)
  const [menu, setMenu] = useState<null | 'resumes' | 'templates' | 'export'>(null)
  const [dialog, setDialog] = useState<null | 'import' | 'github' | 'ai' | 'settings'>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const templates = listTemplates()

  const doExport = async (mode: 'single' | 'multi') => {
    if (!current || !previewRef.current) return
    setExporting(true)
    setMenu(null)
    try {
      await exportPDF(previewRef.current, current, locale, mode)
    } catch (e) {
      console.error(e)
      alert('导出失败：' + (e as Error).message)
    } finally {
      setExporting(false)
    }
  }
  const doPrint = () => {
    if (!current || !previewRef.current) return
    setMenu(null)
    printResume(previewRef.current, current, locale)
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

      <Divider />

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
                onRemove={() => { void remove(r.id) }}
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
            className={clsx('px-2.5 py-1 text-xs font-semibold', locale === l ? 'bg-chrome-ink text-white' : 'text-chrome-muted')}
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
      <button className={btnClsGhost} title={t('import', locale)} onClick={() => setDialog('import')}>{t('import', locale)}</button>
      <button className={btnClsGhost} title={t('github', locale)} onClick={() => setDialog('github')}>{t('github', locale)}</button>
      {/* AI Copilot 切换：图标式，默认收起，点开右侧停靠面板 */}
      <button
        className={clsx(
          'w-7 h-7 flex items-center justify-center rounded',
          copilotOpen ? 'bg-chrome-ink text-white' : 'text-chrome-muted hover:bg-chrome-bg',
        )}
        title={t('copilot', locale)}
        onClick={() => setCopilotOpen(!copilotOpen)}
      >
        <Sparkles size={16} />
      </button>
      <button className={btnClsGhost} title={t('ai', locale)} onClick={() => setDialog('ai')}>{t('ai', locale)}</button>
      <button className={btnClsGhost} title={t('settings', locale)} onClick={() => setDialog('settings')}>{t('settings', locale)}</button>

      <Divider />

      {/* 导出 */}
      <div className="relative">
        <button
          className="px-3 py-1.5 text-xs font-semibold bg-chrome-ink text-white rounded hover:bg-black disabled:opacity-60"
          onClick={() => setMenu(menu === 'export' ? null : 'export')}
          disabled={exporting}
        >
          {exporting ? '生成中…' : t('export', locale)} ▾
        </button>
        {menu === 'export' && (
          <Dropdown align="right">
            <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={() => doExport('single')}>
              单页 PDF（缩放到一页 A4）
            </button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={() => doExport('multi')}>
              多页 PDF（按 A4 切片保真）
            </button>
            <div className="border-t border-chrome-border my-1" />
            <button className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={doPrint}>
              打印 / 另存为 PDF（矢量可选）
            </button>
          </Dropdown>
        )}
      </div>

      {/* 弹窗 */}
      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
      {dialog === 'github' && <GitHubImportDialog onClose={() => setDialog(null)} />}
      {dialog === 'ai' && <AIDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
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
  children, active, onClick, onRemove,
}: {
  children: React.ReactNode
  active?: boolean
  onClick: () => void
  onRemove?: () => void
}) {
  return (
    <div className={clsx('flex items-center group rounded', active && 'bg-chrome-bg')}>
      <button className="flex-1 text-left px-2.5 py-1.5 text-xs hover:bg-chrome-bg rounded" onClick={onClick}>
        {children}
      </button>
      {onRemove && (
        <button
          className="px-2 py-1 text-chrome-muted opacity-0 group-hover:opacity-100 hover:text-red-600 text-xs"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          title="删除"
        >
          ✕
        </button>
      )}
    </div>
  )
}
