import React from 'react';

/**
 * A render error anywhere in the tree used to blank the page mid-auction with no
 * way back. This keeps the room code and a reload within reach instead.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ui] render error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="shell home">
        <div className="hero">
          <span className="badge">Auction Arena</span>
          <h1>Something broke on screen</h1>
          <p>
            The auction itself runs on the server, so your squad and purse are safe. Reload to
            drop back into the room.
          </p>
        </div>
        <section className="card home-card stack">
          <button type="button" className="btn primary block" onClick={() => window.location.reload()}>
            Reload the app
          </button>
          <button type="button" className="btn ghost block" onClick={() => { window.location.href = '/'; }}>
            Back to the start
          </button>
          <details>
            <summary className="dim" style={{ fontSize: 12, cursor: 'pointer' }}>Technical details</summary>
            <pre
              style={{
                fontSize: 11,
                color: 'var(--muted)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginTop: 8,
              }}
            >
              {String(error?.stack || error)}
            </pre>
          </details>
        </section>
      </main>
    );
  }
}
