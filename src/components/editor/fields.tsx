/**
 * 编辑器字段组件
 * - LocalizedInput: zh/en 双 tab 输入，绑定 Localized
 * - LText / LTextArea / LDate / TagsInput / ImageUpload
 * 设计：受控，onChange 直接回写 store（由父组件传入 setter）。
 */
import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import type { Localized, Locale } from '@/types/resume'
import { useUIStore } from '@/store/uiStore'

/* ─── 通用小部件 ─── */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-2.5">
      <span className="block text-[11px] font-medium text-chrome-muted mb-1 tracking-wide uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded ' +
  'outline-none focus:border-chrome-ink focus:ring-1 focus:ring-chrome-ink/20 transition-colors'

export function TextInput({
  value, onChange, placeholder, type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      className={inputCls}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function TextArea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      className={clsx(inputCls, 'resize-y leading-relaxed')}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/* ─── Localized 输入（zh/en tab） ─── */
export function LocalizedInput({
  value, onChange, multiline, rows, placeholder,
}: {
  value: Localized
  onChange: (v: Localized) => void
  multiline?: boolean
  rows?: number
  placeholder?: string
}) {
  const globalLocale = useUIStore((s) => s.locale)
  const [tab, setTab] = useState<Locale>(globalLocale)
  // 切换顶栏语言时，已有字段的 zh/en 子 tab 跟随，避免新建字段与旧字段显示不同 tab
  useEffect(() => { setTab(globalLocale) }, [globalLocale])
  return (
    <div>
      <div className="flex gap-1 mb-1">
        {(['zh', 'en'] as Locale[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setTab(l)}
            className={clsx(
              'px-2 py-0.5 text-[10px] font-semibold rounded-t border-b-2 transition-colors',
              tab === l
                ? 'border-chrome-ink text-chrome-ink'
                : 'border-transparent text-chrome-muted hover:text-chrome-ink',
            )}
          >
            {l === 'zh' ? '中' : 'EN'}
          </button>
        ))}
      </div>
      {multiline ? (
        <TextArea
          value={value[tab] ?? ''}
          rows={rows}
          placeholder={placeholder}
          onChange={(v) => onChange({ ...value, [tab]: v })}
        />
      ) : (
        <TextInput
          value={value[tab] ?? ''}
          placeholder={placeholder}
          onChange={(v) => onChange({ ...value, [tab]: v })}
        />
      )}
    </div>
  )
}

/* ─── 日期字段（YYYY-MM，允许只填年） ─── */
export function DateInput({
  value, onChange, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return <TextInput value={value} onChange={onChange} placeholder={placeholder ?? 'YYYY-MM'} />
}

/* ─── 标签输入（回车追加，逗号分隔显示） ─── */
export function TagsInput({
  value, onChange, placeholder,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1">
        {value.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-chrome-bg border border-chrome-border rounded"
          >
            {tag}
            <button
              type="button"
              className="text-chrome-muted hover:text-chrome-ink"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        className={inputCls}
        placeholder={placeholder ?? '回车或逗号追加'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            const raw = (e.target as HTMLInputElement).value.trim()
            if (raw) {
              onChange([...value, raw])
              ;(e.target as HTMLInputElement).value = ''
            }
          }
        }}
        onBlur={(e) => {
          // 失焦时把未按回车的文字也提交，避免输入到一半点别处丢失
          const raw = e.currentTarget.value.trim()
          if (raw) { onChange([...value, raw]); e.currentTarget.value = '' }
        }}
      />
    </div>
  )
}

/* ─── 头像上传（转 dataURL） ─── */
export function ImageUpload({
  value, onChange,
}: {
  value: string | undefined
  onChange: (v: string | undefined) => void
}) {
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img src={value} alt="avatar" className="w-12 h-12 rounded-full object-cover border border-chrome-border" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-chrome-bg border border-chrome-border flex items-center justify-center text-chrome-muted text-xs">
          无
        </div>
      )}
      <div className="flex gap-2">
        <label className="px-2 py-1 text-xs bg-chrome-ink text-white rounded cursor-pointer hover:bg-black">
          上传
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const reader = new FileReader()
              reader.onload = () => onChange(String(reader.result))
              reader.readAsDataURL(f)
              e.target.value = '' // 重置，否则移除后再选同一张图不触发 change
            }}
          />
        </label>
        {value && (
          <button
            type="button"
            className="px-2 py-1 text-xs border border-chrome-border rounded hover:bg-chrome-bg"
            onClick={() => onChange(undefined)}
          >
            移除
          </button>
        )}
      </div>
    </div>
  )
}

