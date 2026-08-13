/**
 * AI 生成模板（「模板工坊」产物）数据模型
 *
 * 与内置模板（手写 React 组件 + 静态 CSS）的区别：生成模板是纯数据——
 * 一段作用域在 .tpl-custom 下的 CSS + 一组 Google Fonts 族名。
 * 运行时由 CustomTemplate 的 makeCustomComponent(id) 读取并注入 <style>，
 * 经 registry 注册后与内置模板并列出现在下拉里。
 *
 * 设计原则：
 * - 只持久用户/AI 生成数据；内置模板不在此（运行时静态注册）。
 * - css 是惰性字符串（经 sanitizeCSS 净化），不包含可执行代码。
 */
export interface GeneratedTemplate {
  id: string
  /** 显示名（本地化），与内置 TemplateMeta.name 同形 */
  name: { zh: string; en: string }
  /** 风格标签（下拉副标题） */
  style: string
  /** 作用域在 .tpl-custom 下的 CSS（已净化，无外部 @import / 远程 url） */
  css: string
  /** Google Fonts 族名列表，运行时拼成已知良好的 <link> */
  fonts: string[]
  createdAt: number
  updatedAt: number
}

/** AI 产出（无 id/时间戳），保存前由 templateStore.addGenerated 补全 */
export interface GeneratedTemplateInput {
  name: { zh: string; en: string }
  style: string
  css: string
  fonts: string[]
}
