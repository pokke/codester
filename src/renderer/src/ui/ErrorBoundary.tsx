import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
  stack: string
}

// Fångar render-fel så att ett oväntat undantag visar ett felkort i stället
// för att blanka hela appen. Visar felet så det går att felsöka.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, stack: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ stack: info.componentStack ?? '' })
    // eslint-disable-next-line no-console
    console.error('Render-fel:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h2>Något gick fel</h2>
          <p className="muted small">
            Ett oväntat fel inträffade i gränssnittet. Ladda om för att fortsätta.
          </p>
          <pre className="error-detail">
            {this.state.error.stack || this.state.error.message}
            {this.state.stack}
          </pre>
          <button className="btn primary" onClick={() => location.reload()}>
            Ladda om
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
