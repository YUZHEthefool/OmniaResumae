import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 把编辑器运行时与重依赖拆分；重依赖已通过动态 import 按需加载
        manualChunks: {
          react: ['react', 'react-dom'],
          state: ['zustand', 'dexie', 'zod', 'clsx'],
        },
      },
    },
  },
})
