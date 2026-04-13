import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryState {
  hasError: boolean
}

interface AppErrorBoundaryProps {
  children: ReactNode
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Winkd render error', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              'radial-gradient(ellipse at center, #1a4a8a 0%, #0a1530 100%)',
            color: '#e8f4ff',
            fontFamily: "'Segoe UI', Tahoma, Geneva, sans-serif",
          }}
        >
          <div
            style={{
              width: 420,
              maxWidth: '90vw',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
              padding: '20px 22px',
            }}
          >
            <h1 style={{ margin: 0, fontSize: 18 }}>Winkd failed to load</h1>
            <p style={{ margin: '10px 0 0', lineHeight: 1.4, fontSize: 13 }}>
              Something crashed while rendering. Please refresh the page. If the
              issue keeps happening, open DevTools and share the first red error
              in the Console.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
