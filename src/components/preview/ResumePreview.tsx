/**
 * 只读预览表面：把任意 Resume 用指定模板渲染到 960px 宽、按 zoom 缩放的容器。
 * ref 挂在内层（模板根），外层负责缩放——与 PreviewPane 一致，供导出函数克隆取 DOM。
 *
 * 共享于：SharedView（只读分享页）、GenerateResumeDialog（生成预览）。
 * 不含编辑预览/分页线（那些是编辑器 PreviewPane 专用）。
 */
import { forwardRef, useMemo } from 'react'
import type { Resume, Locale } from '@/types/resume'
import { getTemplate } from '@/templates/registry'

export const ResumePreview = forwardRef<
  HTMLDivElement,
  { resume: Resume; locale: Locale; templateId: string; zoom?: number }
>(function ResumePreview({ resume, locale, templateId, zoom = 1 }, ref) {
  const Template = useMemo(() => getTemplate(templateId) ?? getTemplate('serif-classic'), [templateId])
  return (
    <div style={{ width: 960, transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
      <div ref={ref}>{Template ? <Template.Component resume={resume} locale={locale} /> : null}</div>
    </div>
  )
})
