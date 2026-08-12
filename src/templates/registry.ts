/**
 * 模板注册表
 *
 * 契约：每个模板是一个消费 (resume, locale) 的 React 组件 + 元信息。
 * 新增艺术风格 = 新建一个目录 + 在此注册，零改动编辑器。
 */
import type { FC } from 'react'
import type { Resume, Locale } from '@/types/resume'

export interface TemplateMeta {
  id: string
  /** 显示名（本地化） */
  name: { zh: string; en: string }
  /** 风格标签 */
  style: string
  /** 缩略图（emoji 或后续替换为真实截图） */
  thumbnail: string
}

export interface TemplateProps {
  resume: Resume
  locale: Locale
}

export interface TemplateEntry {
  meta: TemplateMeta
  Component: FC<TemplateProps>
}

const registry = new Map<string, TemplateEntry>()

export function registerTemplate(entry: TemplateEntry) {
  registry.set(entry.meta.id, entry)
}

export function getTemplate(id: string): TemplateEntry | undefined {
  return registry.get(id)
}

export function listTemplates(): TemplateEntry[] {
  return [...registry.values()]
}

/* 模板自注册：在各模板文件末尾调用 registerTemplate。
 * 模板文件由 src/templates/index.ts 统一 import 触发副作用注册，
 * 避免在 registry.ts 内 import 造成循环依赖 TDZ。 */
