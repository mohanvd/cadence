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

/**
 * A sleeve for a record that has none, drawn from the folder it lives in.
 *
 * Seeded by the folder rather than the file, so every track on a record wears
 * the same one and the next record along wears a different one: a wall of
 * identical grey squares is a wall nobody can find anything in. The colours are
 * the site's generated sleeves: a hue from the seed, at a lightness and chroma
 * low enough that a sleeve never outshouts a real one beside it.
 */
function generatedSleeve(path: string | null): React.CSSProperties {
  const folder = path ? path.replace(/[\\/][^\\/]*$/, '') : '';
  let hash = 2166136261;
  for (let i = 0; i < folder.length; i++) {
    hash = Math.imul(hash ^ folder.charCodeAt(i), 16777619);
  }
  /* Every hue but the olives, which at this lightness and chroma come out as
     mud rather than as a colour. */
  const turn = (hash >>> 0) % 320;
  const hue = turn < 80 ? turn : turn + 40;
  return {
    background: [
      `radial-gradient(70% 60% at 30% 25%, oklch(0.78 0.07 ${hue + 20} / 0.5), transparent 70%)`,
      `linear-gradient(150deg, oklch(0.52 0.09 ${hue}) 0%, oklch(0.32 0.07 ${hue + 24}) 52%, oklch(0.18 0.04 ${hue + 48}) 100%)`,
    ].join(', '),
  };
}

export function Artwork({ path, width = 320, className, rounded = true }: ArtworkProps) {
  const [src, setSrc] = React.useState<string | null>(null);
  /* Three states, not two. While the address is being asked for, or the
     picture is on its way, the tile is a plain surface; only once it is known
     that there is no sleeve does it get a generated one. Otherwise a library
     being scrolled flashes colour behind every sleeve before it arrives. */
  const [absent, setAbsent] = React.useState(false);

  React.useEffect(() => {
    setSrc(null);
    if (!path) {
      setAbsent(true);
      return undefined;
    }
    let live = true;
    setAbsent(false);
    void artworkUrl(path, { width }).then((url) => {
      if (!live) return;
      setSrc(url);
      // No pipeline, so there is no way to fetch a sleeve at all.
      if (!url) setAbsent(true);
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

  if (absent) {
    return (
      <div
        className={cn(shell, 'shadow-[inset_0_1px_0_oklch(1_0_0/0.12),inset_0_0_0_1px_oklch(0_0_0/0.25)]')}
        style={generatedSleeve(path)}
        aria-hidden
      >
        <Icon name="music" className="size-1/4 text-white/30" />
      </div>
    );
  }

  return (
    <div className={shell}>
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-cover"
          onError={() => setAbsent(true)}
        />
      )}
    </div>
  );
}
