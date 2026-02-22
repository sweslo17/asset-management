import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-muted-foreground">
          <p className="text-lg">發生錯誤</p>
          <p className="text-sm">{this.state.error?.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}
