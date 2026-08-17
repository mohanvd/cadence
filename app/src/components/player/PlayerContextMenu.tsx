import * as React from 'react';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { formatSpeed, formatTime } from '@/lib/format';
import type { PlayerFeatures } from '@/features/usePlayerFeatures';
import type { MiniPlayerApi } from '@/features/playback/useMiniPlayer';
import { usePlayerStore } from '@/store/playerStore';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export interface PlayerContextMenuProps {
  children: React.ReactNode;
  features: PlayerFeatures;
  miniPlayer: MiniPlayerApi;
  ambient: { enabled: boolean; toggle: () => void };
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onToast: (message: string) => void;
  onOpenShortcuts: () => void;
}

/**
 * The player's right-click menu.
 *
 * Without one the browser shows its own video menu: "Save video as…", "Copy
 * video address", "Inspect". That menu is both ugly and wrong here: those actions
 * expose a blob URL that means nothing outside the tab, and none of them are
 * things someone watching a lecture wants.
 */
export function PlayerContextMenu({
  children,
  features,
  miniPlayer,
  ambient,
  isFullscreen,
  onToggleFullscreen,
  onToast,
  onOpenShortcuts,
}: PlayerContextMenuProps) {
  // Read on open rather than subscribed: a menu that re-renders sixty times a
  // second while it is open would fight the pointer.
  const [snapshot, setSnapshot] = React.useState(() => usePlayerStore.getState());

  const onOpenChange = React.useCallback((open: boolean) => {
    if (open) setSnapshot(usePlayerStore.getState());
  }, []);

  const copyTimestamp = React.useCallback(async () => {
    const { currentTime } = usePlayerStore.getState();
    try {
      await navigator.clipboard.writeText(formatTime(currentTime));
      onToast(`Copied ${formatTime(currentTime)}`);
    } catch {
      onToast('Could not copy to the clipboard');
    }
  }, [onToast]);

  const { paused, rate, backend, probe, tracks } = snapshot;
  const video = tracks.find((t) => t.type === 'video');
  const audio = tracks.find((t) => t.type === 'audio');

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>

      <ContextMenuContent className="w-60">
        <ContextMenuItem
          shortcut="Space"
          onSelect={() => usePlayerStore.getState().togglePlay()}
        >
          {paused ? 'Play' : 'Pause'}
        </ContextMenuItem>
        <ContextMenuItem shortcut="B" onSelect={features.addBookmarkAtPlayhead}>
          Add bookmark here
        </ContextMenuItem>
        <ContextMenuItem onSelect={copyTimestamp}>Copy timestamp</ContextMenuItem>
        <ContextMenuItem shortcut="S" onSelect={features.takeScreenshot}>
          Save frame as PNG
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>Speed: {formatSpeed(rate)}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup
              value={String(rate)}
              onValueChange={(value) => usePlayerStore.getState().setRate(Number(value))}
            >
              {SPEEDS.map((speed) => (
                <ContextMenuRadioItem key={speed} value={String(speed)}>
                  {speed === 1 ? 'Normal' : formatSpeed(speed)}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuCheckboxItem
          checked={features.subtitles.enabled && features.subtitles.hasSubtitles}
          disabled={!features.subtitles.hasSubtitles}
          shortcut="C"
          onSelect={(event) => {
            event.preventDefault();
            features.subtitles.toggle();
          }}
        >
          Subtitles
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={features.loop}
          shortcut="R"
          onSelect={(event) => {
            event.preventDefault();
            features.toggleLoop();
          }}
        >
          Loop file
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={ambient.enabled}
          shortcut="G"
          onSelect={(event) => {
            event.preventDefault();
            ambient.toggle();
          }}
        >
          Ambient glow
        </ContextMenuCheckboxItem>

        <ContextMenuSeparator />

        <ContextMenuItem shortcut="I" onSelect={() => void miniPlayer.toggle()}>
          {miniPlayer.isActive ? 'Close mini player' : 'Mini player'}
        </ContextMenuItem>
        <ContextMenuItem shortcut="F" onSelect={onToggleFullscreen}>
          {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* The engine already knows exactly how this file is being played;
            surfacing it turns "why is this one different" into an answer. */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>Media info</ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-56">
            <InfoRow label="Playback">
              {backend === 'native'
                ? 'Direct'
                : backend === 'remux'
                  ? 'Remuxed'
                  : 'Software'}
            </InfoRow>
            {probe?.container && <InfoRow label="Container">{probe.container}</InfoRow>}
            {video && (
              <>
                <InfoRow label="Video">{video.codec}</InfoRow>
                {video.width ? (
                  <InfoRow label="Resolution">{`${video.width}×${video.height}`}</InfoRow>
                ) : null}
              </>
            )}
            {audio && (
              <>
                <InfoRow label="Audio">{audio.codec}</InfoRow>
                {audio.channels ? (
                  <InfoRow label="Channels">{String(audio.channels)}</InfoRow>
                ) : null}
              </>
            )}
            {!video && !audio && <InfoRow label="Tracks">Not inspected</InfoRow>}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem shortcut="?" onSelect={onOpenShortcuts}>
          Keyboard shortcuts
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-2.5 py-1.5 text-[12px]">
      <span className="text-fg-subtle">{label}</span>
      <span className="truncate text-fg">{children}</span>
    </div>
  );
}
