import * as React from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { Icon, type IconName } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { usePortalContainer } from './portal-container';

/**
 * Right-click menus, styled to match the popover menus in the control bar.
 *
 * The visual language is deliberately identical, same surface, radius, row
 * height and check rail, so a right-click feels like the same product as the
 * settings button rather than a second design.
 *
 * Portalling goes through `usePortalContainer` for the same reason the popovers
 * do: a menu portalled to `document.body` is invisible while the player is
 * fullscreen, because only the fullscreened subtree gets painted.
 */

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuSub = ContextMenuPrimitive.Sub;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

const surface =
  'z-50 min-w-52 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface-1/95 p-1.5 text-fg shadow-[var(--shadow-panel)] backdrop-blur-xl';

const enterExit =
  'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95';

/** Row styling shared by every kind of item, so the text always lines up. */
const row =
  'relative flex cursor-default select-none items-center gap-2.5 rounded-md py-1.5 pr-2.5 pl-8 text-[13px] text-fg-muted outline-none transition-colors focus:bg-surface-3 focus:text-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0';

export const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => {
  const container = usePortalContainer();
  return (
    <ContextMenuPrimitive.Portal container={container}>
      <ContextMenuPrimitive.Content
        ref={ref}
        // Keep clear of the window edges and flip rather than run off the
        // bottom: right-clicking low in a fullscreen player otherwise pins a
        // tall menu against the edge with its last items unreachable.
        collisionPadding={16}
        avoidCollisions
        className={cn(
          surface,
          enterExit,
          // Last resort when even the flipped side has no room: scroll inside
          // the menu instead of overflowing the screen.
          'max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto scroll-slim',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
});
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

export const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    /** Right-aligned hint, normally the keyboard shortcut. */
    shortcut?: string;
    /**
     * A glyph for the left gutter.
     *
     * A prop rather than a child, because every row reserves that gutter for
     * the check indicator and a glyph passed as a child lands inside the label
     * instead — where, the label being a block, it sits above the words rather
     * than beside them.
     */
    icon?: IconName;
  }
>(({ className, children, shortcut, icon, ...props }, ref) => (
  <ContextMenuPrimitive.Item ref={ref} className={cn(row, className)} {...props}>
    {icon && (
      <span className="absolute left-2 flex size-4 items-center justify-center text-fg-subtle">
        <Icon name={icon} size={14} />
      </span>
    )}
    <span className="flex-1 truncate">{children}</span>
    {shortcut && (
      <span className="ml-auto pl-4 text-[11px] tracking-wide text-fg-subtle">
        {shortcut}
      </span>
    )}
  </ContextMenuPrimitive.Item>
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

export const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem> & {
    shortcut?: string;
  }
>(({ className, children, checked, shortcut, ...props }, ref) => (
  <ContextMenuPrimitive.CheckboxItem
    ref={ref}
    checked={checked}
    className={cn(row, className)}
    {...props}
  >
    {/* The check sits in the left gutter every row reserves, so labels stay
        aligned whether or not they are checkable. */}
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <Icon name="check" size={14} className="text-accent" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    <span className="flex-1 truncate">{children}</span>
    {shortcut && (
      <span className="ml-auto pl-4 text-[11px] tracking-wide text-fg-subtle">
        {shortcut}
      </span>
    )}
  </ContextMenuPrimitive.CheckboxItem>
));
ContextMenuCheckboxItem.displayName = ContextMenuPrimitive.CheckboxItem.displayName;

export const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.RadioItem ref={ref} className={cn(row, className)} {...props}>
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <span className="size-1.5 rounded-full bg-accent" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    <span className="flex-1 truncate">{children}</span>
  </ContextMenuPrimitive.RadioItem>
));
ContextMenuRadioItem.displayName = ContextMenuPrimitive.RadioItem.displayName;

export const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(row, 'data-[state=open]:bg-surface-3 data-[state=open]:text-fg', className)}
    {...props}
  >
    <span className="flex-1 truncate">{children}</span>
    <Icon name="submenu" size={14} className="ml-auto text-fg-subtle" />
  </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName;

export const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => {
  const container = usePortalContainer();
  return (
    <ContextMenuPrimitive.Portal container={container}>
      <ContextMenuPrimitive.SubContent
        ref={ref}
        collisionPadding={16}
        avoidCollisions
        className={cn(
          surface,
          enterExit,
          'min-w-40 max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto scroll-slim',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
});
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName;

export function ContextMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
      {children}
    </div>
  );
}

export function ContextMenuSeparator() {
  return <ContextMenuPrimitive.Separator className="my-1.5 h-px bg-line" />;
}
