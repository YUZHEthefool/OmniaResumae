/**
 * 简历完整度体检对话框（纯本地，无 AI）
 *
 * 扫描当前简历，展示完整性得分 + 分类问题清单（critical/warn/info）。
 * 纯函数 checkResume 即时计算（useMemo 随简历/语言变化），无需按钮触发。
 * v1 只展示，不做跳转编辑器。
 */
import { useMemo } from 'react'
import { HeartPulse, X, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { Overlay } from '@/importers/ImportDialog'
import { useResumeStore } from '@/store/resumeStore'
import { useUIStore } from '@/store/uiStore'
import { checkResume, type IssueSeverity } from '@/utils/healthCheck'
import { t, type UIKey } from '@/i18n'

const SEV_STYLE: Record<IssueSeverity, { color: string; bg: string; Icon: typeof AlertCircle; label: UIKey }> = {
  critical: { color: 'text-red-600', bg: 'bg-red-50 border-red-200', Icon: AlertCircle, label: 'hcCritical' },
  warn: { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', Icon: AlertTriangle, label: 'hcWarn' },
  info: { color: 'text-chrome-muted', bg: 'bg-chrome-bg border-chrome-border', Icon: Info, label: 'hcInfo' },
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-green-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-red-600'
}

export function HealthCheckDialog({ onClose }: { onClose: () => void }) {
  const current = useResumeStore((s) => s.current)
  const locale = useUIStore((s) => s.locale)

  const report = useMemo(() => (current ? checkResume(current, locale) : null), [current, locale])

  const counts = useMemo(() => {
    const c = { critical: 0, warn: 0, info: 0 }
    report?.issues.forEach((i) => { c[i.severity]++ })
    return c
  }, [report])

  return (
    <Overlay onClose={onClose}>
      <div className="w-[680px] max-w-[96vw] max-h-[88vh] overflow-hidden bg-white rounded-lg shadow-2xl flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 h-12 border-b border-chrome-border">
          <h2 className="text-base font-semibold flex items-center gap-1.5">
            <HeartPulse size={16} className="text-rose-500" /> {t('hcTitle', locale)}
          </h2>
          <button className="text-chrome-muted hover:text-chrome-ink" onClick={onClose}><X size={18} /></button>
        </div>

        {!current || !report ? (
          <div className="flex-1 flex items-center justify-center text-chrome-muted text-sm">
            {locale === 'zh' ? '没有打开的简历' : 'No resume open'}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* 得分 + 总览 */}
            <div className="flex items-center gap-5 p-4 rounded-lg border border-chrome-border bg-chrome-bg/50">
              <div className="flex flex-col items-center justify-center w-24 h-24 rounded-full border-4 border-chrome-border bg-white">
                <span className={`text-3xl font-bold ${scoreColor(report.score)}`}>{report.score}</span>
                <span className="text-[10px] text-chrome-muted">{t('hcScore', locale)}</span>
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="text-xs text-chrome-muted">{t('hcOverall', locale)}</div>
                <div className="flex flex-wrap gap-2">
                  {(['critical', 'warn', 'info'] as const).map((sev) => {
                    const s = SEV_STYLE[sev]
                    return (
                      <span key={sev} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${s.bg} ${s.color}`}>
                        <s.Icon size={11} /> {t(s.label, locale)}: {counts[sev]}
                      </span>
                    )
                  })}
                </div>
                {report.issues.length === 0 && (
                  <div className="text-xs text-green-600">{t('hcNoIssues', locale)}</div>
                )}
              </div>
            </div>

            {/* 问题清单 */}
            <div className="space-y-1.5">
              {report.issues.map((i, idx) => {
                const s = SEV_STYLE[i.severity]
                return (
                  <div key={idx} className={`flex items-start gap-2 px-3 py-2 rounded border text-xs ${s.bg}`}>
                    <s.Icon size={13} className={`${s.color} flex-shrink-0 mt-0.5`} />
                    <span className="text-chrome-ink">{i.message}</span>
                    <span className="ml-auto text-[10px] text-chrome-muted font-mono flex-shrink-0">{i.field}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Overlay>
  )
}
