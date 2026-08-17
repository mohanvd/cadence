import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: '#0a0a0a',
            color: '#f5f5f5',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Inter, sans-serif',
            gap: '12px',
          }}
        >
          <p style={{ fontSize: '15px', fontWeight: 600 }}>Something went wrong</p>
          <p style={{ fontSize: '13px', color: '#52525b' }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '8px',
              background: '#1a1a1a',
              color: '#f5f5f5',
              border: '1.5px solid #2a2a2a',
              borderRadius: '8px',
              padding: '8px 18px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
