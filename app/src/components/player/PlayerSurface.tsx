import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/format';
import type { MediaSourceInput } from '@/engine/types';
import { useKeyboardShortcuts } from '@/features/keyboard/useKeyboardShortcuts';
import { usePlayerFeatures } from '@/features/usePlayerFeatures';
import { usePlaybackMemory } from '@/features/playback/usePlaybackMemory';
import { useWheelControls } from '@/features/playback/useWheelControls';
import {
  useMediaSession,
  useWakeLock,
} from '@/features/playback/useSystemIntegration';
import { useMusicMode } from '@/features/playback/useMusicMode';
import { useVideoFit } from '@/features/playback/useVideoFit';
import { MusicStage } from './MusicStage';
import { Toaster, useToaster } from '@/components/ui/toaster';
import { PortalContainerProvider } from '@/components/ui/portal-container';
import { AmbientGlow } from './AmbientGlow';
import {
  GestureFeedback,
  type FeedbackKind,
  type GestureFeedbackHandle,
} from './GestureFeedback';
import { ShortcutsSheet } from './ShortcutsSheet';
import { PlayerContextMenu } from './PlayerContextMenu';
import {
  usePlayerStore,
  usePlaybackLabel,
  useIsLoading,
  useIsPaused,
  usePlayerActions,
  usePlayerError,
  useVideoEl,
} from '@/store/playerStore';
import { ControlBar } from './ControlBar';
import { SubtitleOverlay } from './SubtitleOverlay';

/** What a subtitle file may be called. The menu's file picker offers the same. */
const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa'];

/** Hide the cursor and chrome after this long without pointer movement. */
const IDLE_MS = 2600;

export interface PlayerSurfaceProps {
  source: MediaSourceInput;
  title: string;
  onBack: () => void;
  onNext?: (() => void) | undefined;
  onPrevious?: (() => void) | undefined;
  /** Where this file sits in its folder, when there is more than one. */
  position?: { index: number; total: number } | undefined;
}

/**
 * Hosts the playback engine and all chrome layered over it.
 *
 * The engine owns the actual `<video>` or `<canvas>` and appends it into
 * `mountRef`. React never renders that element, which is deliberate: it lets a
 * backend swap its rendering surface without React reconciling a node that has
 * live decoder state attached to it.
 */
export function PlayerSurface({
  source,
  title,
  onBack,
  onNext,
  onPrevious,
  position,
}: PlayerSurfaceProps) {
  const shellRef = React.useRef<HTMLDivElement>(null);
  // The portal target must be state, not just a ref: menus render on the same
  // pass the shell mounts, and a ref would still be null at that point.
  const [shellEl, setShellEl] = React.useState<HTMLDivElement | null>(null);
  const attachShell = React.useCallback((node: HTMLDivElement | null) => {
    shellRef.current = node;
    setShellEl(node);
  }, []);
  const mountRef = React.useRef<HTMLDivElement>(null);
  const idleTimer = React.useRef<number | undefined>(undefined);

  const { openSource, closeSource, togglePlay } = usePlayerActions();
  const loading = useIsLoading();
  const paused = useIsPaused();
  const error = usePlayerError();
  const playbackLabel = usePlaybackLabel();

  const [chromeVisible, setChromeVisible] = React.useState(true);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [ambient, setAmbient] = React.useState(
    () => localStorage.getItem('cadence-ambient') === 'true',
  );
  const feedbackRef = React.useRef<GestureFeedbackHandle>(null);

  const { toasts, show: showToast } = useToaster();
  const features = usePlayerFeatures({ fileKey: source.name, onToast: showToast });
  const fit = useVideoFit();

  /**
   * Go on to the next file when this one runs out.
   *
   * The whole point of the queue. Someone watching a season should not have to
   * come back to the machine between episodes, which is the one thing a player
   * with no playlist forces on them.
   *
   * Subscribed here rather than in the store so it can be conditional: looping
   * is a deliberate instruction to play this file again, and advancing over it
   * would obey the queue and disobey the viewer.
   */
  const looping = features.loop;
  React.useEffect(() => {
    if (!onNext || looping) return undefined;
    return usePlayerStore.subscribe((state, previous) => {
      if (state.ended && !previous.ended) onNext();
    });
  }, [onNext, looping]);

  // Volume, speed and playhead survive reloads and file switches.
  const resume = usePlaybackMemory(source.name);
  // Media keys, the OS Now Playing panel, and the taskbar transport.
  useMediaSession(title, { next: onNext, previous: onPrevious });
  const musicMode = useMusicMode(showToast);
  // Stop the display dimming mid-lecture, but only while actually playing, and
  // never in music mode, where holding the screen awake for audio is the exact
  // waste the mode exists to avoid.
  useWakeLock(!paused && !musicMode.enabled);
  // Subscribed to by identity, not just read through the ref: a file switch
  // builds a brand-new element, and anything styled here has to be re-applied
  // to it or the adjustment silently stops applying.
  const videoEl = useVideoEl();

  /**
   * Apply colour adjustments and zoom to the engine's element.
   *
   * These are presentation-only CSS transforms, so they belong on whatever
   * element the backend produced rather than inside the engine itself, which
   * keeps the engine free of anything the compositor can do for us.
   */
  React.useEffect(() => {
    if (!videoEl) return;
    const filter = features.filters.filterStyle?.filter ?? '';
    const zoom = features.zoomPan.videoStyle ?? {};
    videoEl.style.filter = filter;
    videoEl.style.transform = zoom.transform ?? '';
    videoEl.style.transformOrigin = 'center center';
    videoEl.style.cursor = features.zoomPan.isZoomed ? 'grab' : '';
    // Overrides the `object-contain` the element is built with. Set as an
    // inline style so it survives the class list, and re-applied here because a
    // backend swap hands back an element that has never seen this setting.
    videoEl.style.objectFit = fit.mode;
  }, [
    videoEl,
    fit.mode,
    features.filters.filterStyle,
    features.zoomPan.videoStyle,
    features.zoomPan.isZoomed,
  ]);

  /** Accept a subtitle file dropped anywhere on the player. */
  const handleDrop = React.useCallback(
    async (event: React.DragEvent) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!SUBTITLE_EXTENSIONS.includes(ext ?? '')) return;
      event.preventDefault();
      await features.loadSubtitleFile(file);
    },
    [features],
  );

  // Load whenever the source changes; tear down on unmount.
  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    void openSource(source, mount);
    return () => closeSource();
  }, [source, openSource, closeSource]);

  /**
   * Pull focus into the player as soon as it opens.
   *
   * Without this, whatever opened the player keeps DOM focus behind the
   * overlay, and the library's drop zone is a `role="button"` with its own
   * Space handler, so hitting Space to pause would re-open the file picker
   * instead. Calling `preventDefault` in the global shortcut listener cannot
   * help: that element's own handler runs first, on the way up.
   */
  React.useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    shellRef.current?.focus({ preventScroll: true });
  }, [source]);

  React.useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const revealChrome = React.useCallback(() => {
    setChromeVisible(true);
    window.clearTimeout(idleTimer.current);
    // Chrome stays put while paused (a paused player is being read, not
    // watched) and in music mode, where hiding the transport would leave an
    // empty screen with no way back to it.
    if (paused || musicMode.enabled) return;
    idleTimer.current = window.setTimeout(() => setChromeVisible(false), IDLE_MS);
  }, [paused, musicMode.enabled]);

  React.useEffect(() => {
    revealChrome();
    return () => window.clearTimeout(idleTimer.current);
  }, [revealChrome]);

  const toggleFullscreen = React.useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    void shellRef.current?.requestFullscreen().catch(() => {});
  }, []);

  const toggleAmbient = React.useCallback(() => {
    setAmbient((prev) => {
      localStorage.setItem('cadence-ambient', String(!prev));
      return !prev;
    });
  }, []);

  // The gesture hook is untyped JS, so the payload arrives as `unknown` and is
  // narrowed by `kind` inside the overlay.
  const triggerFeedback = React.useCallback((kind: FeedbackKind, value: unknown) => {
    feedbackRef.current?.trigger(kind, value as never);
  }, []);

  /**
   * Toggle playback and flash the state.
   *
   * The flash matters most when the click landed on the picture rather than a
   * button; without it there is no confirmation that the click registered at
   * all, only a frame that did or did not change.
   */
  const togglePlayWithFeedback = React.useCallback(() => {
    const wasPaused = usePlayerStore.getState().paused;
    togglePlay();
    triggerFeedback('play', wasPaused ? 'play' : 'pause');
    revealChrome();
  }, [togglePlay, triggerFeedback, revealChrome]);

  /**
   * Drag to pan while zoomed.
   *
   * Pointer events rather than mouse events so the capture survives the cursor
   * leaving the frame mid-drag, and restricted to mouse and pen because touch
   * on this surface already means the swipe gestures below.
   *
   * The drag is tracked here as well as in the hook so a pan can suppress the
   * click that follows it; otherwise every drag would also toggle playback.
   */
  const { startPan, onPanMove, endPan, isZoomed } = features.zoomPan;
  const dragOrigin = React.useRef<{ x: number; y: number } | null>(null);
  const dragMoved = React.useRef(false);

  const handlePanStart = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isZoomed || event.button !== 0 || event.pointerType === 'touch') return;
      dragOrigin.current = { x: event.clientX, y: event.clientY };
      dragMoved.current = false;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is an improvement, not a requirement: a pointer that has
        // already been released throws here and the drag still works.
      }
      startPan(event);
    },
    [isZoomed, startPan],
  );

  const handlePanMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const origin = dragOrigin.current;
      if (!origin) return;
      // A few pixels of travel is a click with a shaky hand, not a drag.
      if (
        Math.abs(event.clientX - origin.x) > 4 ||
        Math.abs(event.clientY - origin.y) > 4
      ) {
        dragMoved.current = true;
      }
      onPanMove(event);
    },
    [onPanMove],
  );

  const handlePanEnd = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragOrigin.current) return;
      dragOrigin.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endPan();
    },
    [endPan],
  );

  const handleSurfaceClick = React.useCallback(() => {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    togglePlayWithFeedback();
  }, [togglePlayWithFeedback]);

  /**
   * Wheel over the picture adjusts volume; a horizontal trackpad swipe scrubs.
   * Both report through the overlay in the middle of the picture.
   */
  useWheelControls({
    targetRef: shellRef,
    enabled: !shortcutsOpen,
    onVolume: (volume, muted) => {
      triggerFeedback('volume', { volume, muted });
      revealChrome();
    },
    onSeek: (delta) => {
      triggerFeedback('seek', delta);
      revealChrome();
    },
  });

  useKeyboardShortcuts({
    toggleFullscreen,
    toggleAmbient,
    togglePlay: togglePlayWithFeedback,
    toggleShortcuts: () => setShortcutsOpen((v) => !v),
    next: onNext,
    previous: onPrevious,
    toggleSubtitles: features.subtitles.toggle,
    toggleLoop: features.toggleLoop,
    addBookmark: features.addBookmarkAtPlayhead,
    takeScreenshot: features.takeScreenshot,
    setABPointA: () => features.abRepeat.setA(features.videoRef.current?.currentTime ?? 0),
    setABPointB: () => features.abRepeat.setB(features.videoRef.current?.currentTime ?? 0),
    clearAB: features.abRepeat.clear,
    zoomIn: features.zoomPan.zoomIn,
    zoomOut: features.zoomPan.zoomOut,
    resetZoom: features.zoomPan.resetZoom,
  });

  // Any shortcut that changes playback should also bring the chrome back, so
  // the user sees the result of what they just pressed.
  React.useEffect(() => {
    const onKey = () => revealChrome();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealChrome]);

  return (
    <TooltipProvider delayDuration={400}>
      <PortalContainerProvider container={shellEl}>
      <div
        ref={attachShell}
        // Focusable so the player itself can hold focus, but not a tab stop,
        // Tab should still reach the real controls inside it.
        tabIndex={-1}
        className={cn(
          'relative h-full w-full overflow-hidden bg-black outline-none',
          !chromeVisible && 'cursor-none',
        )}
        onPointerMove={revealChrome}
        onPointerLeave={() => !paused && setChromeVisible(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        {/* The glow samples video frames, so once the picture is off it has
            nothing to sample and nothing to justify its cost. */}
        <AmbientGlow enabled={ambient && !musicMode.enabled} />

        {musicMode.enabled && <MusicStage title={title} forced={musicMode.forced} />}

        {/* Engine-owned rendering surface. */}
        <PlayerContextMenu
          features={features}
          ambient={{ enabled: ambient, toggle: toggleAmbient }}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onToast={showToast}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        >
          <div
            ref={mountRef}
            className={cn(
              'absolute inset-0 flex items-center justify-center',
              // `invisible`, not `opacity-0`: a hidden element is not painted
              // at all, whereas a transparent one is still composited every
              // frame, which is the cost music mode exists to stop paying.
              musicMode.enabled && 'invisible',
            )}
            onClick={handleSurfaceClick}
            onDoubleClick={toggleFullscreen}
            onPointerDown={handlePanStart}
            onPointerMove={handlePanMove}
            onPointerUp={handlePanEnd}
            onPointerCancel={handlePanEnd}
          />
        </PlayerContextMenu>

        {/* Over the picture, under the chrome. Placed outside the mount so a
            backend swapping its own element out cannot take the text with it. */}
        <SubtitleOverlay
          track={features.subtitles.textTrack}
          pictures={features.subtitles.pictures}
          script={features.subtitles.script}
          style={features.subtitles.style}
          visible={features.subtitles.enabled && !musicMode.enabled}
          lifted={chromeVisible}
          video={videoEl}
          offset={features.subtitles.offset}
        />

        {loading && !error && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <Icon name="loading" size={40} className="animate-spin text-white/70" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 p-6">
            <div className="max-w-md rounded-[var(--radius-panel)] border border-line bg-surface-1 p-6 text-center shadow-[var(--shadow-panel)]">
              <Icon name="alert" size={32} className="mx-auto mb-3 text-warning" />
              <h2 className="text-base font-semibold text-fg">Can&apos;t play this file</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{error}</p>
              <Button variant="secondary" className="mt-5" onClick={onBack}>
                Go back
              </Button>
            </div>
          </div>
        )}

        {/* Top bar: title and provenance. */}
        <div
          data-player-chrome
          className={cn(
            'scrim-top absolute inset-x-0 top-0 z-20 flex items-center gap-3 pb-4',
            // Clear of the notch and the rounded corners in landscape.
            'pt-[max(16px,env(safe-area-inset-top))]',
            'pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))]',
            'transition-opacity duration-200 ease-[var(--ease-out-quint)]',
            chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <Button variant="chrome" size="icon" onClick={onBack} aria-label="Back">
            <Icon name="back" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.01em] text-white">
            {title}
          </h1>
          {/* Where this file sits among the others beside it. Absent for a
              film on its own, where "1 of 1" is a fact nobody needed. */}
          {position && (
            <span className="shrink-0 text-[12px] tabular-nums text-white/50">
              {position.index} of {position.total}
            </span>
          )}
          {/* Only ever shown when something is happening to the file on the
              way in, so that it reads as an explanation rather than furniture. */}
          {playbackLabel && (
            <span className="rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white/70">
              {playbackLabel}
            </span>
          )}
        </div>

        <ControlBar
          visible={chromeVisible && !error}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          features={features}
          ambient={{ enabled: ambient, toggle: toggleAmbient }}
          musicMode={musicMode}
          fit={fit}
          onNext={onNext}
          onPrevious={onPrevious}
        />

        {resume && chromeVisible && (
          <div
            data-player-chrome
            className={cn(
              'absolute z-30 flex items-center gap-3 rounded-full border border-line bg-surface-1/90 py-2 pr-2 pl-4 text-[13px] shadow-[var(--shadow-panel)] backdrop-blur-xl animate-in fade-in-0 slide-in-from-bottom-2',
              // Clear of the control bar underneath it.
              'bottom-28 left-6',
            )}
          >
            <span className="text-fg-muted">
              Resumed from{' '}
              <span className="tabular-nums text-fg">{formatTime(resume.from)}</span>
            </span>
            <Button variant="secondary" size="sm" onClick={resume.startOver}>
              Start over
            </Button>
          </div>
        )}

        <GestureFeedback ref={feedbackRef} />
        {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
        <Toaster toasts={toasts} />
      </div>
      </PortalContainerProvider>
    </TooltipProvider>
  );
}
