/**
 * 简历快照对话框（命名版本管理）
 *
 * 列出当前简历的全部快照 + 新建/恢复/删除。
 * 新建：深拷贝 current 为命名快照存 Dexie。恢复：深拷贝快照内容覆盖 current（保留 current.id，
 *   避免破坏跨标签/chatStore 关联），走 resumeStore.update(Object.assign)——同 CopilotPanel 撤销本轮，
 *   恢复后可用 Ctrl+Z 撤销。切换简历时重载本简历的快照。
 */
import { useEffect, useState } from 'react'
import { Camera, X, RotateCcw, Trash2, Plus } from 'lucide-react'
import { Overlay } from '@/importers/ImportDialog'
import { useResumeStore } from '@/store/resumeStore'
import { useSnapshotStore } from '@/store/snapshotStore'
import { useUIStore } from '@/store/uiStore'
import { t } from '@/i18n'
import type { Snapshot } from '@/types/resume'

export function SnapshotDialog({ onClose }: { onClose: () => void }) {
  const current = useResumeStore((s) => s.current)
  const update = useResumeStore((s) => s.update)
  const locale = useUIStore((s) => s.locale)
  const createSnap = useSnapshotStore((s) => s.create)
  const removeSnap = useSnapshotStore((s) => s.remove)
  const load = useSnapshotStore((s) => s.load)
  // 订阅 snapshots 字典（引用稳定，create/remove/load 才变），再派生本简历列表
  const snapshotsMap = useSnapshotStore((s) => s.snapshots)

  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')

  const resumeId = current?.id ?? '__none__'

  // 打开/切换简历时从 Dexie 重载本简历快照，确保与内存一致
  useEffect(() => { void load(resumeId) }, [resumeId, load])

  const snapshots: Snapshot[] = Object.values(snapshotsMap)
    .filter((s) => s.resumeId === resumeId)
    .sort((a, b) => b.createdAt - a.createdAt)

  const doCreate = () => {
    if (!current) return
    createSnap(resumeId, current, name || `${current.name} ${new Date().toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}`)
    setName('')
  }

  const doRestore = (snap: Snapshot) => {
    update((d) => {
      // 深拷贝快照内容覆盖 current，保留 current.id（避免破坏跨标签/chatStore 关联）
      const restored = structuredClone(snap.resume)
      restored.id = d.id
      Object.assign(d, restored)
    })
    setMsg(t('snapshotRestored', locale))
    setTimeout(() => setMsg(''), 2500)
  }

  const doDelete = (snap: Snapshot) => {
    if (!window.confirm(t('confirmDeleteSnapshot', locale).replace('{name}', snap.name))) return
    removeSnap(snap.id)
  }

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <Overlay onClose={onClose}>
      <div className="w-[560px] max-w-[96vw] max-h-[88vh] overflow-hidden bg-white rounded-lg shadow-2xl flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 h-12 border-b border-chrome-border">
          <h2 className="text-base font-semibold flex items-center gap-1.5">
            <Camera size={16} className="text-chrome-ink" /> {t('snapshotTitle', locale)}
          </h2>
          <button className="text-chrome-muted hover:text-chrome-ink" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 新建快照 */}
          <div className="flex gap-2">
            <input
              className="flex-1 px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded outline-none focus:border-chrome-ink focus:ring-1 focus:ring-chrome-ink/20"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('snapshotName', locale)}
              onKeyDown={(e) => { if (e.key === 'Enter') doCreate() }}
            />
            <button
              className="px-3 py-1.5 text-xs font-semibold bg-chrome-ink text-chrome-bg rounded hover:opacity-80 disabled:opacity-40 flex items-center gap-1"
              onClick={doCreate}
              disabled={!current}
            >
              <Plus size={13} /> {t('snapshotCreate', locale)}
            </button>
          </div>

          {msg && <div className="text-xs text-green-600">{msg}</div>}

          {/* 快照列表 */}
          {snapshots.length === 0 ? (
            <div className="text-xs text-chrome-muted text-center py-8 leading-relaxed">{t('snapshotEmpty', locale)}</div>
          ) : (
            <div className="space-y-2">
              {snapshots.map((snap) => (
                <div key={snap.id} className="flex items-center gap-2 px-3 py-2.5 rounded border border-chrome-border bg-chrome-bg/50">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-chrome-ink truncate">{snap.name}</div>
                    <div className="text-[11px] text-chrome-muted">{t('snapshotCreatedAt', locale)} {fmtDate(snap.createdAt)}</div>
                  </div>
                  <button
                    className="px-2 py-1 text-xs border border-chrome-border rounded text-chrome-muted hover:text-chrome-ink hover:bg-chrome-bg flex items-center gap-1"
                    onClick={() => doRestore(snap)}
                    title={t('snapshotRestore', locale)}
                  >
                    <RotateCcw size={12} /> {t('snapshotRestore', locale)}
                  </button>
                  <button
                    className="px-2 py-1 text-xs border border-chrome-border rounded text-chrome-muted hover:text-red-600 hover:border-red-300 flex items-center gap-1"
                    onClick={() => doDelete(snap)}
                    title={t('snapshotDelete', locale)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  )
}
