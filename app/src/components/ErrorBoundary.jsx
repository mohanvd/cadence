import { Component } from 'react';
import { Mark } from './ui/mark';
import { isDesktop } from '../lib/desktop';

/* Inline styles, with each token's value as its fallback, because this is
   what renders when something has already gone wrong, and the less it depends
   on, the more likely it is to render at all. */
const ink = {
  ground: 'var(--cd-bg, #0B0A09)',
  surface: 'var(--cd-surface-2, #1B1918)',
  line: 'var(--cd-line-strong, #413F3E)',
  text: 'var(--cd-text, #F3F1F0)',
  muted: 'var(--cd-text-muted, #A6A4A3)',
  accent: 'var(--cd-accent, #F97C3D)',
  accentInk: 'var(--cd-accent-ink, #0B0A09)',
};

const button = {
  borderRadius: '8px',
  padding: '8px 18px',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

async function closeWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().close();
}

/**
 * What the window shows when the interface itself has failed.
 *
 * The window has no frame of its own: the title bar, with its close button and
 * its drag region, is part of the interface, and the interface is what just
 * failed. So this screen carries both, or somebody looking at it has no way to
 * move the window or close it short of a keyboard shortcut they may not know.
 */
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
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        data-tauri-drag-region
        style={{
          background: ink.ground,
          color: ink.text,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', system-ui, sans-serif",
          gap: '12px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <Mark size={40} cut="full" style={{ marginBottom: '8px' }} />
        <p style={{ fontSize: '16px', fontWeight: 600 }}>Something went wrong</p>
        <p style={{ maxWidth: '36em', fontSize: '13px', lineHeight: 1.5, color: ink.muted }}>
          {this.state.error?.message || 'Unknown error'}
        </p>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ ...button, background: ink.accent, color: ink.accentInk, border: 'none' }}
          >
            Reload
          </button>
          {isDesktop() && (
            <button
              type="button"
              onClick={() => void closeWindow()}
              style={{
                ...button,
                background: ink.surface,
                color: ink.text,
                border: `1px solid ${ink.line}`,
              }}
            >
              Close Cadence
            </button>
          )}
        </div>
      </div>
    );
  }
}
