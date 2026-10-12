import * as React from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * The few controls the Settings screen is built from.
 *
 * Deliberately few. Every setting in Cadence is one of four things: on or off,
 * one of a handful, a value along a range, or an action. A screen with four
 * kinds of control is a screen whose every row can be read the same way.
 */

/** A titled card of rows: one subject, like "Skipping" or "Resume". */
export function SettingsGroup({
  title,
  children,
  footnote,
}: {
  title?: string;
  children: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <section className="settings-group mb-7">
      {title && (
        <h3 className="mb-2 px-1 text-[11px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
          {title}
        </h3>
      )}
      <div className="divide-y divide-line/70 overflow-hidden rounded-[14px] border border-line/80 bg-surface-1 shadow-[var(--cd-sheen)]">
        {children}
      </div>
      {footnote && <p className="mt-2 px-1 text-[12px] leading-relaxed text-fg-subtle">{footnote}</p>}
    </section>
  );
}

/**
 * One setting: what it is on the left, the control on the right.
 *
 * `onReset` shows a small undo beside the control when the setting is not at
 * its default, so a change can be taken back without remembering what it was.
 * `stacked` puts the control under the words, for the ones too wide to sit
 * beside them: swatches, sliders, a list.
 */
export function SettingRow({
  label,
  description,
  children,
  onReset,
  stacked = false,
  id,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  onReset?: (() => void) | undefined;
  stacked?: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        'flex gap-4 px-4 py-3.5',
        stacked ? 'flex-col' : 'items-center justify-between',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-fg">{label}</div>
        {description && (
          <div className="mt-0.5 text-[12.5px] leading-relaxed text-fg-subtle">{description}</div>
        )}
      </div>
      <div className={cn('flex items-center gap-2', stacked ? 'w-full' : 'shrink-0')}>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
            aria-label="Reset to default"
            title="Reset to default"
          >
            <Icon name="rewind" size={14} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/** On or off. */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'border-transparent bg-accent' : 'border-line-strong bg-surface-3',
      )}
    >
      <span
        className={cn(
          'block size-4 rounded-full shadow-[0_1px_3px_oklch(0_0_0/0.4)] transition-transform duration-200 ease-[var(--cd-ease)]',
          checked ? 'translate-x-[18px] bg-[var(--color-accent-fg)]' : 'translate-x-[2px] bg-fg-muted',
        )}
      />
    </button>
  );
}

export interface Choice<T extends string | number> {
  value: T;
  label: string;
}

/** One of a handful, side by side, so every choice is visible at once. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  wrap = false,
}: {
  value: T;
  options: readonly Choice<T>[];
  onChange: (value: T) => void;
  label: string;
  wrap?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex gap-0.5 rounded-[10px] border border-line bg-surface-2 p-0.5',
        wrap && 'flex-wrap',
      )}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors',
              on
                ? 'bg-surface-3 text-fg shadow-[var(--cd-sheen-strong),0_1px_2px_oklch(0_0_0/0.3)]'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A plain button for an action: rescan, restart, reset. */
export function ActionButton({
  children,
  onClick,
  tone = 'default',
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'accent' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-[8px] px-3.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        tone === 'accent' && 'bg-accent text-accent-fg hover:bg-accent-hover',
        tone === 'danger' && 'border border-danger/40 text-danger hover:bg-danger/10',
        tone === 'default' && 'border border-line-strong bg-surface-2 text-fg hover:bg-surface-3',
      )}
    >
      {children}
    </button>
  );
}

/**
 * An action that asks to be pressed twice, for the ones that cannot be undone
 * by pressing something else: resetting everything. A dialog would be a whole
 * second screen for one question; a button that says "Press again to reset"
 * for three seconds is the question, asked where the finger already is.
 */
export function ConfirmButton({
  children,
  confirm,
  onConfirm,
}: {
  children: React.ReactNode;
  confirm: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return undefined;
    const timer = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <ActionButton
      tone="danger"
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirm : children}
    </ActionButton>
  );
}
