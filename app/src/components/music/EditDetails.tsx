import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { musicWrite, pickPicture } from '@/lib/desktop';
import { useLibraryStore, type Song } from '@/store/libraryStore';
import { Artwork } from './Artwork';

/**
 * Changing what a file says it is.
 *
 * This writes to the disk, which is the thing to understand about it. Nothing
 * here is a label Cadence keeps to itself: the tags go into the file, so a
 * track renamed here is renamed in every other player on the machine, and a
 * sleeve set here is the sleeve the phone shows when the file is copied to it.
 * That is the whole point — a library whose corrections live in one
 * application's database is a library you have to correct again in the next
 * application.
 *
 * One dialog for a track and for a record, because the difference between them
 * is only which fields are offered and how many files get written. Editing an
 * album offers the fields an album has — its name, its artist, its year, its
 * sleeve — and writes them into every track on it; the per-track fields are
 * missing there because they are not the same on every track and a single box
 * could only flatten them.
 */
export interface EditDetailsProps {
  /** The tracks being changed. One for a track, all of them for a record. */
  songs: Song[];
  /** What kind of thing is being edited, which decides the fields. */
  scope: 'track' | 'album';
  onClose: () => void;
}

interface Fields {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  track: string;
  year: string;
  genre: string;
}

/**
 * The tag names each field is written under.
 *
 * FFmpeg's own spellings, which it maps into whichever the container uses —
 * ID3 frames for MP3, atoms for MP4, comments for FLAC. Writing the
 * container's own names here would mean three tables and a way to pick between
 * them.
 */
const TAGS: Record<keyof Fields, string> = {
  title: 'title',
  artist: 'artist',
  album: 'album',
  albumArtist: 'album_artist',
  track: 'track',
  year: 'date',
  genre: 'genre',
};

/** What the album-wide edit is allowed to touch. */
const ALBUM_FIELDS: (keyof Fields)[] = ['album', 'albumArtist', 'year', 'genre'];
const TRACK_FIELDS: (keyof Fields)[] = [
  'title',
  'artist',
  'album',
  'albumArtist',
  'track',
  'year',
  'genre',
];

const LABELS: Record<keyof Fields, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album artist',
  track: 'Track number',
  year: 'Year',
  genre: 'Genre',
};

export function EditDetails({ songs, scope, onClose }: EditDetailsProps) {
  const first = songs[0]!;
  const load = useLibraryStore((s) => s.load);

  const [fields, setFields] = React.useState<Fields>(() => ({
    title: first.title,
    artist: first.artist ?? '',
    album: first.album ?? '',
    albumArtist: first.albumArtist ?? '',
    track: first.track !== null ? String(first.track) : '',
    year: first.year !== null ? String(first.year) : '',
    genre: first.genre ?? '',
  }));
  const [cover, setCover] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  const shown = scope === 'album' ? ALBUM_FIELDS : TRACK_FIELDS;

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, saving]);

  const save = React.useCallback(async () => {
    setSaving(true);
    setFailed(null);
    /* Only the fields this dialog offered. Sending the whole set would write
       a track's own title across every track on the record. */
    const tags: Record<string, string> = {};
    for (const field of shown) tags[TAGS[field]] = fields[field].trim();

    try {
      await musicWrite(
        songs.map((song) => song.path),
        tags,
        cover,
      );
      // The shell updated its own copy; this is the page catching up.
      await load();
      onClose();
    } catch (err) {
      setFailed(String(err));
      setSaving(false);
    }
  }, [shown, fields, songs, cover, load, onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 p-6 animate-in fade-in-0 duration-150"
      onMouseDown={() => !saving && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={scope === 'album' ? 'Edit album details' : 'Edit track details'}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="w-[34rem] max-w-full rounded-[var(--radius-panel)] border border-line bg-surface-1 p-6 shadow-[var(--shadow-panel)] animate-in fade-in-0 zoom-in-95 duration-150"
      >
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-fg">
          {scope === 'album' ? 'Edit album' : 'Edit track'}
        </h2>
        <p className="mt-1.5 text-[12px] text-fg-subtle">
          {scope === 'album'
            ? `Written into all ${songs.length} tracks. This changes the files themselves.`
            : 'Written into the file itself, so every other player sees it too.'}
        </p>

        <div className="mt-5 flex gap-5">
          {/* The sleeve, and the one control it needs. Clicking the picture is
              the affordance; the button under it is for anybody who does not
              guess that a picture is a button. */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => void pickPicture().then((picked) => picked && setCover(picked))}
              className="group relative block"
              aria-label="Choose a new cover"
            >
              {cover ? (
                <img
                  src={`file://${cover.replace(/\\/g, '/')}`}
                  alt=""
                  className="size-32 rounded-[8px] border border-line object-cover"
                />
              ) : (
                <Artwork path={first.path} width={256} className="size-32 border border-line" />
              )}
              <span className="absolute inset-0 flex items-center justify-center rounded-[8px] bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                <Icon name="folder" size={20} className="text-white" />
              </span>
            </button>
            {cover && (
              <button
                type="button"
                onClick={() => setCover(null)}
                className="mt-2 w-full text-[11px] text-fg-subtle hover:text-fg"
              >
                Keep the old one
              </button>
            )}
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
            {shown.map((field) => (
              <label
                key={field}
                className={cn(
                  'flex flex-col gap-1.5',
                  // The long ones get the full width; the numbers do not need it.
                  field !== 'track' && field !== 'year' && 'col-span-2',
                )}
              >
                <span className="text-[11px] font-medium tracking-[0.04em] text-fg-subtle uppercase">
                  {LABELS[field]}
                </span>
                <input
                  value={fields[field]}
                  onChange={(event) =>
                    setFields((previous) => ({ ...previous, [field]: event.target.value }))
                  }
                  inputMode={field === 'track' || field === 'year' ? 'numeric' : undefined}
                  className="rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2 text-[13px] text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
                />
              </label>
            ))}
          </div>
        </div>

        {failed && (
          <p className="mt-4 rounded-[8px] border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] leading-relaxed text-fg">
            {failed}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  );
}
