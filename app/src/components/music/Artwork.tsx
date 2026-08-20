import * as React from 'react';
import { artworkUrl } from '@/lib/desktop';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * A record sleeve, or the space where one would be.
 *
 * Most files have one and some do not, and the difference has to cost nothing
 * to find out: a library view asks for eighty of these at once while it is
 * being scrolled, and eighty failures should look like eighty placeholders
 * rather than eighty broken images.
 *
 * Two things are worth writing down about how this fetches.
 *
 * The address is resolved through a promise, because the pipeline's port is
 * decided at startup and the page may render before it is known. The promise
 * is cached module-wide by `mediaEndpoint`, so this costs a microtask after
 * the first one rather than a round trip each.
 *
 * And the width is asked for rather than left to CSS. Sleeves are routinely
 * stored at three thousand pixels square; a grid of eighty of those is several
 * hundred megabytes of decoded bitmap held by the webview to draw squares two
 * hundred pixels wide, and the browser will do exactly that if allowed to.
 */
export interface ArtworkProps {
  /** The track whose sleeve to show. Null draws the placeholder. */
  path: string | null;
  /** What to ask the shell for, in pixels. Match it to the drawn size. */
  width?: number;
  className?: string;
  /** Rounded like a tile by default; square when it fills a larger surface. */
  rounded?: boolean;
}

export function Artwork({ path, width = 320, className, rounded = true }: ArtworkProps) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!path) {
      setSrc(null);
      return undefined;
    }
    let live = true;
    setFailed(false);
    void artworkUrl(path, { width }).then((url) => {
      if (live) setSrc(url);
    });
    return () => {
      live = false;
    };
  }, [path, width]);

  const shell = cn(
    'relative flex items-center justify-center overflow-hidden bg-surface-2',
    rounded && 'rounded-[10px]',
    className,
  );

  if (!src || failed) {
    return (
      <div className={shell} aria-hidden>
        <Icon name="music" className="size-1/3 text-fg-subtle/40" />
      </div>
    );
  }

  return (
    <div className={shell}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="size-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
