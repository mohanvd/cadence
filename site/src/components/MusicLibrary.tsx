import type { CSSProperties } from 'react';
import { Disc3, FolderInput, ListMusic, Music, Pause, Search, User } from './icons';

/**
 * The half of Cadence the page used to leave out entirely.
 *
 * A player that opens a file and a library you browse are two different
 * products sharing a window, and the site described only the first. Someone
 * looking for something to play their music in read a page about MKV
 * containers and left.
 *
 * The wall on the right is drawn rather than screenshotted, and it carries no
 * titles: sleeves are what a record is recognised by before its name, so the
 * shapes alone say "library" without the page having to invent twelve albums
 * nobody released. Each tile takes its hue from `--i`; the range is narrow and
 * the chroma low, so a wall of them reads as sleeves in a dim room rather than
 * as a paint chart on a page that otherwise spends colour once.
 */

/** The library's four views, in the order the window lists them. */
const TABS = [
  { id: 'albums', label: 'Albums', icon: Disc3, active: true },
  { id: 'artists', label: 'Artists', icon: User, active: false },
  { id: 'songs', label: 'Songs', icon: Music, active: false },
  { id: 'playlists', label: 'Playlists', icon: ListMusic, active: false },
];

/** Twelve sleeves: four across, three down, which fills the panel at every
    width the section is allowed to be. */
const SLEEVES = Array.from({ length: 12 }, (_, index) => index);

const POINTS = [
  {
    icon: FolderInput,
    title: 'It reads the folders you point it at',
    body: 'Nothing is scanned uninvited. Choose the folders and it reads the tags once, and every folder inside becomes a playlist, because you already did the sorting.',
  },
  {
    icon: Search,
    title: 'One field, and each word may match a different thing',
    body: 'Type a half-remembered artist and a year and it finds the record. Sort by whatever you were actually thinking of: title, artist, year, or how recently you added it.',
  },
  {
    icon: ListMusic,
    title: 'Playlists that came from somewhere else',
    body: 'Import an .m3u written by a phone or another player and it finds the music by name and tag, even when the paths inside it point at a device you no longer have.',
  },
];

export default function MusicLibrary() {
  return (
    <section className="xn-section" id="music">
      <header className="xn-section__head rise">
        <p className="xn-section__eyebrow">Music</p>
        <h2 className="xn-section__title">Your music: a library, not a folder of files</h2>
      </header>

      <div className="ld-music">
        <div className="ld-music__copy rise">
          <p className="ld-music__lede">
            A film is a file: you know which one you want and a player should be
            out of the way between the double-click and the picture. Music is
            not. What you want is <em>that record</em>, and finding it means
            looking at what there is.
          </p>

          <ul className="ld-music__points">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="ld-music__point rise">
                <span className="ld-music__point-icon">
                  <Icon size={15} aria-hidden />
                </span>
                <div>
                  <h3 className="ld-music__point-title">{title}</h3>
                  <p className="ld-music__point-body">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="ld-music__note">
            Lossless stays lossless. FLAC and Opus are handed to the decoder
            untouched, and the few formats that cannot be are converted to FLAC
            rather than to AAC.
          </p>
        </div>

        <div
          className="ld-shelf rise"
          role="img"
          aria-label="The library, showing albums as a wall of sleeves, with a record playing in the bar along the bottom."
        >
          <div className="ld-shelf__tabs">
            {TABS.map(({ id, label, icon: Icon, active }) => (
              <span
                key={id}
                className={`ld-shelf__tab${active ? ' ld-shelf__tab--on' : ''}`}
              >
                <Icon size={13} aria-hidden />
                {label}
              </span>
            ))}
          </div>

          <div className="ld-shelf__grid">
            {SLEEVES.map((index) => (
              <span
                key={index}
                className="ld-sleeve"
                style={{ '--i': index } as CSSProperties}
              />
            ))}
          </div>

          {/* The bar that keeps a record playing while you look for the next
              one, which is the difference between a library and a file list. */}
          <div className="ld-shelf__now">
            <span className="ld-sleeve ld-shelf__now-sleeve" />
            <div className="ld-shelf__now-text">
              <p className="ld-shelf__now-title">Lantern Hours</p>
              <p className="ld-shelf__now-artist">The Quiet Arcade · Low Tide</p>
              <div className="ld-shelf__now-bar" />
            </div>
            <span className="ld-shelf__now-play">
              <Pause size={14} aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
