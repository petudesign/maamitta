import { Component, type ErrorInfo, type ReactNode } from 'react';
import { MaamittaLogo } from './MaamittaLogo';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Maamitta] Unhandled render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="not-found-shell">
          <div className="not-found-card">
            <div className="not-found-brand">
              <MaamittaLogo size={40} />
              <span className="not-found-brand-name">Maamitta</span>
            </div>
            <h1 className="not-found-title">Odottamaton virhe</h1>
            <p className="not-found-desc">
              Sovelluksessa tapahtui virhe. Tallennetut projektisi ovat turvassa
              selaimen muistissa — lataa sivu uudelleen jatkaaksesi.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Lataa sivu uudelleen
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
