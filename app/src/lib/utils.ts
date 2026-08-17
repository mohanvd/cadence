import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with correct precedence.
 *
 * `clsx` resolves conditionals; `twMerge` then drops earlier classes that the
 * later ones override, so a caller's `className` always wins over a component's
 * defaults instead of depending on stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
