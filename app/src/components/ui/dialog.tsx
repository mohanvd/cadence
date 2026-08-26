import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePortalContainer } from './portal-container';
import { createPortal } from 'react-dom';

/**
 * A modal the application asks a question with.
 *
 * There is one of these rather than a hand-rolled overlay per question,
 * because the three questions worth asking, name this, rename this, are you
 * sure, differ only in their words. Written separately they drift into three
 * slightly different boxes with the buttons in three different orders, which
 * is what makes an application feel assembled rather than designed.
 *
 * Everything a dialog has to get right is here once: it takes focus, Escape
 * closes it, the backdrop closes it, clicking inside does not, and the primary
 * action is on the right where the eye finishes.
 */
export interface DialogProps {
  title: string;
  /** A sentence under the title, when the title alone is not enough. */
  description?: string;
  /** The label on the confirming button. */
  confirm: string;
  /** Red rather than white, for the ones that take something away. */
  destructive?: boolean;
  /** Disabled until this is true, a name field with nothing in it. */
  ready?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** A field, when the question needs an answer rather than a yes. */
  children?: React.ReactNode;
}

export function Dialog({
  title,
  description,
  confirm,
  destructive = false,
  ready = true,
  onConfirm,
  onCancel,
  children,
}: DialogProps) {
  const container = usePortalContainer() ?? document.body;

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    };
    // Captured, so a dialog over the player closes rather than the player
    // reading Escape as "leave fullscreen".
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 p-6 animate-in fade-in-0 duration-150"
      onMouseDown={onCancel}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onConfirm();
        }}
        className={cn(
          'w-[26rem] max-w-full rounded-[var(--radius-panel)] border border-line bg-surface-1 p-6',
          'shadow-[var(--shadow-panel)] animate-in fade-in-0 zoom-in-95 duration-150',
        )}
      >
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {description && (
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{description}</p>
        )}

        {children && <div className="mt-5">{children}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={destructive ? 'danger' : 'default'}
            disabled={!ready}
          >
            {confirm}
          </Button>
        </div>
      </form>
    </div>,
    container,
  );
}

/** The field a dialog asks for a name with, styled once. */
export const DialogField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    autoFocus
    className={cn(
      'w-full rounded-[var(--radius-control)] border border-line bg-surface-2 px-3.5 py-2.5',
      'text-[14px] text-fg placeholder:text-fg-subtle',
      'focus:border-line-strong focus:outline-none',
      className,
    )}
    {...props}
  />
));
DialogField.displayName = 'DialogField';
