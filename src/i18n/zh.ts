export const zh = {
  appName: 'OmniaResumae',
  tagline: '模板化简历生成',

  // 顶栏
  resumes: '简历',
  newResume: '新建',
  language: '语言',
  chinese: '中文',
  english: 'English',
  template: '模板',
  zoom: '缩放',
  import: '导入',
  github: 'GitHub',
  ai: 'AI',
  export: '导出',
  exportPdf: '导出 PDF',
  print: '打印 / 另存 PDF',
  settings: '设置',

  // 编辑面板
  basics: '基本信息',
  basicsName: '姓名',
  basicsNameRomanized: '姓名拼音/罗马名',
  basicsLabel: '头衔/目标岗位',
  basicsSummary: '核心优势 / 引以为傲',
  basicsEmail: '邮箱',
  basicsPhone: '电话',
  basicsUrl: '个人网站',
  basicsLocation: '所在地',
  basicsImage: '头像',
  basicsProfiles: '社交主页',
  metaTargetRole: '目标岗位',
  metaKeywords: '关键词（divider-bar）',
  addSection: '添加段落',
  addItem: '添加条目',
  deleteItem: '删除',
  moveUp: '上移',
  moveDown: '下移',
  visible: '显示',
  hidden: '隐藏',
  sectionTitle: '段落标题',
  layoutMain: '主栏',
  layoutSidebar: '侧栏',

  // section 类型
  typeSkills: '技能',
  typeProjects: '项目',
  typeWork: '工作',
  typeEducation: '教育',
  typeAwards: '奖项',
  typePublications: '专利/出版物',
  typeMatches: '要求匹配',
  typeDomains: '领域',
  typeWorkflow: '工作流',
  typeCommunity: '社区',
  typeCustom: '自定义',

  // 预览
  preview: '预览',
  emptyHint: '左侧填写信息，此处实时渲染',

  // 占位（导入/GitHub/AI 后续 Phase 实现）
  comingSoon: '该功能将在后续阶段实现',

  // AI Copilot 右侧面板
  copilot: 'AI 生成',
  copilotPromptLabel: '描述你想要的简历',
  copilotPromptPlaceholder: '例如：3 年后端工程师，Go/微服务，做过电商订单系统，想找字节后端岗位',
  copilotSourceLabel: '已有材料（可选，忠于事实）',
  copilotSourceHint: '可粘贴旧简历文本，或上传 .md/.txt/.tex/.pdf',
  copilotGenerate: '生成简历',
  copilotGenerating: '生成中…',
  copilotPreviewTitle: '已生成，预览',
  copilotNewDoc: '新建简历',
  copilotOverwrite: '覆盖当前',
  copilotNoKey: '请先在「设置」配置 AI 密钥',
  copilotNoInput: '请输入描述或提供已有材料',
  copilotImportFile: '上传文件',
}

export type Dict = typeof zh
