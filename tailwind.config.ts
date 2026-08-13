import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // 编辑器 chrome 用 Tailwind；模板用各自 scoped CSS，不进入 Tailwind 处理
  theme: {
    extend: {
      colors: {
        // 编辑器 UI 主色（CSS 变量驱动，html.dark 覆盖为深灰）
        chrome: {
          bg: 'var(--chrome-bg)',
          panel: 'var(--chrome-panel)',
          border: 'var(--chrome-border)',
          ink: 'var(--chrome-ink)',
          muted: 'var(--chrome-muted)',
          accent: 'var(--chrome-accent)',
        },
        // AI Copilot 面板专用深色主题（与浅色编辑器对比，类 VSCode 侧栏）
        copilot: {
          bg: '#0f0f12',
          surface: '#1a1a1f',
          surface2: '#24242b',
          border: '#2e2e36',
          ink: '#ececf1',
          muted: '#8e8e98',
          dim: '#6b6b75',
          accent: '#a78bfa',
          accentSoft: '#3a2e5a',
        },
      },
      fontFamily: {
        ui: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
