import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { MenuGroup } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PlayerFeatures } from '@/features/usePlayerFeatures';
import type { MusicModeApi } from '@/features/playback/useMusicMode';
import type { VideoFitApi } from '@/features/playback/useVideoFit';
import { useIsPaused, usePlayerActions } from '@/store/playerStore';
import { BookmarkMenu } from './BookmarkMenu';
import { SettingsMenu } from './SettingsMenu';
import { SpeedMenu } from './SpeedMenu';
import { SubtitleMenu } from './SubtitleMenu';
import { Timeline } from './Timeline';
import { TimeReadout } from './TimeReadout';
import { VolumeControl } from './VolumeControl';

function PlayButton() {
  const paused = useIsPaused();
  const { togglePlay } = usePlayerActions();
  return (
    <Tooltip label={paused ? 'Play' : 'Pause'} shortcut="Space">
      <Button
        variant="chrome"
        size="icon-lg"
        onClick={togglePlay}
        aria-label={paused ? 'Play' : 'Pause'}
        className="[&_svg]:size-6"
      >
        {/* The only filled glyph in the bar, and the largest: see
            components/ui/icons.tsx.
            
            Keyed on the state so React replaces the glyph rather than
            reusing it, which is what lets the entry animation run on every
            toggle. The mark is the one thing in the bar the eye returns to
            most, and having it swap without a beat reads as a flicker. */}
        <Icon
          key={paused ? 'play' : 'pause'}
          name={paused ? 'play' : 'pause'}
          size={24}
          className="animate-in fade-in-0 zoom-in-75 duration-200 ease-[var(--ease-out-quint)]"
        />
      </Button>
    </Tooltip>
  );
}

export interface ControlBarProps {
  visible: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  features: PlayerFeatures;
  ambient: { enabled: boolean; toggle: () => void };
  musicMode: MusicModeApi;
  fit: VideoFitApi;
  onNext?: (() => void) | undefined;
  onPrevious?: (() => void) | undefined;
}

export function ControlBar({
  visible,
  isFullscreen,
  onToggleFullscreen,
  features,
  ambient,
  musicMode,
  fit,
  onNext,
  onPrevious,
}: ControlBarProps) {
  const { seekBy } = usePlayerActions();

  /**
   * Publish how tall the bar's controls are, for the subtitles to clear.
   *
   * Measured rather than written down. The height depends on the density the
   * viewer chose — `--control-scale` is applied here as `zoom`, so it is
   * already in what the box reports — and on which optional buttons this file
   * gave the bar. A number kept in the stylesheet would be right at one
   * setting and would put the subtitles through the buttons at the others.
   */
  const contentRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const publish = () => {
      // `pb-6` sits below this box and is part of the clearance.
      const height = content.getBoundingClientRect().height + 24;
      document.documentElement.style.setProperty('--control-height', `${Math.round(height)}px`);
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Bookmarks appear as ticks on the scrub bar, so saved points are findable
  // without opening the menu. Rounded to the second and deduped: two bookmarks
  // a frame apart are one tick visually, and would otherwise collide as
  // duplicate React keys.
  const markers = React.useMemo(() => {
    const seconds = (features.bookmarks.bookmarks ?? []).map((b) => Math.round(b.time));
    return [...new Set(seconds)].sort((a, b) => a - b);
  }, [features.bookmarks.bookmarks]);

  return (
    <div
      data-player-chrome
      className={cn(
        'scrim-bottom absolute inset-x-0 bottom-0 z-20 px-6 pt-24 pb-6',
        'transition-opacity duration-200 ease-[var(--ease-out-quint)]',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      // `zoom` rather than `transform: scale()`: zoom re-runs layout, so text
      // and icons are rendered at the new size and stay crisp, where a
      // transform would resample an already-rasterised bar and blur it.
      style={{ zoom: 'var(--control-scale)' }}
      // The bar is chrome, not content: clicking it must never reach the video
      // click handler that toggles playback.
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {/* Measured, so the subtitles know how far they have to step up. */}
      <div ref={contentRef}>
        <Timeline markers={markers} />

      {/* Explicit two-group layout rather than a single row with `ml-auto`:
          the groups stay put regardless of how many optional buttons render. */}
      <div className="mt-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-0.5">
          <PlayButton />

          {onPrevious && (
            <Tooltip label="Previous" shortcut="P">
              <Button
                variant="chrome"
                size="icon"
                onClick={onPrevious}
                aria-label="Previous"
              >
                <Icon name="previous" />
              </Button>
            </Tooltip>
          )}
          {onNext && (
            <Tooltip label="Next" shortcut="N">
              <Button variant="chrome" size="icon" onClick={onNext} aria-label="Next">
                <Icon name="next" />
              </Button>
            </Tooltip>
          )}

          <Tooltip label="Back 10 seconds" shortcut="←">
            <Button
              variant="chrome"
              size="icon"
              onClick={() => seekBy(-10)}
              aria-label="Back 10 seconds"
            >
              <Icon name="rewind" />
            </Button>
          </Tooltip>
          <Tooltip label="Forward 10 seconds" shortcut="→">
            <Button
              variant="chrome"
              size="icon"
              onClick={() => seekBy(10)}
              aria-label="Forward 10 seconds"
            >
              <Icon name="forward" />
            </Button>
          </Tooltip>

          <div className="ml-1">
            <VolumeControl />
          </div>

          <div className="ml-2">
            <TimeReadout />
          </div>
        </div>

        {/* MenuGroup keeps these mutually exclusive: opening one closes the
            rest, so two panels never stack over the video. */}
        <MenuGroup>
          <div className="flex items-center gap-0.5">
            <SpeedMenu />
            <SubtitleMenu features={features} />
            <BookmarkMenu features={features} />
            <SettingsMenu
              features={features}
              ambient={ambient}
              musicMode={musicMode}
              fit={fit}
            />

            <Tooltip label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} shortcut="F">
              <Button
                variant="chrome"
                size="icon"
                onClick={onToggleFullscreen}
                aria-label="Fullscreen"
              >
                <Icon name={isFullscreen ? 'exitFullscreen' : 'fullscreen'} />
              </Button>
            </Tooltip>
          </div>
        </MenuGroup>
      </div>
      </div>
    </div>
  );
}
