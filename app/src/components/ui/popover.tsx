import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';
import { usePortalContainer } from './portal-container';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * Coordinates the control-bar menus so only one is ever open.
 *
 * Each popover is an independent non-modal dismissable layer, so clicking a
 * second trigger leaves the first menu open, with two panels stacked over the
 * video at once. Making them modal would fix that but would also trap focus
 * and block the picture, so instead a single id is tracked centrally.
 *
 * The id lives in a module-level store rather than React context: the menus sit
 * in a control bar that re-renders on every frame of playback, and a
 * subscription that does not depend on provider position or render timing is
 * one less thing to reason about.
 */
const menuListeners = new Set<() => void>();
let activeMenuId: string | null = null;

function setActiveMenu(id: string | null): void {
  if (activeMenuId === id) return;
  activeMenuId = id;
  if (id) watchForOutsidePointer();
  else stopWatchingForOutsidePointer();
  for (const listener of menuListeners) listener();
}

/*
 * Close the open menu when the pointer goes down anywhere else.
 *
 * Radix dismisses its own layers on an outside pointer down, and here it did
 * not: every menu in the player had to be closed by pressing the button that
 * opened it, which is not how a menu behaves anywhere. Rather than work out
 * which handler between the picture and the document was eating the event,
 * this listens on the window in the capture phase, where nothing downstream
 * can have stopped anything yet.
 *
 * The bug hid for a long time because a menu is chrome, and chrome fades out
 * with the rest of the controls a few seconds after the pointer stops moving.
 * A menu that was still open looked exactly like one that had closed.
 */
function onOutsidePointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  // Inside the panel, or on the button that owns it: both already have their
  // own behaviour, and a second opinion here would fight the toggle.
  if (target.closest('[data-menu-panel]')) return;
  if (target.closest('[aria-haspopup="dialog"]')) return;
  setActiveMenu(null);
}

function watchForOutsidePointer(): void {
  window.addEventListener('pointerdown', onOutsidePointerDown, true);
}

function stopWatchingForOutsidePointer(): void {
  window.removeEventListener('pointerdown', onOutsidePointerDown, true);
}

function subscribeMenu(listener: () => void): () => void {
  menuListeners.add(listener);
  return () => menuListeners.delete(listener);
}

/**
 * Scopes a set of menus. Closes whatever was open when the group unmounts, so a
 * menu never survives the player closing underneath it.
 */
export function MenuGroup({ children }: { children: React.ReactNode }) {
  React.useEffect(() => () => setActiveMenu(null), []);
  return <>{children}</>;
}

/**
 * Close whatever menu is open, from outside the group.
 *
 * Unmounting is not the only way a menu stops being reachable. The music
 * player is *hidden* rather than closed when you go back to the library, which
 * takes its buttons off the screen while leaving them mounted — and a menu
 * left open behind that reappears, still open, when the player comes back.
 */
export function closeMenus(): void {
  setActiveMenu(null);
}

/** Controlled-open props for a `Popover` that participates in the group. */
export function useExclusiveMenu(id: string): {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} {
  const activeId = React.useSyncExternalStore(
    subscribeMenu,
    () => activeMenuId,
    () => null,
  );

  return {
    open: activeId === id,
    onOpenChange: (next: boolean) => setActiveMenu(next ? id : null),
  };
}

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'end', sideOffset = 12, ...props }, ref) => {
  const container = usePortalContainer();
  return (
  <PopoverPrimitive.Portal container={container}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      // A phone held sideways is 375px tall, and the settings root is longer
      // than that: without a ceiling and a scroller the bottom rows are simply
      // unreachable. The padding keeps the panel off the screen edge on the
      // narrow side, where Radix would otherwise flush it against the bezel.
      collisionPadding={12}
      data-player-chrome
      data-menu-panel
      onCloseAutoFocus={(event) => {
        /* Radix hands focus back to the button that opened the menu, and in a
           player that is wrong twice over. Every one of these buttons carries
           a tooltip, and a tooltip opens on focus as readily as on hover, so
           dismissing any menu with the mouse flashed a label for an instant.
           It also leaves a focus ring on a control the user has just finished
           with. Shortcuts listen on the window, so nothing needs focus to
           keep working. A caller that wants the focus back can say so: this
           spreads before `props`. */
        event.preventDefault();
      }}
      className={cn(
        'z-50 w-64 rounded-[var(--radius-panel)] border border-line bg-surface-1/95 p-1.5 text-fg shadow-[var(--shadow-panel)] backdrop-blur-xl',
        'max-h-[min(70vh,440px)] overflow-x-hidden overflow-y-auto scroll-slim overscroll-contain',
        'animate-in fade-in-0 zoom-in-95 data-[side=top]:slide-in-from-bottom-2',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

/** Section heading inside a menu. */
export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div className="my-1.5 h-px bg-line" />;
}

/** A selectable row, with the check rail aligned across every item. */
export function MenuItem({
  children,
  onSelect,
  active = false,
  disabled = false,
  trailing,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  active?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors',
        // A 28px row is a comfortable mouse target and a poor thumb one.
        '[@media(pointer:coarse)]:py-2.5 [@media(pointer:coarse)]:text-[14px]',
        'hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-40',
        active ? 'text-fg' : 'text-fg-muted',
      )}
    >
      <span className="truncate">{children}</span>
      <span className="flex shrink-0 items-center gap-2 text-fg-subtle">
        {trailing}
        {active && <span className="size-1.5 rounded-full bg-accent" />}
      </span>
    </button>
  );
}

/** Labelled slider row used throughout the settings menus. */
export function MenuSlider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="px-2.5 py-2">
      <div className="mb-2 flex items-center justify-between text-[12px]">
        <span className="text-fg-muted">{label}</span>
        <span className="tabular-nums text-fg">{format ? format(value) : value}</span>
      </div>
      <SliderPrimitive.Root
        className="relative flex h-4 w-full touch-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={([next]) => onChange(next ?? value)}
      >
        <SliderPrimitive.Track className="relative h-[3px] w-full grow overflow-hidden rounded-full bg-surface-3">
          <SliderPrimitive.Range className="absolute h-full bg-accent" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block size-3.5 rounded-full bg-accent shadow-[var(--shadow-control)] focus-visible:outline-2 focus-visible:outline-accent" />
      </SliderPrimitive.Root>
    </div>
  );
}
