/**
 * Dexie 本地数据库
 * 存多份简历；头像 dataURL 内嵌在 basics.image，无需独立表。
 * 自动保存由 resumeStore 节流写入。
 */
import Dexie, { type Table } from 'dexie'
import type { Resume } from '@/types/resume'

export class ResumeDB extends Dexie {
  resumes!: Table<Resume, string>

  constructor() {
    super('omniaresumae')
    this.version(1).stores({
      // 主键 id；updatedAt 索引用于排序
      resumes: 'id, updatedAt',
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
