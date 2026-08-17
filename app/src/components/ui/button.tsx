import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-fg text-base hover:bg-fg/90',
        accent: 'bg-accent text-accent-fg hover:bg-accent-hover',
        secondary: 'bg-surface-2 text-fg hover:bg-surface-3',
        outline: 'border border-line bg-transparent text-fg hover:bg-surface-2',
        ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        /* For controls sitting directly on video, no background until hover. */
        chrome:
          'text-white/85 hover:bg-white/12 hover:text-white active:bg-white/18',
        danger: 'bg-danger text-white hover:bg-danger/90',
      },
      size: {
        default: 'h-9 px-4 [&_svg]:size-4',
        sm: 'h-8 px-3 text-xs [&_svg]:size-3.5',
        lg: 'h-11 px-6 [&_svg]:size-5',
        icon: 'size-9 [&_svg]:size-[18px]',
        'icon-sm': 'size-8 [&_svg]:size-4',
        'icon-lg': 'size-11 [&_svg]:size-6',
        /**
         * A text control that has to sit in a row of icon buttons: the speed
         * badge. Same 36px box and hit area as `icon`, just wider, so the row
         * keeps one optical rhythm instead of one odd short button.
         */
        chip: 'h-9 min-w-9 px-2 text-[13px] font-semibold',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = 'button', onPointerDown, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    /**
     * Controls on the video do not keep focus after a click.
     *
     * A button that holds focus turns the space bar into a second press of
     * whatever was clicked last: click fullscreen, hit space to pause, and the
     * player leaves fullscreen instead. The focus ring that appears with it is
     * the visible half of the same bug.
     *
     * Cancelling the pointer event is what stops the focus from being taken at
     * all, and it costs nothing elsewhere: Tab still focuses these buttons, and
     * still draws the ring, which is the one case where it belongs.
     *
     * `asChild` is excluded. Those are menu triggers, and a popover that cannot
     * take focus cannot return it when the menu closes.
     */
    const suppressFocus = variant === 'chrome' && !asChild;

    const handlePointerDown = React.useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        if (suppressFocus) event.preventDefault();
        onPointerDown?.(event);
      },
      [suppressFocus, onPointerDown],
    );

    return (
      <Comp
        ref={ref}
        // Defaulting to `button` avoids the classic accidental form submit.
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size }), className)}
        onPointerDown={handlePointerDown}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
