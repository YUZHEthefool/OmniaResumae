/**
 * AI Copilot 右侧对话面板
 * 真实可观测 agent：用户对话 → agent 多轮工具调用实时编辑当前简历 → 编辑器/预览即时更新。
 * 统一处理「从零生成」与「精修当前」。改动实时写 store，每轮可「撤销本轮」回退。
 */
import { useRef, useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { Sparkles, PanelRightClose, Upload, X, Send, Square, Undo2, Plus, Eraser, Wrench, Paperclip, ChevronRight } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useResumeStore } from '@/store/resumeStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useSkillStore } from '@/store/skillStore'
import { useChatStore } from '@/store/chatStore'
import { getBuiltins } from '@/skills'
import { runAgentStream, type AgentEvent } from '@/ai/agent'
import { buildResumeTools, buildGithubTools } from '@/ai/tools'
import { extractPdfText } from '@/importers/pdf'
import { renderMarkdown } from '@/ai/markdown'
import { OptimizeAction, TailorAction, TranslateAction } from '@/ai/quickActions'
import { t } from '@/i18n'
import { pick } from '@/types/resume'
import type { Skill } from '@/skills/types'
import type { ChatEntry } from '@/store/chatStore'

let _entrySeq = 0
const entryId = () => `chat_${++_entrySeq}`

export function CopilotPanel() {
  const cfg = useSettingsStore((s) => s.ai)
  const githubPAT = useSettingsStore((s) => s.githubPAT)
  const locale = useUIStore((s) => s.locale)
  const setCopilotOpen = useUIStore((s) => s.setCopilotOpen)
  const current = useResumeStore((s) => s.current)
  const create = useResumeStore((s) => s.create)
  const update = useResumeStore((s) => s.update)

  const userSkills = useSkillStore((s) => s.userSkills)
  const selectedSkillId = useSkillStore((s) => s.selectedSkillId)
  const setSelectedSkill = useSkillStore((s) => s.setSelectedSkill)
  const removeSkill = useSkillStore((s) => s.removeSkill)
  const importSkillFromText = useSkillStore((s) => s.importSkillFromText)

  const chatSessions = useChatStore((s) => s.sessions)
  const setSession = useChatStore((s) => s.setSession)
  const clearSession = useChatStore((s) => s.clearSession)

  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [quickMode, setQuickMode] = useState<null | 'optimize' | 'tailor' | 'translate'>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const skillFileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 对话按简历 id 绑定：切换简历自动加载/保留各自历史
  const resumeId = current?.id ?? '__none__'
  const session = chatSessions[resumeId]
  const entries = session?.entries ?? []
  const prevSnapshot = session?.prevSnapshot ?? null

  // 确保该简历的会话存在：在 effect 内创建，避免 render 期 set 触发 StrictMode 警告
  useEffect(() => {
    if (!useChatStore.getState().sessions[resumeId]) useChatStore.getState().getSession(resumeId)
  }, [resumeId])

  const builtins = getBuiltins()
  const allSkills: Skill[] = [...builtins, ...userSkills]
  const selectedSkill = allSkills.find((s) => s.id === selectedSkillId) ?? null

  const isEmpty = !current || (!pick(current.basics.name, locale) && current.sections.every((s) => s.items.length === 0))

  // transcript 自动滚底
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries.length])

  // system 提示随 skill/locale 变化重建（历史保留）
  const buildSystemPrompt = (): string => {
    const lang = locale === 'zh' ? '中文' : 'English'
    return `你是一名资深简历撰写助手，正在通过工具实时编辑用户当前打开的简历。
【核心契约】
- 每次改动通过工具立即生效到编辑器与预览，用户实时可见。不要一次性输出完整简历 JSON，不要使用 emit_resume。
- 先调用 get_resume 了解当前简历现状，再决定如何修改。
- 字段级本地化：文本字段为 {zh?,en?}。当前编辑语言为 ${lang}，请填充 ${locale} 对应槽位；修改时保留另一语言已有内容（合并而非覆盖）。
- 日期统一 "YYYY-MM"，未知留空字符串。要点用强动词开头、尽量量化。
【场景】
${isEmpty
      ? '当前简历为空（骨架已就绪）。若用户要生成简历，用 set_basics 填基本信息，用 add_item 向已有段落(skills/projects/work/education 等)逐条填充；按需 add_section。'
      : '当前简历已有内容，用户在精修。按需 get_resume 后用 update_item / replace_highlights / add_item / remove_item / set_basics 增删改。'}
【工具】
- get_resume()：查看当前简历（含所有段落与条目 id）。
- set_basics(...) / set_meta(...)
- add_section(type,layout?,title?) / remove_section(section_id) / update_section(...)
- add_item(section_id,item) / update_item(section_id,item_id,patch) / replace_highlights(section_id,item_id,highlights) / remove_item(...)
- read_reference(name)：读取本 skill 的补充规则（如有）。
${githubPAT
  ? `\n【GitHub 工具（已配置 PAT）】\n- list_my_repos()：列出你的 GitHub 仓库（名称/描述/stars/语言/topics/URL）。据此把真实项目填入 projects 段：name/description/keywords=topics+languages/stars/url=repoUrl/highlights 从 README 提炼。\n- get_repo_detail(owner, repo)：读某仓库的语言/stars/topics/README，精修某条项目。README 可能很长，提炼要点而非照搬。`
  : `\n【GitHub 工具】未配置 GitHub PAT。若用户想基于真实仓库填充项目，提示去「设置」填 GitHub Personal Access Token（仅需 repo 读权限），即可用 list_my_repos / get_repo_detail。`}
${selectedSkill ? `\n【Skill 主指令】\n${selectedSkill.body}\n（若 skill 提到 emit_resume，请忽略，改用上述字段级工具实时编辑。）` : ''}`
  }

  const onSkillFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const id = importSkillFromText(await f.text())
      setSelectedSkill(id)
    } catch (e2) {
      appendEntry({ id: entryId(), kind: 'error', message: `${t('skillImportFail', locale)}：${(e2 as Error).message}` })
    }
  }

  const onAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const text = f.name.toLowerCase().endsWith('.pdf') ? await extractPdfText(f) : await f.text()
      setInput((p) => (p ? `${p}\n\n【已有材料】\n${text.slice(0, 24000)}` : `【已有材料】\n${text.slice(0, 24000)}`))
    } catch (e2) {
      appendEntry({ id: entryId(), kind: 'error', message: (e2 as Error).message })
    }
  }

  const appendEntry = (e2: ChatEntry) => {
    // 从 store 读最新 entries，避免闭包到 render 期的旧 entries；
    // 否则一轮内多条事件（user→tool_call→tool_result→assistant）会互相覆盖、用户消息丢失。
    const cur = useChatStore.getState().sessions[resumeId]?.entries ?? []
    setSession(resumeId, { entries: [...cur, e2] })
  }

  const appendEvent = (e: AgentEvent) => {
    if (e.type === 'assistant') {
      if (!e.content && !e.reasoningContent) return
      appendEntry({ id: entryId(), kind: 'assistant', text: e.content, reasoning: e.reasoningContent })
    } else if (e.type === 'tool_call') {
      appendEntry({ id: entryId(), kind: 'tool_call', name: e.call.name, args: e.call.args })
    } else if (e.type === 'tool_result') {
      appendEntry({ id: entryId(), kind: 'tool_result', name: e.name, result: e.result })
    } else if (e.type === 'error') {
      appendEntry({ id: entryId(), kind: 'error', message: e.message })
    }
    // done 事件已在 assistant 渲染过，不重复
  }

  const send = async () => {
    const text = input.trim()
    if (!text || running) return
    if (!cfg.apiKey) {
      appendEntry({ id: entryId(), kind: 'error', message: t('copilotNoKey', locale) })
      return
    }
    appendEntry({ id: entryId(), kind: 'user', text })
    setInput('')
    // 从 store 取会话消息历史（确保引用持久、跨轮累积；在 handler 内取，不在 render 期创建）
    const messages = useChatStore.getState().getSession(resumeId).messages
    messages.push({ role: 'user', content: text })

    // 确保/更新 system 首消息
    if (messages.length === 1 || messages[0].role !== 'system') {
      messages.unshift({ role: 'system', content: buildSystemPrompt() })
    } else {
      messages[0] = { role: 'system', content: buildSystemPrompt() }
    }

    // 本轮快照（撤销用）
    setSession(resumeId, { prevSnapshot: current ? structuredClone(current) : null })

    setRunning(true)
    abortRef.current = new AbortController()
    try {
      await runAgentStream(cfg, {
        messages,
        tools: [...buildResumeTools(locale, selectedSkill, current?.id), ...buildGithubTools(githubPAT)],
        maxSteps: 12,
        temperature: 0.45,
        onEvent: appendEvent,
        signal: abortRef.current.signal,
      })
    } catch (e) {
      // Stop 触发的 AbortError 不再追加红色错误条目（stop() 已加"已停止"，避免重复误报）
      const aborted = (e as Error)?.name === 'AbortError' || !!abortRef.current?.signal.aborted
      if (!aborted) appendEntry({ id: entryId(), kind: 'error', message: (e as Error).message })
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    setRunning(false)
    appendEntry({ id: entryId(), kind: 'system', text: t('copilotStopped', locale) })
  }

  const undoTurn = () => {
    if (!prevSnapshot) return
    update((d) => {
      Object.assign(d, structuredClone(prevSnapshot))
    })
    setSession(resumeId, { prevSnapshot: null })
    appendEntry({ id: entryId(), kind: 'system', text: t('copilotUndoTurn', locale) })
  }

  const newResume = async () => {
    const newId = await create()
    // 新简历的会话加一条系统提示
    setSession(newId, { entries: [{ id: entryId(), kind: 'system', text: t('copilotEmptyNew', locale) }], messages: [], prevSnapshot: null })
    setInput('')
  }

  const clearChat = () => {
    clearSession(resumeId)
  }

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <aside className="w-[360px] flex-shrink-0 h-full border-l border-copilot-border bg-copilot-bg flex flex-col text-copilot-ink" style={{ colorScheme: 'dark' }}>
      <header className="flex items-center justify-between px-3 h-11 border-b border-copilot-border bg-copilot-bg">
        <h2 className="text-xs font-semibold flex items-center gap-1.5 text-copilot-ink">
          <Sparkles size={14} className="text-copilot-accent" /> {t('copilot', locale)}
        </h2>
        <div className="flex items-center gap-0.5">
          <button className="w-6 h-6 flex items-center justify-center rounded text-copilot-muted hover:text-copilot-ink hover:bg-copilot-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={t('copilotNewResume', locale)} onClick={newResume} disabled={running}><Plus size={14} /></button>
          <button className="w-6 h-6 flex items-center justify-center rounded text-copilot-muted hover:text-copilot-ink hover:bg-copilot-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={t('copilotClearChat', locale)} onClick={clearChat} disabled={running}><Eraser size={14} /></button>
          {prevSnapshot && !running && (
            <button className="w-6 h-6 flex items-center justify-center rounded text-copilot-muted hover:text-copilot-ink hover:bg-copilot-surface transition-colors" title={t('copilotUndoTurn', locale)} onClick={undoTurn}><Undo2 size={14} /></button>
          )}
          <button className="w-6 h-6 flex items-center justify-center rounded text-copilot-muted hover:text-copilot-ink hover:bg-copilot-surface transition-colors" onClick={() => setCopilotOpen(false)} title={locale === 'zh' ? '收起' : 'Close'}><PanelRightClose size={16} /></button>
        </div>
      </header>

      <div className="px-3 py-2 border-b border-copilot-border bg-copilot-surface/40">
        <select
          className="w-full text-xs p-1.5 border border-copilot-border rounded bg-copilot-surface text-copilot-ink focus:outline-none focus:border-copilot-accent transition-colors"
          value={selectedSkillId ?? ''}
          onChange={(e) => setSelectedSkill(e.target.value || null)}
        >
          <option value="">{t('skillNone', locale)}</option>
          {builtins.length > 0 && (
            <optgroup label={t('skillBuiltin', locale)}>
              {builtins.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </optgroup>
          )}
          {userSkills.length > 0 && (
            <optgroup label={t('skillUser', locale)}>
              {userSkills.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </optgroup>
          )}
        </select>
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          <button className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] border border-copilot-border rounded text-copilot-muted hover:text-copilot-ink hover:bg-copilot-surface2 transition-colors" onClick={() => skillFileRef.current?.click()}>
            <Upload size={11} /> {t('skillImport', locale)}
          </button>
          {userSkills.map((s) => (
            <span key={s.id} className="flex items-center gap-0.5 text-[11px] text-copilot-muted px-1 py-0.5 bg-copilot-surface2 rounded">
              {s.title}
              <button className="text-copilot-muted hover:text-red-400" title={t('skillDelete', locale)} onClick={() => removeSkill(s.id)}><X size={10} /></button>
            </span>
          ))}
          <input ref={skillFileRef} type="file" accept=".md,.markdown" className="hidden" onChange={onSkillFile} />
        </div>
      </div>

      {/* 快捷动作：优化润色 / 目标包装 / 翻译（提案-逐条采纳） */}
      <div className="px-3 py-1.5 border-b border-copilot-border flex items-center gap-1">
        <span className="text-[10px] text-copilot-dim mr-0.5">{t('quickActions', locale)}</span>
        {(['optimize', 'tailor', 'translate'] as const).map((m) => (
          <button
            key={m}
            className={clsx(
              'flex-1 px-1.5 py-1 text-[11px] rounded transition-colors',
              quickMode === m ? 'bg-copilot-accent text-white' : 'text-copilot-muted hover:text-copilot-ink hover:bg-copilot-surface',
            )}
            onClick={() => setQuickMode(quickMode === m ? null : m)}
          >
            {m === 'optimize' ? t('quickOptimize', locale) : m === 'tailor' ? t('quickTailor', locale) : t('quickTranslate', locale)}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 scroll-smooth">
        {quickMode ? (
          <div className="space-y-2">
            <button
              className="text-[11px] text-copilot-muted hover:text-copilot-ink flex items-center gap-1"
              onClick={() => setQuickMode(null)}
            >
              <ChevronRight size={11} className="rotate-180" /> {locale === 'zh' ? '返回对话' : 'Back to chat'}
            </button>
            {quickMode === 'optimize' && <OptimizeAction />}
            {quickMode === 'tailor' && <TailorAction />}
            {quickMode === 'translate' && <TranslateAction />}
          </div>
        ) : (
          <>
        {entries.length === 0 && (
          <div className="text-[11px] text-copilot-dim text-center mt-8 leading-relaxed">
            <Sparkles size={20} className="mx-auto mb-2 text-copilot-accent/60" />
            {t('copilotChatPlaceholder', locale)}
          </div>
        )}
        {entries.map((e) => {
          if (e.kind === 'user') return (
            <div key={e.id} className="flex justify-end">
              <div className="max-w-[85%] bg-copilot-accentSoft text-copilot-ink text-xs px-3 py-2 rounded-2xl rounded-br-sm whitespace-pre-wrap leading-relaxed">{e.text}</div>
            </div>
          )
          if (e.kind === 'assistant') return (
            <div key={e.id} className="text-xs space-y-1">
              {e.reasoning && (
                <div
                  className="text-[11px] text-copilot-dim italic leading-relaxed border-l-2 border-copilot-border pl-2 markdown-body"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(e.reasoning) }}
                />
              )}
              {e.text && (
                <div
                  className="text-copilot-ink leading-relaxed markdown-body"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(e.text) }}
                />
              )}
            </div>
          )
          if (e.kind === 'tool_call') return (
            <div key={e.id} className="bg-copilot-surface border border-copilot-border rounded-lg px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-copilot-muted">
                <Wrench size={11} className="text-copilot-accent/80" />
                <span className="font-mono text-copilot-ink/90">{e.name}</span>
                <details className="ml-auto">
                  <summary className="cursor-pointer text-[10px] text-copilot-dim hover:text-copilot-muted transition-colors list-none">
                    <code className="font-mono">{JSON.stringify(e.args).length}b</code>
                  </summary>
                  <pre className="mt-1 text-[10px] whitespace-pre-wrap break-all text-copilot-dim font-mono bg-copilot-bg rounded p-1.5">{JSON.stringify(e.args, null, 2).slice(0, 400)}</pre>
                </details>
              </div>
            </div>
          )
          if (e.kind === 'tool_result') return (
            <div key={e.id} className="text-[11px] text-copilot-dim pl-2 border-l border-copilot-border">
              <details>
                <summary className="cursor-pointer hover:text-copilot-muted transition-colors flex items-center gap-1">
                  <ChevronRight size={9} /> {e.name}
                </summary>
                <pre className="mt-1 whitespace-pre-wrap break-all text-copilot-dim font-mono">{e.result.slice(0, 600)}</pre>
              </details>
            </div>
          )
          if (e.kind === 'error') return <div key={e.id} className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-2.5 py-1.5">{e.message}</div>
          return <div key={e.id} className="text-[11px] text-copilot-dim text-center py-1">{e.text}</div>
        })}
        {running && (
          <div className="flex items-center gap-1.5 text-[11px] text-copilot-muted px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-copilot-accent animate-pulse" />
            {t('copilotThinking', locale)}
          </div>
        )}
          </>
        )}
      </div>

      {!quickMode && (
      <div className="border-t border-copilot-border p-2.5 bg-copilot-bg">
        <div className="flex items-end gap-1.5 bg-copilot-surface border border-copilot-border rounded-xl px-2 py-1.5 focus-within:border-copilot-accent transition-colors">
          <button className="w-7 h-7 flex items-center justify-center rounded-lg text-copilot-muted hover:text-copilot-ink hover:bg-copilot-surface2 flex-shrink-0 transition-colors" title={t('copilotAttach', locale)} onClick={() => fileRef.current?.click()}><Paperclip size={14} /></button>
          <input ref={fileRef} type="file" accept=".md,.markdown,.txt,.tex,.pdf" className="hidden" onChange={onAttachFile} />
          <textarea
            className="flex-1 text-xs bg-transparent text-copilot-ink placeholder:text-copilot-dim resize-none focus:outline-none leading-relaxed"
            rows={2}
            placeholder={t('copilotChatPlaceholder', locale)}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKey}
            disabled={running}
          />
          {running ? (
            <button className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 flex-shrink-0 transition-colors" title={t('copilotStop', locale)} onClick={stop}><Square size={13} /></button>
          ) : (
            <button className="w-7 h-7 flex items-center justify-center rounded-lg bg-copilot-accent text-white hover:opacity-90 flex-shrink-0 disabled:opacity-30 transition-opacity" title={t('copilotSend', locale)} onClick={send} disabled={!input.trim()}><Send size={13} /></button>
          )}
        </div>
      </div>
      )}
    </aside>
  )
}
