import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { MenuGroup } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PlayerFeatures } from '@/features/usePlayerFeatures';
import type { MiniPlayerApi } from '@/features/playback/useMiniPlayer';
import type { MusicModeApi } from '@/features/playback/useMusicMode';
import type { VideoFitApi } from '@/features/playback/useVideoFit';
import { useViewport } from '@/features/playback/useViewport';
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
        {/* The only filled glyph in the bar: see components/ui/icons.tsx. */}
        <Icon name={paused ? 'play' : 'pause'} filled />
      </Button>
    </Tooltip>
  );
}

export interface ControlBarProps {
  visible: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  features: PlayerFeatures;
  miniPlayer: MiniPlayerApi;
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
  miniPlayer,
  ambient,
  musicMode,
  fit,
  onNext,
  onPrevious,
}: ControlBarProps) {
  const { seekBy } = usePlayerActions();
  const { compact, touch } = useViewport();
  // Bookmarks appear as ticks on the scrub bar, so saved points are findable
  // without opening the menu. Rounded to the second and deduped: two bookmarks
  // a frame apart are one tick visually, and would otherwise collide as
  // duplicate React keys.
  const markers = React.useMemo(() => {
    const seconds = (features.bookmarks.bookmarks ?? []).map((b) => Math.round(b.time));
    return [...new Set(seconds)].sort((a, b) => a - b);
  }, [features.bookmarks.bookmarks]);

  /*
   * The compact bar.
   *
   * Everything that can leave, leaves. Play and ±10s move to the middle of the
   * picture where a thumb reaches them (`MobileTransport`); volume goes to the
   * hardware keys and the vertical swipe, which is where a phone user reaches
   * for it anyway; the mini player is a desktop window manager's idea. What is
   * left is the scrub bar, the timecode, and the five menus that have nowhere
   * else to be, which fits a 375px screen with room to spare instead of
   * running off the edge of it.
   */
  if (compact) {
    return (
      <div
        data-player-chrome
        className={cn(
          'scrim-bottom absolute inset-x-0 bottom-0 z-20 pt-16',
          // Clear of the notch, the rounded corners and the home indicator.
          'pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))]',
          'pb-[max(10px,env(safe-area-inset-bottom))]',
          'transition-opacity duration-200 ease-[var(--ease-out-quint)]',
          visible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ zoom: 'var(--control-scale)' }}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <Timeline markers={markers} touch={touch} />

        <div className="flex items-center justify-between gap-1">
          <TimeReadout />

          <MenuGroup>
            {/* Each menu renders its own trigger, so the row resizes them from
                the outside rather than every component growing a `compact`
                prop: 36px is a fine mouse target and a poor thumb one, and the
                five of them still clear a 375px screen at 44. */}
            <div
              className={cn(
                'flex items-center',
                '[&>button]:h-11 [&>button]:min-w-11 [&>button_svg]:size-5',
              )}
            >
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
    );
  }

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

            {/* Both of these act on the picture, so neither has anything to do
                while music mode has it switched off. */}
            {!musicMode.enabled && (
              <Tooltip label="Mini player" shortcut="I">
                <Button
                  variant="chrome"
                  size="icon"
                  onClick={miniPlayer.toggle}
                  aria-label="Mini player"
                >
                  <Icon name="pip" />
                </Button>
              </Tooltip>
            )}

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
  );
}
