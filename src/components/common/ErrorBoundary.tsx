/**
 * ErrorBoundary：捕获子树渲染错误，显示错误而非白屏
 */
import { Component, type ReactNode } from 'react'

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
      return (
        <div style={{ padding: 24, fontFamily: 'ui-monospace, monospace', fontSize: 13, color: '#b00', background: '#fff0f0' }}>
          <h2 style={{ marginTop: 0 }}>渲染出错（白屏已转为可见错误）</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 12, padding: '4px 10px' }}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
