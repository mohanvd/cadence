import * as React from 'react';
import { cn } from '@/lib/utils';

interface Toast {
  id: number;
  message: string;
}

const DURATION_MS = 2400;

/**
 * Minimal transient messaging for the player.
 *
 * Toasts stack rather than replace: enabling the equalizer and hitting the
 * sleep timer in quick succession should show both, not race each other.
 */
export function useToaster() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);

  const show = React.useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION_MS);
  }, []);

  return { toasts, show };
}

export function Toaster({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-28 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'rounded-full border border-line bg-surface-1/90 px-4 py-2 text-[13px] text-fg shadow-[var(--shadow-panel)] backdrop-blur-xl',
            'animate-in fade-in-0 slide-in-from-bottom-2',
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
