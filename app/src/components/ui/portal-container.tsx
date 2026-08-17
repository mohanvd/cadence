import * as React from 'react';

/**
 * The element that floating UI should portal into.
 *
 * Radix portals to `document.body` by default. That breaks in fullscreen: the
 * browser only paints the fullscreened element's subtree, so a menu portalled
 * to `body` is mounted, focusable and completely invisible, so the button appears
 * to do nothing at all. Pointing the portal at the player shell keeps menus and
 * tooltips inside the subtree that is actually being painted.
 */
const PortalContainerContext = React.createContext<HTMLElement | null>(null);

export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: React.ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  );
}

/** `undefined` (not `null`) so it can be spread straight onto Radix's Portal. */
export function usePortalContainer(): HTMLElement | undefined {
  return React.useContext(PortalContainerContext) ?? undefined;
}
