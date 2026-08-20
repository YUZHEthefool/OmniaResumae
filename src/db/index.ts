/**
 * Dexie 本地数据库
 * 存多份简历 + AI 对话历史；头像 dataURL 内嵌在 basics.image，无需独立表。
 * 自动保存由 resumeStore 节流写入；对话由 chatStore 双写。
 */
import Dexie, { type Table } from 'dexie'
import type { Resume } from '@/types/resume'
import type { Snapshot } from '@/types/resume'
import type { ChatConversation } from '@/store/chatStore'

export class ResumeDB extends Dexie {
  resumes!: Table<Resume, string>
  conversations!: Table<ChatConversation, string>
  snapshots!: Table<Snapshot, string>

  constructor() {
    super('omniaresumae')
    this.version(1).stores({
      resumes: 'id, updatedAt',
    })
    // v2: 加 conversations 表（id 主键，resumeId/updatedAt 索引用于按简历查与排序）
    this.version(2).stores({
      resumes: 'id, updatedAt',
      conversations: 'id, resumeId, updatedAt',
    })
    // v3: 加 snapshots 表（简历命名版本，独立于 resumes，不污染顶栏简历下拉）
    this.version(3).stores({
      resumes: 'id, updatedAt',
      conversations: 'id, resumeId, updatedAt',
      snapshots: 'id, resumeId, createdAt',
    })
  }
}

export const db = new ResumeDB()

export async function listResumes(): Promise<Resume[]> {
  return db.resumes.orderBy('updatedAt').reverse().toArray()
}

export async function getResume(id: string): Promise<Resume | undefined> {
  return db.resumes.get(id)
}

export async function putResume(r: Resume): Promise<void> {
  await db.resumes.put(r)
}

export async function deleteResume(id: string): Promise<void> {
  await db.resumes.delete(id)
}

/* ─── conversations（AI 对话历史） ─── */
export async function listConversations(): Promise<ChatConversation[]> {
  return db.conversations.toArray()
}

export async function putConversation(c: ChatConversation): Promise<void> {
  await db.conversations.put(c)
}

export async function deleteConversationRow(id: string): Promise<void> {
  await db.conversations.delete(id)
}

export async function deleteConversationsByResume(resumeId: string): Promise<void> {
  await db.conversations.where('resumeId').equals(resumeId).delete()
}

/* ─── snapshots（简历命名版本） ─── */
export async function listSnapshotsByResume(resumeId: string): Promise<Snapshot[]> {
  return db.snapshots.where('resumeId').equals(resumeId).reverse().sortBy('createdAt')
}
export async function listAllSnapshots(): Promise<Snapshot[]> {
  return db.snapshots.toArray()
}
export async function putSnapshot(s: Snapshot): Promise<void> {
  await db.snapshots.put(s)
}
export async function deleteSnapshotRow(id: string): Promise<void> {
  await db.snapshots.delete(id)
}
export async function deleteSnapshotsByResume(resumeId: string): Promise<void> {
  await db.snapshots.where('resumeId').equals(resumeId).delete()
}

