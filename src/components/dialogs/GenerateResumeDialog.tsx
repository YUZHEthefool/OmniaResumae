/**
 * AI 一键生成整份简历（对话框）
 *
 * 用户描述经历/目标（可选附已有材料 + 选 skill 风格）→ generateResume / generateWithSkill
 * 产出完整结构化 Resume → 预览（当前模板）→ 「存为新简历」经 createFromResume 落盘并切为 current。
 * 后端 generate.ts 早已就绪（此前无 UI 调用方），此对话框补上入口。
 * 产出经 validateAIResume 加固；密钥走 settingsStore，从不进入简历数据。
 */
import { useMemo, useState } from 'react'
import { Wand2, X, RotateCcw, Save } from 'lucide-react'
import { Overlay } from '@/importers/ImportDialog'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useResumeStore } from '@/store/resumeStore'
import { useSkillStore } from '@/store/skillStore'
import { getBuiltins } from '@/skills'
import { generateResume, generateWithSkill } from '@/ai/generate'
import { getTemplate } from '@/templates/registry'
import { pick } from '@/types/resume'
import type { Resume } from '@/types/resume'
import { t } from '@/i18n'

export function GenerateResumeDialog({ onClose }: { onClose: () => void }) {
  const locale = useUIStore((s) => s.locale)
  const templateId = useUIStore((s) => s.templateId)
  const cfg = useSettingsStore((s) => s.ai)
  const createFromResume = useResumeStore((s) => s.createFromResume)
  const userSkills = useSkillStore((s) => s.userSkills)
  const builtins = useMemo(() => getBuiltins(), [])
  const Template = useMemo(() => getTemplate(templateId) ?? getTemplate('serif-classic'), [templateId])

  const [desc, setDesc] = useState('')
  const [material, setMaterial] = useState('')
  const [skillId, setSkillId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [generated, setGenerated] = useState<Resume | null>(null)

  const run = async () => {
    if (!cfg.apiKey) { setErr(t('genNoKey', locale)); return }
    if (!desc.trim()) { setErr(t('genNoDesc', locale)); return }
    setBusy(true); setErr('')
    try {
      const all = [...builtins, ...userSkills]
      const skill = skillId ? all.find((s) => s.id === skillId) ?? null : null
      const r = skill
        ? await generateWithSkill(cfg, skill, desc, locale, material.trim() || undefined)
        : await generateResume(cfg, desc, locale, material.trim() || undefined)
      setGenerated(r)
    } catch (e) {
      setErr(t('genErr', locale) + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!generated) return
    const rname = pick(generated.basics.name, locale) || t('generateResume', locale)
    await createFromResume(generated, rname)
    onClose()
  }

  return (
    <Overlay onClose={onClose} closeOnOverlay={false}>
      <div className="w-[760px] max-w-[96vw] max-h-[90vh] overflow-hidden bg-white rounded-lg shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 h-12 border-b border-chrome-border">
          <h2 className="text-base font-semibold flex items-center gap-1.5"><Wand2 size={16} /> {t('genTitle', locale)}</h2>
          <button className="text-chrome-muted hover:text-chrome-ink" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {generated ? (
            <>
              <div className="text-xs text-chrome-muted">{t('genPreview', locale)}</div>
              <div className="border border-chrome-border rounded p-3 bg-chrome-bg overflow-auto" style={{ maxHeight: '54vh' }}>
                {/* 缩放到 672px 宽预览（transformOrigin 左上 + 外层裁剪宽，避免横向溢出） */}
                <div style={{ width: 672, margin: '0 auto', overflow: 'hidden' }}>
                  <div style={{ width: 960, transform: 'scale(0.7)', transformOrigin: 'top left' }}>
                    {Template ? <Template.Component resume={generated} locale={locale} /> : null}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button className="px-3 py-1.5 text-xs border border-chrome-border rounded hover:bg-chrome-bg flex items-center gap-1" onClick={() => setGenerated(null)} disabled={busy}>
                  <RotateCcw size={12} /> {t('genRegenerate', locale)}
                </button>
                <button className="px-3 py-1.5 text-xs font-semibold bg-chrome-ink text-chrome-bg rounded hover:opacity-90 flex items-center gap-1" onClick={() => void save()}>
                  <Save size={12} /> {t('genSaveAs', locale)}
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs text-chrome-muted mb-1">{t('genDesc', locale)}</label>
                <textarea
                  className="w-full h-28 p-2 text-sm bg-chrome-input border border-chrome-border rounded resize-none focus:outline-none focus:border-chrome-ink"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder={t('genDescPh', locale)}
                />
              </div>
              <div>
                <label className="block text-xs text-chrome-muted mb-1">{t('genMaterial', locale)}</label>
                <textarea
                  className="w-full h-24 p-2 text-sm bg-chrome-input border border-chrome-border rounded resize-none focus:outline-none focus:border-chrome-ink"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  placeholder={t('genMaterialPh', locale)}
                />
              </div>
              <div>
                <label className="block text-xs text-chrome-muted mb-1">{t('genSkill', locale)}</label>
                <select className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded" value={skillId} onChange={(e) => setSkillId(e.target.value)}>
                  <option value="">{t('skillNone', locale)}</option>
                  <optgroup label={t('skillBuiltin', locale)}>
                    {builtins.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </optgroup>
                  {userSkills.length > 0 && (
                    <optgroup label={t('skillUser', locale)}>
                      {userSkills.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              {err && <div className="text-xs text-red-600">{err}</div>}
              <button
                className="w-full px-3 py-2 text-sm font-semibold bg-chrome-ink text-chrome-bg rounded hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
                onClick={() => void run()}
                disabled={busy}
              >
                <Wand2 size={14} /> {busy ? t('genGenerating', locale) : t('genGenerate', locale)}
              </button>
            </>
          )}
        </div>
      </div>
    </Overlay>
  )
}
