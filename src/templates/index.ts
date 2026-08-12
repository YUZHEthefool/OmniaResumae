/**
 * 模板统一入口：import 各模板触发其 registerTemplate 副作用。
 * 在 App 顶层 import 此文件，确保注册发生在使用 getTemplate 之前。
 */
import './brutalist/BrutalistTemplate'
import './minimal/MinimalTemplate'
import './serif-classic/SerifClassicTemplate'
import './magazine/MagazineTemplate'
