import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';
import { usePortalContainer } from './portal-container';

export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => {
  const container = usePortalContainer();
  return (
  <TooltipPrimitive.Portal container={container}>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-fg shadow-[var(--shadow-panel)]',
        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * Tooltip with the keyboard shortcut rendered as a key cap.
 *
 * Player controls are the one place where surfacing the shortcut matters most:
 * it is how a mouse user gradually becomes a keyboard user.
 */
export function Tooltip({
  label,
  shortcut,
  children,
  side = 'top',
}: {
  label: string;
  shortcut?: string;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <span className="flex items-center gap-2">
          {label}
          {shortcut && (
            <kbd className="rounded border border-line-strong bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] leading-none text-fg-muted">
              {shortcut}
            </kbd>
          )}
        </span>
      </TooltipContent>
    </TooltipRoot>
  );
}
