/**
 * ErrorBoundary：捕获子树渲染错误，显示错误而非白屏
 */
import { Component, type ReactNode } from 'react'
import { useUIStore } from '@/store/uiStore'
import { t } from '@/i18n'

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // 同时打到 console 便于调试
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      const locale = useUIStore.getState().locale
      return (
        <div style={{ padding: 24, fontFamily: 'ui-monospace, monospace', fontSize: 13, color: '#b00', background: '#fff0f0' }}>
          <h2 style={{ marginTop: 0 }}>{t('errTitle', locale)}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 12, padding: '4px 10px' }}
          >
            {t('retry', locale)}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
