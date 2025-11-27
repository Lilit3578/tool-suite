// src/renderer/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Error Boundary component to catch React component errors
 * Prevents the entire app from crashing when a component throws an error
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    // Update state with error info
    this.setState({
      error,
      errorInfo,
    })

    // You can also log the error to an error reporting service here
    // Example: logErrorToService(error, errorInfo)
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      // Render custom fallback UI or default
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: '20px',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#333',
        }}>
          <h2 style={{ marginBottom: '16px', fontSize: '20px', fontWeight: '600' }}>
            Something went wrong
          </h2>
          <p style={{ marginBottom: '24px', color: '#666', maxWidth: '400px' }}>
            An unexpected error occurred. Please restart the app or try again.
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{
              marginBottom: '24px',
              padding: '12px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              maxWidth: '600px',
              textAlign: 'left',
              fontSize: '12px',
            }}>
              <summary style={{ cursor: 'pointer', marginBottom: '8px', fontWeight: '600' }}>
                Error Details (Development Only)
              </summary>
              <pre style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                fontSize: '11px',
                color: '#d32f2f',
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack && (
                  <>
                    {'\n\nComponent Stack:'}
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 16px',
              backgroundColor: '#007AFF',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#0051D5'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#007AFF'
            }}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

