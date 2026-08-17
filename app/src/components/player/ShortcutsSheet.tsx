import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BINDINGS, type Binding } from '@/features/keyboard/useKeyboardShortcuts';

const GROUP_TITLES: Record<Binding['group'], string> = {
  playback: 'Playback',
  navigation: 'Navigation',
  audio: 'Audio',
  view: 'View',
};

const GROUP_ORDER: Binding['group'][] = ['playback', 'navigation', 'audio', 'view'];

/** Shortcuts that are handled before the binding table and so are not in it. */
const EXTRA: Array<{ label: string; hint: string; group: Binding['group'] }> = [
  { label: 'Jump to 0–90% of the file', hint: '0 – 9', group: 'navigation' },
];

/**
 * The keyboard reference.
 *
 * Generated from the same `BINDINGS` table the handler reads, so the sheet
 * cannot drift from what the keys actually do, which is the failure mode of every
 * hand-maintained shortcut list.
 */
export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === '?') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const grouped = React.useMemo(() => {
    const map = new Map<Binding['group'], Array<{ label: string; hint: string }>>();
    for (const group of GROUP_ORDER) map.set(group, []);
    for (const binding of BINDINGS) {
      map.get(binding.group)?.push({ label: binding.label, hint: binding.hint });
    }
    for (const extra of EXTRA) {
      map.get(extra.group)?.push({ label: extra.label, hint: extra.hint });
    }
    return map;
  }, []);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-[var(--radius-panel)] border border-line bg-surface-1 p-6 shadow-[var(--shadow-panel)] scroll-slim"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg">Keyboard shortcuts</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>

        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {GROUP_ORDER.map((group) => {
            const rows = grouped.get(group) ?? [];
            if (rows.length === 0) return null;
            return (
              <section key={group}>
                <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
                  {GROUP_TITLES[group]}
                </h3>
                <dl className="space-y-1">
                  {rows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 hover:bg-surface-2"
                    >
                      <dt className="text-[13px] text-fg-muted">{row.label}</dt>
                      <dd className="shrink-0 rounded border border-line-strong bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] leading-none text-fg">
                        {row.hint}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
