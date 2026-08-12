/**
 * 示例简历（首屏 demo 数据）
 * 以 OmniaResumae 项目作者本人的示例为蓝本，中英双语。
 * 仅在本地数据库为空时由 init 创建一次，用户可自由编辑/删除。
 */
import type { Resume } from '@/types/resume'

export function createSampleResume(now: number): Resume {
  return {
    id: 'resume_sample_omnia',
    name: '示例 · OmniaResumae',
    templateId: 'brutalist',
    meta: {
      targetRole: { zh: '前端工程师', en: 'Frontend Engineer' },
      keywords: [
        { zh: 'React', en: 'React' },
        { zh: 'TypeScript', en: 'TypeScript' },
        { zh: 'Vite', en: 'Vite' },
        { zh: 'AI 集成', en: 'AI Integration' },
        { zh: '实时渲染', en: 'Live Rendering' },
      ],
    },
    basics: {
      name: { zh: '愚者', en: 'Yuzhe the Fool' },
      nameRomanized: 'YUZHE the FOOL',
      label: { zh: '前端工程师 · OmniaResumae 作者', en: 'Frontend Engineer · Creator of OmniaResumae' },
      image: '',
      email: 'yuzhe@example.com',
      phone: '(86) 138-0000-0000',
      url: 'https://github.com/YUZHEthefool',
      location: { zh: '中国', en: 'China' },
      summary: {
        zh: '专注前端工程与开发者工具，做OmniaResumae这套模板化简历生成工具，把"填表即出稿"做到极致；熟悉 React 全家桶与多模型 AI 集成，擅长把复杂流程拆成可交付的产品。',
        en: 'Frontend engineer focused on developer tooling; built OmniaResumae, a templated resume generator that makes "fill the form, ship the resume" effortless. Fluent in the React stack and multi-model AI integration; turns complex flows into shippable products.',
      },
      profiles: [
        { network: 'GitHub', username: 'YUZHEthefool', url: 'https://github.com/YUZHEthefool' },
      ],
    },
    sections: [
      {
        id: 'sec_skills', type: 'skills', title: { zh: '能力与理解', en: 'Skills' }, layout: 'main', visible: true,
        items: [
          { id: 'sk1', name: { zh: '前端框架', en: 'Frontend' }, level: { zh: '熟练掌握 React 18 + TypeScript，理解 hooks、并发渲染、性能优化；用 Vite 构建从零到上线。', en: 'Proficient in React 18 + TypeScript; hooks, concurrent rendering, performance; ships from scratch with Vite.' } },
          { id: 'sk2', name: { zh: '状态与数据', en: 'State & Data' }, level: { zh: 'Zustand 做状态管理，Dexie/IndexedDB 本地持久化，zod 做运行时校验。', en: 'Zustand for state, Dexie/IndexedDB for local persistence, zod for runtime validation.' } },
          { id: 'sk3', name: { zh: 'AI 集成', en: 'AI Integration' }, level: { zh: '多模型适配（OpenAI 兼容 + Anthropic），浏览器直连、JSON 结构化输出、提案审阅闭环。', en: 'Multi-provider adapters (OpenAI-compatible + Anthropic), browser-direct, structured JSON output, proposal-review loop.' } },
          { id: 'sk4', name: { zh: '工程化', en: 'Engineering' }, level: { zh: '代码分割与懒加载、scoped CSS 模板隔离、静态部署（GitHub Pages/Vercel）。', en: 'Code-splitting & lazy loading, scoped-CSS template isolation, static deploy (GitHub Pages/Vercel).' } },
        ],
      },
      {
        id: 'sec_proj', type: 'projects', title: { zh: '开发项目 · 专利', en: 'Projects' }, layout: 'main', visible: true,
        items: [
          {
            id: 'pj1', name: { zh: 'OmniaResumae', en: 'OmniaResumae' }, badge: 'oss', kind: 'own',
            description: { zh: '纯前端模板化简历生成工具：填表即实时渲染，中英双语，支持 PDF/LaTeX/Markdown 迁移、GitHub 导入、AI 定向包装。', en: 'Static, template-driven resume tool: fill the form, preview live; bilingual; import from PDF/LaTeX/Markdown, GitHub import, AI tailoring.' },
            repoUrl: 'https://github.com/YUZHEthefool/OmniaResumae', url: 'https://github.com/YUZHEthefool/OmniaResumae',
            keywords: ['React', 'TypeScript', 'Vite', 'Zustand', 'Dexie', 'zod', 'pdf.js', 'html2canvas'], stars: 42,
            highlights: [
              { zh: '设计字段级 Localized schema，同一份数据可切换 4 种艺术风格模板实时预览。', en: 'Field-level Localized schema; one dataset drives 4 art-style templates with live preview.' },
              { zh: '把 pdf.js / html2canvas / jsPDF 拆成按需动态加载，首屏 gzip 后约 140kB。', en: 'Lazy-load pdf.js/html2canvas/jsPDF; first paint ~140kB gzipped.' },
              { zh: 'AI 适配 OpenAI 兼容端点（DeepSeek/通义/智谱）+ Anthropic，产出均为用户审阅提案，不自动覆盖。', en: 'AI adapters for OpenAI-compatible endpoints + Anthropic; all output is a user-reviewed proposal, never auto-applied.' },
            ],
          },
        ],
      },
      {
        id: 'sec_wf', type: 'workflow', title: { zh: '工作流 / 方法论', en: 'Workflow' }, layout: 'main', visible: true,
        items: [
          { id: 'wf1', label: { zh: '结构先行', en: 'Schema-first' }, text: { zh: '先定 schema 与本地化策略，再做编辑器与模板，数据驱动渲染。', en: 'Lock schema & localization first, then editor and templates; data drives rendering.' } },
          { id: 'wf2', label: { zh: '模板隔离', en: 'Template isolation' }, text: { zh: '每个艺术风格一套 scoped CSS 组件，注册到 registry，新增风格零改动编辑器。', en: 'Each style is a scoped-CSS component in a registry; new styles need zero editor changes.' } },
          { id: 'wf3', label: { zh: '提案审阅', en: 'Propose & review' }, text: { zh: 'AI 产出一律 zod 校验 + 用户逐项采纳，绝不静默覆盖用户数据。', en: 'All AI output passes zod + per-item user acceptance; never silently overwrites data.' } },
          { id: 'wf4', label: { zh: '隐私优先', en: 'Privacy-first' }, text: { zh: '纯前端 + BYO 密钥，数据只存本机，除主动调用 AI/GitHub 外不联网。', en: 'Static + BYO keys; data stays local; no network except explicit AI/GitHub calls.' } },
        ],
      },
      {
        id: 'sec_work', type: 'work', title: { zh: '工作经历', en: 'Experience' }, layout: 'main', visible: true,
        items: [
          {
            id: 'wk1', name: { zh: '某互联网公司', en: 'A Tech Company' }, position: { zh: '前端工程师', en: 'Frontend Engineer' },
            startDate: '2023-03', endDate: '',
            url: '',
            highlights: [
              { zh: '主导内部开发者工具的前端架构，从 React 16 升级到 18 并落地并发渲染，首屏提速 35%。', en: 'Led frontend architecture of internal dev tools; upgraded React 16→18 with concurrent rendering, 35% faster first paint.' },
              { zh: '搭建组件库与设计 token 体系，覆盖 40+ 业务页面，设计到上线周期从 2 周缩至 3 天。', en: 'Built a component library + design-token system across 40+ pages; design-to-ship cycle 2 weeks → 3 days.' },
            ],
          },
          {
            id: 'wk2', name: { zh: '某创业团队', en: 'A Startup' }, position: { zh: '前端开发实习生', en: 'Frontend Intern' },
            startDate: '2022-06', endDate: '2022-09',
            highlights: [
              { zh: '参与官网与后台管理系统的开发，用 Vite 重构构建流程，冷启动从 60s 降至 3s。', en: 'Built marketing site + admin dashboard; rebuilt with Vite, cold start 60s → 3s.' },
            ],
          },
        ],
      },
      {
        id: 'sec_edu', type: 'education', title: { zh: '教育经历', en: 'Education' }, layout: 'main', visible: true,
        items: [
          {
            id: 'ed1', institution: { zh: '某大学', en: 'A University' },
            area: { zh: '计算机科学与技术', en: 'Computer Science' }, studyType: { zh: '本科', en: 'B.Sc.' },
            startDate: '2019-09', endDate: '2023-06',
            highlights: [
              { zh: '获奖：ACM 校赛银牌、校级优秀毕业设计。', en: 'Awards: ACM regional silver medal, outstanding thesis award.' },
              { zh: '校园经历：技术协会前端方向负责人，组织 React 工作坊。', en: 'Campus: led the frontend track of the tech club, ran React workshops.' },
            ],
          },
        ],
      },
      {
        id: 'sec_match', type: 'matches', title: { zh: '招聘要求匹配', en: 'Match' }, layout: 'sidebar', visible: true,
        items: [
          { id: 'm1', tag: { zh: 'React 全栈', en: 'React Full-Stack' }, body: { zh: 'React 18 + TS 实战，OmniaResumae 从零到上线。', en: 'React 18 + TS in production; shipped OmniaResumae from scratch.' } },
          { id: 'm2', tag: { zh: 'AI 集成', en: 'AI Integration' }, body: { zh: '多模型适配 + 结构化输出 + 提案审阅闭环。', en: 'Multi-provider adapters + structured output + proposal-review loop.' } },
          { id: 'm3', tag: { zh: '工程化', en: 'Engineering' }, body: { zh: '代码分割、懒加载、静态部署，首屏 ~140kB gzip。', en: 'Code-splitting, lazy loading, static deploy; ~140kB gzip first paint.' } },
          { id: 'm4', tag: { zh: '开发者工具', en: 'Dev Tooling' }, body: { zh: '专注开发者体验，做过组件库、构建优化、简历工具。', en: 'Focus on DX; built component libs, build optimization, a resume tool.' } },
        ],
      },
      {
        id: 'sec_dom', type: 'domains', title: { zh: '涉足领域', en: 'Domains' }, layout: 'sidebar', visible: true,
        items: [
          { id: 'd1', icon: '', name: { zh: '开发者工具', en: 'Dev Tools' }, sub: { zh: '简历 · 组件库 · 构建', en: 'Resume · Libs · Build' } },
          { id: 'd2', icon: '', name: { zh: 'AI 应用', en: 'AI Apps' }, sub: { zh: '多模型 · 结构化输出', en: 'Multi-model · Structured' } },
          { id: 'd3', icon: '', name: { zh: '模板引擎', en: 'Templating' }, sub: { zh: '多风格 · 实时渲染', en: 'Multi-style · Live' } },
        ],
      },
      {
        id: 'sec_aw', type: 'awards', title: { zh: '奖项', en: 'Awards' }, layout: 'sidebar', visible: true,
        items: [
          { id: 'a1', title: { zh: 'ACM 校赛银牌', en: 'ACM Regional Silver Medal' }, date: '2021', awarder: { zh: 'ACM', en: 'ACM' } },
          { id: 'a2', title: { zh: '校级优秀毕业设计', en: 'Outstanding Thesis Award' }, date: '2023', awarder: { zh: '某大学', en: 'A University' } },
        ],
      },
      {
        id: 'sec_pub', type: 'publications', title: { zh: '专利', en: 'Patents' }, layout: 'sidebar', visible: true,
        items: [],
      },
      {
        id: 'sec_comm', type: 'community', title: { zh: '社区', en: 'Community' }, layout: 'sidebar', visible: true,
        items: [
          { id: 'c1', platform: 'GitHub', handle: 'YUZHEthefool', url: 'https://github.com/YUZHEthefool' },
        ],
      },
    ],
    locale: 'zh',
    createdAt: now,
    updatedAt: now,
  }
}
