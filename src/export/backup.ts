/**
 * 整站备份 / 恢复
 *
 * 导出：Dexie 两表（resumes + conversations）+ localStorage 三个 persist store
 *   （生成模板 omniaresumae-templates / 用户 skills omniaresumae-skills / settings 含密钥）
 *   打包成一个 JSON 文件下载。settings 默认排除（含 AI/GitHub 密钥），可选包含。
 *
 * 恢复：校验版本 → Dexie bulkPut（按 id 合并：同 id 覆盖、不同 id 保留，非全量替换，
 *   避免中断丢全部）→ localStorage 写回 templates/skills（+settings 可选）→ 刷新页面
 *   触发所有 store rehydrate。
 *
 * 密钥策略：密钥是敏感凭据，备份默认不含；用户显式勾选才含（谨慎分享）。
 */
import { db, listResumes, listConversations, listAllSnapshots } from '@/db'

const BACKUP_VERSION = 1

const LS_KEYS = {
  templates: 'omniaresumae-templates',
  skills: 'omniaresumae-skills',
  settings: 'omniaresumae-settings',
} as const

interface BackupPayload {
  version: number
  exportedAt: string
  resumes: unknown[]
  conversations: unknown[]
  snapshots: unknown[]
  templates: unknown
  skills: unknown
  settings?: unknown
}

function readLS(key: string): unknown {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

/** 导出整站备份。includeKeys=true 时把 settings（含密钥）也打进包。 */
export async function exportBackup(includeKeys: boolean): Promise<void> {
  const resumes = await listResumes()
  const conversations = await listConversations()
  const snapshots = await listAllSnapshots()
  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    resumes,
    conversations,
    snapshots,
    templates: readLS(LS_KEYS.templates),
    skills: readLS(LS_KEYS.skills),
  }
  if (includeKeys) payload.settings = readLS(LS_KEYS.settings)

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  a.download = `omniaresumae-backup-${stamp}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 从备份文件恢复。importKeys=true 时把 settings（含密钥）也写回。
 * 覆盖语义：合并（同 id 覆盖、不同 id 保留）。恢复后刷新页面让所有 store 重新加载。
 * 抛错：版本不匹配 / 文件解析失败。
 */
export async function importBackup(file: File, importKeys: boolean): Promise<void> {
  const text = await file.text()
  let data: BackupPayload
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('restoreInvalid')
  }
  if (!data || data.version !== BACKUP_VERSION) throw new Error('restoreInvalid')

  // Dexie 三表：bulkPut 按 id 合并（同 id 覆盖、新 id 插入），不删现有未在备份中的记录。
  if (Array.isArray(data.resumes) && data.resumes.length) await db.resumes.bulkPut(data.resumes as never[])
  if (Array.isArray(data.conversations) && data.conversations.length) await db.conversations.bulkPut(data.conversations as never[])
  if (Array.isArray(data.snapshots) && data.snapshots.length) await db.snapshots.bulkPut(data.snapshots as never[])

  // localStorage 三个 store：直接写回整个 persist 对象，刷新后 zustand rehydrate。
  if (data.templates != null) localStorage.setItem(LS_KEYS.templates, JSON.stringify(data.templates))
  if (data.skills != null) localStorage.setItem(LS_KEYS.skills, JSON.stringify(data.skills))
  if (importKeys && data.settings != null) localStorage.setItem(LS_KEYS.settings, JSON.stringify(data.settings))

  // 刷新让 resumeStore/chatStore 从 Dexie 重读、templateStore/skillStore/settingsStore 从 localStorage rehydrate。
  window.location.reload()
}
