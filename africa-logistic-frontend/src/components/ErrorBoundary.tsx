import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Catches a render or lazy-load failure and shows something actionable.
 *
 * Until this existed, any thrown error produced a blank white page with nothing on
 * it — no message, no way forward. That included a chunk that failed to load after a
 * deployment, which `lazyWithReload` recovers from once but deliberately rethrows on
 * a second failure rather than reloading forever.
 *
 * Two of these are mounted: one around the router, and one around the car-portal's
 * own Suspense. Without the second, a failure there would bubble up and blank the
 * whole shell instead of just that panel.
 */
interface Props {
  children: ReactNode
  /** Shown instead of the generic heading, e.g. "This dashboard could not load". */
  title?: string
  /** False for an inner boundary, where offering "go to sign-in" would be odd. */
  showSignIn?: boolean
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry service is wired up, so the console is the only record. Keep it:
    // it is what makes a user's screenshot of devtools useful when they report this.
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleSignIn = () => {
    window.location.href = '/login'
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    // A failed dynamic import reads as gibberish to a user, so name it for what it
    // almost always is — the app was updated while this tab was open.
    const isChunkError = /dynamically imported module|Importing a module script failed|Loading chunk/i
      .test(error.message ?? '')

    return (
      <div role="alert" style={{
        minHeight: '60vh', display: 'grid', placeItems: 'center', padding: '1.5rem',
      }}>
        <div className="glass" style={{ maxWidth: 440, width: '100%', padding: '1.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', lineHeight: 1, marginBottom: '0.75rem' }}>⚠️</div>

          <h1 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--clr-text)', margin: '0 0 0.5rem' }}>
            {isChunkError
              ? 'Afri Logistics was just updated'
              : this.props.title ?? 'Something went wrong'}
          </h1>

          <p style={{ fontSize: '0.84rem', color: 'var(--clr-muted)', lineHeight: 1.55, margin: '0 0 1.25rem' }}>
            {isChunkError
              ? 'This page is running an older version. Reload to pick up the new one — nothing you have saved is affected.'
              : 'This screen could not be displayed. Reloading usually fixes it. If it keeps happening, tell us what you were doing when it appeared.'}
          </p>

          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={this.handleReload} className="btn-primary" style={{ padding: '0.6rem 1.2rem', fontWeight: 800 }}>
              Reload
            </button>
            {this.props.showSignIn !== false && (
              <button onClick={this.handleSignIn}
                style={{ padding: '0.6rem 1.2rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                Go to sign-in
              </button>
            )}
          </div>

          {/* The message only — never the stack. Enough for a useful bug report
              without putting internals on screen. */}
          {error.message && (
            <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', marginTop: '1.1rem', wordBreak: 'break-word', opacity: 0.75 }}>
              {error.message}
            </p>
          )}
        </div>
      </div>
    )
  }
}
