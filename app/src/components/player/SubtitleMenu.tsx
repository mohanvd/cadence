import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import {
  MenuItem,
  MenuSeparator,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useExclusiveMenu,
} from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { describeTrack } from '@/lib/format';
import { useTrackState } from '@/store/playerStore';
import { SUBTITLE_OPTIONS } from '@/hooks/useSubtitles';
import type { PlayerFeatures } from '@/features/usePlayerFeatures';
import type { MediaTrack } from '@/engine/types';
import type { SubtitleStyle } from '@/hooks';

type Panel = 'tracks' | 'options' | 'timing' | keyof SubtitleStyle;

/**
 * Subtitle track selection, timing and appearance.
 *
 * Panels rather than one long list, which is the shape every player of any
 * size arrives at and for the same reason: choosing a language happens often
 * and should take one press, and choosing a typeface happens once and should
 * not be in the way of it. The tracks are what opens.
 *
 * The tracks inside the file are listed above the file picker, because that is
 * the order in which they should be tried. A film that was subtitled arrives
 * subtitled, and going looking on disk for something the file already holds is
 * what this menu used to require of everybody.
 */
export function SubtitleMenu({ features }: { features: PlayerFeatures }) {
  const menu = useExclusiveMenu('subtitles');
  const { subtitles, loadSubtitleFile, selectSubtitleTrack } = features;
  const { tracks } = useTrackState();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [panel, setPanel] = React.useState<Panel>('tracks');

  // Reopening lands on the track list. Someone who went into the settings to
  // change the size does not mean to be there next time they want Arabic.
  React.useEffect(() => {
    if (!menu.open) setPanel('tracks');
  }, [menu.open]);

  const embedded = tracks.filter((track) => track.type === 'subtitle');

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await loadSubtitleFile(file);
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
  };

  /**
   * Choosing a track that is already loaded turns it back on rather than
   * extracting it again. Switching off and on is how anyone checks a line they
   * misread, and paying seconds of a pass over the container for it would make
   * the menu feel broken.
   */
  const pick = (track: MediaTrack) => {
    if (subtitles.sourceId === track.id) {
      if (!subtitles.enabled) subtitles.toggle();
      return;
    }
    void selectSubtitleTrack(track);
  };

  const showing = subtitles.enabled && subtitles.hasSubtitles;

  return (
    <Popover {...menu}>
      <Tooltip label="Subtitles" shortcut="C">
        <PopoverTrigger asChild>
          <Button variant="chrome" size="icon" aria-label="Subtitles">
            <Icon name="captions" />
          </Button>
        </PopoverTrigger>
      </Tooltip>

      <PopoverContent className="w-[19rem]">
        <input ref={inputRef} type="file" accept=".srt,.vtt,.ass,.ssa" hidden onChange={onPick} />

        {panel === 'tracks' && (
          <>
            <PanelHeader
              title="Subtitles"
              action={
                /* Only when there is something in there to change. The
                   appearance controls apply to cues Cadence draws itself and
                   to nothing else: a Blu-ray's subtitles were drawn once by
                   the disc, and a script decides its own fonts and colours and
                   positions, so for those two the panel holds only Timing,
                   and Timing is offered only for a file from disk. */
                subtitles.hasSubtitles && (stylable(subtitles) || subtitles.sourceId === 'file')
                  ? { label: 'Options', onSelect: () => setPanel('options') }
                  : undefined
              }
            />

            <MenuItem
              active={!showing}
              onSelect={() => {
                if (subtitles.enabled) subtitles.toggle();
              }}
            >
              Off
            </MenuItem>

            {embedded.map((track) => (
              <MenuItem
                key={track.id}
                active={showing && subtitles.sourceId === track.id}
                // A track Cadence has no reader for is listed all the same.
                // Hiding it would say the film has no subtitles; this says it
                // has some that cannot be shown, which is the truth and is
                // what tells someone to go looking for a file.
                disabled={!track.playable || subtitles.loading}
                onSelect={() => pick(track)}
                trailing={<Badges track={track} pendingId={subtitles.pendingId} />}
              >
                {describeTrack(track)}
              </MenuItem>
            ))}

            {subtitles.sourceId === 'file' && (
              <MenuItem
                active={showing}
                onSelect={() => {
                  if (!subtitles.enabled) subtitles.toggle();
                }}
              >
                <span className="block max-w-[15rem] truncate">{subtitles.label}</span>
              </MenuItem>
            )}

            <MenuSeparator />

            <MenuItem onSelect={() => inputRef.current?.click()}>
              {subtitles.sourceId === 'file' ? 'Choose a different file…' : 'Load from a file…'}
            </MenuItem>

            {/* Only while there is nothing to show at all. Once a file has
                been loaded it is in the list above, and explaining that the
                video carries none of its own has stopped being the useful
                thing to say and started being an argument with the entry the
                viewer is looking at. */}
            {embedded.length === 0 && !subtitles.hasSubtitles && (
              <div className="px-2.5 pt-0.5 pb-1.5 text-[11px] leading-relaxed text-fg-subtle">
                This file carries no subtitles of its own. Drop an .srt, .vtt
                or .ass onto the video, or choose one above.
              </div>
            )}
          </>
        )}

        {panel === 'options' && (
          <Options subtitles={subtitles} onBack={() => setPanel('tracks')} onOpen={setPanel} />
        )}

        {panel === 'timing' && (
          <Timing subtitles={subtitles} onBack={() => setPanel('options')} />
        )}

        {isStyleKey(panel) && (
          <Choices
            setting={panel}
            value={subtitles.style[panel]}
            onChoose={(value) => {
              subtitles.changeStyle(panel, value);
              setPanel('options');
            }}
            onBack={() => setPanel('options')}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** A panel's title bar, with the way back out of it. */
function PanelHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack?: () => void;
  action?: { label: string; onSelect: () => void };
}) {
  return (
    <div className="mb-1 flex items-center gap-1 border-b border-line px-1 pb-1.5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="rounded-md p-1 text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <Icon name="back" size={15} />
        </button>
      )}
      <span className={cn('flex-1 text-[12px] font-semibold text-fg', !onBack && 'pl-2')}>
        {title}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onSelect}
          className="rounded-md px-2 py-1 text-[12px] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Whether the showing track is one Cadence draws, and can therefore restyle.
 *
 * The other two draw themselves. A Blu-ray's subtitles are pictures the disc
 * already made; a script says what font and colour and place it wants and is
 * rendered as it asks. Overriding either would be answering a question the
 * author already answered.
 */
function stylable(subtitles: PlayerFeatures['subtitles']): boolean {
  return !subtitles.pictures && !subtitles.script;
}

/** Everything about a showing track that is not which track it is. */
function Options({
  subtitles,
  onBack,
  onOpen,
}: {
  subtitles: PlayerFeatures['subtitles'];
  onBack: () => void;
  onOpen: (panel: Panel) => void;
}) {
  return (
    <>
      <PanelHeader title="Options" onBack={onBack} />

      {/* Only for a file found on disk.
       *
       * A track lifted out of the video was authored against that video, so it
       * is in sync by construction and there is nothing here to correct. What
       * gets out of sync is a subtitle downloaded for a different release,
       * another cut, another framerate, the advertisements still in, and that
       * is the only case in which this row means anything. Offering it for
       * every track invites people to fix what is not broken. */}
      {subtitles.sourceId === 'file' && (
        <MenuItem
          onSelect={() => onOpen('timing')}
          trailing={<Value>{formatOffset(subtitles.offset)}</Value>}
        >
          Timing
        </MenuItem>
      )}

      {/* A track that draws itself has no appearance to set here. Showing
          these greyed would suggest they might apply to something. */}
      {stylable(subtitles) && (
        <>
          {(Object.keys(SETTINGS) as (keyof SubtitleStyle)[]).map((key) => (
            <MenuItem
              key={key}
              onSelect={() => onOpen(key)}
              trailing={<Value>{labelFor(key, subtitles.style[key])}</Value>}
            >
              {SETTINGS[key]}
            </MenuItem>
          ))}

          <MenuSeparator />
          <MenuItem disabled={subtitles.isStyleDefault} onSelect={subtitles.resetStyle}>
            Reset appearance
          </MenuItem>
        </>
      )}
    </>
  );
}

/** The value a settings row holds, and the mark that it opens onto more. */
function Value({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-[12px] text-fg-muted">
      {children}
      <Icon name="submenu" size={14} className="text-fg-subtle" />
    </span>
  );
}

/** Nudging a downloaded subtitle onto this cut of the film. */
function Timing({
  subtitles,
  onBack,
}: {
  subtitles: PlayerFeatures['subtitles'];
  onBack: () => void;
}) {
  return (
    <>
      <PanelHeader title="Timing" onBack={onBack} />
      <p className="px-2.5 pb-2 text-[11px] leading-relaxed text-fg-subtle">
        If the lines arrive early or late, this moves the whole track. Negative
        is earlier.
      </p>
      <div className="flex items-center gap-1.5 px-2.5 pb-1">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => subtitles.changeOffset(-0.5)}
        >
          −0.5s
        </Button>
        <span className="min-w-14 text-center text-[12px] tabular-nums text-fg">
          {formatOffset(subtitles.offset)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => subtitles.changeOffset(0.5)}
        >
          +0.5s
        </Button>
      </div>
      <MenuItem
        disabled={subtitles.offset === 0}
        onSelect={() => subtitles.changeOffset(-subtitles.offset)}
      >
        Back to the file&apos;s own timing
      </MenuItem>
    </>
  );
}

/** The values one appearance setting can take. */
function Choices({
  setting,
  value,
  onChoose,
  onBack,
}: {
  setting: keyof SubtitleStyle;
  value: string | number;
  onChoose: (value: never) => void;
  onBack: () => void;
}) {
  return (
    <>
      <PanelHeader title={SETTINGS[setting]} onBack={onBack} />
      {SUBTITLE_OPTIONS[setting].map((option) => (
        <MenuItem
          key={String(option.value)}
          active={option.value === value}
          onSelect={() => onChoose(option.value as never)}
          trailing={
            // A colour is recognised faster than it is read, and a swatch
            // beside the name is faster than either alone.
            isColour(setting) ? (
              <span
                className="size-3.5 shrink-0 rounded-full border border-line"
                style={{ backgroundColor: String(option.value) }}
              />
            ) : undefined
          }
        >
          {option.label}
        </MenuItem>
      ))}
    </>
  );
}

const SETTINGS: Record<keyof SubtitleStyle, string> = {
  family: 'Font',
  size: 'Size',
  color: 'Text colour',
  opacity: 'Text opacity',
  backgroundColor: 'Backdrop colour',
  backgroundOpacity: 'Backdrop opacity',
  edge: 'Edge style',
};

function isStyleKey(panel: Panel): panel is keyof SubtitleStyle {
  return panel in SETTINGS;
}

function isColour(setting: keyof SubtitleStyle): boolean {
  return setting === 'color' || setting === 'backgroundColor';
}

/** What a setting's current value is called, for the row that opens it. */
function labelFor(key: keyof SubtitleStyle, value: string | number): string {
  const match = SUBTITLE_OPTIONS[key].find((option) => option.value === value);
  return match ? match.label : String(value);
}

function formatOffset(seconds: number): string {
  return `${seconds > 0 ? '+' : ''}${seconds.toFixed(1)}s`;
}

/**
 * What a track is, beyond its name.
 *
 * A film routinely carries several tracks in one language, and the name alone
 * does not tell them apart: "English", "English" and "English" are a full
 * translation, the signs, and the version written for someone who cannot hear
 * the room. The container says which is which, and this is where it gets said.
 */
function Badges({ track, pendingId }: { track: MediaTrack; pendingId: string | null }) {
  // Only the row being read says so. A spinner on every row would suggest the
  // whole list was busy, when one track is.
  if (pendingId === track.id) {
    return <Icon name="loading" size={13} className="shrink-0 animate-spin text-fg-subtle" />;
  }

  const marks: string[] = [];
  if (track.hearingImpaired) marks.push('CC');
  if (track.forced) marks.push('Forced');
  // A Blu-ray's subtitles are pictures. Saying so is not a warning, they play,
  // but it is worth knowing before opening a settings panel that will have
  // nothing in it, and before wondering why the search does not find them.
  if (track.pictures) marks.push('Image');
  // And this one genuinely cannot be chosen.
  else if (!track.playable) marks.push('Unreadable');

  if (marks.length === 0) return null;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {marks.map((mark) => (
        <span
          key={mark}
          className="rounded border border-line px-1 py-px text-[10px] leading-none font-medium tracking-wide text-fg-subtle uppercase"
        >
          {mark}
        </span>
      ))}
    </span>
  );
}
