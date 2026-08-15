/**
 * SettingsDialog：AI / GitHub 密钥配置
 * 密钥存 settingsStore（localStorage），仅本机。
 */
import { useState } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { PRESET_ENDPOINTS } from '@/types/ai'
import { listModels } from '@/ai/providers'
import { Overlay } from '@/importers/ImportDialog'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const presetId = useSettingsStore((s) => s.presetId)
  const setAIPreset = useSettingsStore((s) => s.setAIPreset)
  const ai = useSettingsStore((s) => s.ai)
  const setAIConfig = useSettingsStore((s) => s.setAIConfig)
  const githubPAT = useSettingsStore((s) => s.githubPAT)
  const setGithubPAT = useSettingsStore((s) => s.setGithubPAT)

  const preset = PRESET_ENDPOINTS.find((e) => e.id === presetId)
  const [showKey, setShowKey] = useState(false)
  const [modelList, setModelList] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')

  const fetchModels = async () => {
    if (!ai.apiKey) { setFetchMsg('请先填入 API Key'); return }
    setFetching(true); setFetchMsg('')
    try {
      const ids = await listModels(ai)
      setModelList(ids)
      setFetchMsg(ids.length ? `获取到 ${ids.length} 个模型，可在输入框下拉选择` : '服务返回空列表')
      // 若当前 model 为空且拿到了结果，填入第一个作为默认
      if (!ai.model && ids.length) setAIConfig({ model: ids[0] })
    } catch (e) {
      setFetchMsg('错误：' + (e as Error).message)
    } finally {
      setFetching(false)
    }
  }

  return (
    <Overlay onClose={onClose} closeOnOverlay={false}>
      <div className="w-[520px] max-w-[94vw] max-h-[88vh] overflow-hidden bg-white rounded-lg shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-chrome-border">
          <h2 className="text-base font-semibold">设置</h2>
          <button className="text-chrome-muted hover:text-chrome-ink" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ─── AI ─── */}
          <section>
            <h3 className="text-sm font-semibold mb-2">AI 模型</h3>
            <label className="block text-xs text-chrome-muted mb-1">服务商预置</label>
            <select
              className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded mb-3"
              value={presetId}
              onChange={(e) => setAIPreset(e.target.value)}
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
                placeholder="粘贴你的 API Key（仅存本机浏览器）"
                value={ai.apiKey ?? ''}
                onChange={(e) => setAIConfig({ apiKey: e.target.value })}
              />
              <button className="px-2 py-1.5 text-xs border border-chrome-border rounded" onClick={() => setShowKey((s) => !s)}>
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>

            <label className="block text-xs text-chrome-muted mb-1">
              模型名称（手动输入，或点"拉取可用模型"后点选）
            </label>
            <input
              className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded mb-1"
              placeholder="如 gpt-4o-mini / deepseek-chat / glm-4-plus / claude-sonnet-5"
              value={ai.model ?? ''}
              onChange={(e) => setAIConfig({ model: e.target.value })}
            />
            <div className="flex items-center gap-2 mb-1">
              <button
                className="px-2.5 py-1 text-xs border border-chrome-border rounded hover:bg-chrome-bg disabled:opacity-50"
                onClick={fetchModels}
                disabled={fetching}
              >
                {fetching ? '拉取中…' : '拉取可用模型（/models）'}
              </button>
              {ai.model && (
                <button className="px-2.5 py-1 text-xs text-chrome-muted hover:text-chrome-ink" onClick={() => setAIConfig({ model: '' })}>
                  清空
                </button>
              )}
            </div>
            {fetchMsg && (
              <div className={`text-[11px] mb-2 ${fetchMsg.startsWith('错误') ? 'text-red-600' : 'text-chrome-muted'}`}>
                {fetchMsg}
              </div>
            )}
            {/* 拉取到的模型：可点击 chips，点哪个填哪个；比 datalist 原生下拉更直观可靠 */}
            {modelList.length > 0 && (
              <div className="mt-1 mb-2">
                <div className="text-[11px] text-chrome-muted mb-1">可用模型（点击选择）：</div>
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

            <label className="block text-xs text-chrome-muted mb-1">Base URL（高级，可改）</label>
            <input
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-chrome-input border border-chrome-border rounded mb-1"
              value={ai.baseURL ?? ''}
              onChange={(e) => setAIConfig({ baseURL: e.target.value })}
            />
            <a className="text-xs text-chrome-accent hover:underline" href={preset?.apiKeyURL} target="_blank" rel="noreferrer">
              去获取 {preset?.label} 的 API Key →
            </a>
            <p className="text-[11px] text-chrome-muted mt-2 leading-relaxed">
              密钥仅保存在本机 localStorage，调用时由你的浏览器直连对应官方服务。Anthropic 浏览器直连使用官方 dangerous-direct-browser-access 通道。
            </p>
          </section>

          <hr className="border-chrome-border" />

          {/* ─── GitHub ─── */}
          <section>
            <h3 className="text-sm font-semibold mb-2">GitHub</h3>
            <label className="block text-xs text-chrome-muted mb-1">Personal Access Token（可选）</label>
            <input
              type="password"
              className="w-full px-2.5 py-1.5 text-sm bg-chrome-input border border-chrome-border rounded mb-1"
              placeholder="ghp_...（仅存本机，提高限流并读私有仓）"
              value={githubPAT}
              onChange={(e) => setGithubPAT(e.target.value)}
            />
            <a className="text-xs text-chrome-accent hover:underline" href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
              创建 GitHub Token →
            </a>
            <p className="text-[11px] text-chrome-muted mt-1">仅需 <code>repo</code> 读权限（读私有仓）或留空只读公开仓。</p>
          </section>
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-chrome-border">
          <button className="px-3 py-1.5 text-sm bg-chrome-ink text-white rounded hover:bg-black" onClick={onClose}>完成</button>
        </div>
      </div>
    </Overlay>
  )
}
