import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // 编辑器 chrome 用 Tailwind；模板用各自 scoped CSS，不进入 Tailwind 处理
  theme: {
    extend: {
      colors: {
        // 编辑器 UI 主色（中性）
        chrome: {
          bg: '#f6f6f4',
          panel: '#ffffff',
          border: '#e4e4e0',
          ink: '#1a1a1a',
          muted: '#8a8a86',
          accent: '#111111',
        },
      },
      fontFamily: {
        ui: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
