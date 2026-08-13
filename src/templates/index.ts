/**
 * 模板统一入口：import 各模板触发其 registerTemplate 副作用。
 * 在 App 顶层 import 此文件，确保注册发生在使用 getTemplate 之前。
 */
import './brutalist/BrutalistTemplate'
import './minimal/MinimalTemplate'
import './serif-classic/SerifClassicTemplate'
import './magazine/MagazineTemplate'
import { registerTemplate } from './registry'
import { makeCustomComponent } from './custom/CustomTemplate'
import { useTemplateStore } from '@/store/templateStore'

// 注册 localStorage 持久的 AI 生成模板（此时 templateStore 已同步 rehydrate）。
// 内置模板由上面 import 的各自文件自注册；生成模板在此按数据注册。
for (const g of useTemplateStore.getState().generated) {
  registerTemplate({
    meta: { id: g.id, name: g.name, style: g.style, thumbnail: '✨' },
    Component: makeCustomComponent(g.id),
  })
}
