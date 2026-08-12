import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import './index.css'

// 捕获顶层未处理的错误，避免静默白屏
window.addEventListener('error', (e) => {
  console.error('window error:', e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('unhandled rejection:', e.reason)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
