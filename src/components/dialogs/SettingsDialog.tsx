/**
 * SettingsDialog：AI / GitHub 密钥配置
 * 密钥存 settingsStore（localStorage），仅本机。
 */
import { useState } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import { PRESET_ENDPOINTS } from '@/types/ai'
import { listModels } from '@/ai/providers'
import { Overlay } from '@/importers/ImportDialog'
import { t } from '@/i18n'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const presetId = useSettingsStore((s) => s.presetId)
  const setAIPreset = useSettingsStore((s) => s.setAIPreset)
  const ai = useSettingsStore((s) => s.ai)
  const setAIConfig = useSettingsStore((s) => s.setAIConfig)
  const githubPAT = useSettingsStore((s) => s.githubPAT)
  const setGithubPAT = useSettingsStore((s) => s.setGithubPAT)
  const locale = useUIStore((s) => s.locale)

  const preset = PRESET_ENDPOINTS.find((e) => e.id === presetId)
  const [showKey, setShowKey] = useState(false)
  const [modelList, setModelList] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')

  const fetchModels = async () => {
    if (!ai.apiKey) { setFetchMsg(t('fetchNeedKey', locale)); return }
    setFetching(true); setFetchMsg('')
    try {
      const ids = await listModels(ai)
      setModelList(ids)
      setFetchMsg(ids.length ? t('fetchGot', locale).replace('{n}', String(ids.length)) : t('fetchEmpty', locale))
      // 若当前 model 为空且拿到了结果，填入第一个作为默认
      if (!ai.model && ids.length) setAIConfig({ model: ids[0] })
    } catch (e) {
      setFetchMsg(t('fetchErr', locale) + (e as Error).message)
    } finally {
      setFetching(false)
    }
  }

  return (
    <Overlay onClose={onClose} closeOnOverlay={false}>
      <div className="w-[520px] max-w-[94vw] max-h-[88vh] overflow-hidden bg-white rounded-lg shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-chrome-border">
          <h2 className="text-base font-semibold">{t('settings', locale)}</h2>
          <button className="text-chrome-muted hover:text-chrome-ink" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ─── AI ─── */}
          <section>
            <h3 className="text-sm font-semibold mb-2">{t('aiModel', locale)}</h3>
            <label className="block text-xs text-chrome-muted mb-1">{t('providerPreset', locale)}</label>
            <select
              className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded mb-3"
              value={presetId}
              onChange={(e) => {
                setAIPreset(e.target.value)
                // 切换服务商预置时清掉上一家的模型列表与提示，避免残留 chips 被误当作新服务商的可用模型
                setModelList([])
                setFetchMsg('')
              }}
            >
              {PRESET_ENDPOINTS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            <label className="block text-xs text-chrome-muted mb-1">API Key</label>
            <div className="flex gap-2 mb-3">
              <input
                type={showKey ? 'text' : 'password'}
                className="flex-1 px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded"
                placeholder={t('apiKeyPh', locale)}
                value={ai.apiKey ?? ''}
                onChange={(e) => setAIConfig({ apiKey: e.target.value })}
              />
              <button className="px-2 py-1.5 text-xs border border-chrome-border rounded" onClick={() => setShowKey((s) => !s)}>
                {showKey ? t('hide', locale) : t('show', locale)}
              </button>
            </div>

            <label className="block text-xs text-chrome-muted mb-1">
              {t('modelName', locale)}
            </label>
            <input
              className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded mb-1"
              placeholder="gpt-4o-mini / deepseek-chat / glm-4-plus / claude-sonnet-5"
              value={ai.model ?? ''}
              onChange={(e) => setAIConfig({ model: e.target.value })}
            />
            <div className="flex items-center gap-2 mb-1">
              <button
                className="px-2.5 py-1 text-xs border border-chrome-border rounded hover:bg-chrome-bg disabled:opacity-50"
                onClick={fetchModels}
                disabled={fetching}
              >
                {fetching ? t('fetching', locale) : t('fetchModels', locale)}
              </button>
              {ai.model && (
                <button className="px-2.5 py-1 text-xs text-chrome-muted hover:text-chrome-ink" onClick={() => setAIConfig({ model: '' })}>
                  {t('clear', locale)}
                </button>
              )}
            </div>
            {fetchMsg && (
              <div className={`text-[11px] mb-2 ${fetchMsg.startsWith(t('fetchErr', locale)) ? 'text-red-600' : 'text-chrome-muted'}`}>
                {fetchMsg}
              </div>
            )}
            {/* 拉取到的模型：可点击 chips，点哪个填哪个；比 datalist 原生下拉更直观可靠 */}
            {modelList.length > 0 && (
              <div className="mt-1 mb-2">
                <div className="text-[11px] text-chrome-muted mb-1">{t('availableModels', locale)}</div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1.5 border border-chrome-border rounded bg-chrome-bg">
                  {modelList.map((m) => (
                    <button
                      key={m}
                      type="button"
                      title={m}
                      onClick={() => setAIConfig({ model: m })}
                      className={`px-2 py-1 text-[11px] rounded border transition-colors truncate max-w-[200px] ${
                        ai.model === m
                          ? 'bg-chrome-ink text-white border-chrome-ink'
                          : 'bg-white border-chrome-border hover:border-chrome-ink hover:bg-chrome-bg'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="block text-xs text-chrome-muted mb-1">{t('baseUrlAdvanced', locale)}</label>
            <input
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-chrome-input border border-chrome-border rounded mb-1"
              value={ai.baseURL ?? ''}
              onChange={(e) => setAIConfig({ baseURL: e.target.value })}
            />
            <a className="text-xs text-chrome-accent hover:underline" href={preset?.apiKeyURL} target="_blank" rel="noreferrer">
              {t('getKey', locale).replace('{name}', preset?.label ?? '')}
            </a>
            <p className="text-[11px] text-chrome-muted mt-2 leading-relaxed">
              {t('keyPrivacy', locale)}
            </p>
          </section>

          <hr className="border-chrome-border" />

          {/* ─── GitHub ─── */}
          <section>
            <h3 className="text-sm font-semibold mb-2">GitHub</h3>
            <label className="block text-xs text-chrome-muted mb-1">{t('pat', locale)}</label>
            <input
              type="password"
              className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded mb-1"
              placeholder={t('patPh', locale)}
              value={githubPAT}
              onChange={(e) => setGithubPAT(e.target.value)}
            />
            <a className="text-xs text-chrome-accent hover:underline" href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
              {t('createToken', locale)}
            </a>
            <p className="text-[11px] text-chrome-muted mt-1">{t('patHint', locale)}</p>
          </section>
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-chrome-border">
          <button className="px-3 py-1.5 text-sm bg-chrome-ink text-white rounded hover:bg-black" onClick={onClose}>{t('done', locale)}</button>
        </div>
      </div>
    </Overlay>
  )
}
