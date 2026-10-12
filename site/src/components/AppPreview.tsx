import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Captions,
  Maximize,
  Minus,
  Music,
  Pause,
  RotateCcw,
  RotateCw,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  SquarePlay,
  Volume2,
  X,
} from './icons';
import type { CSSProperties } from 'react';
import Mark from './Mark';

/** The two sections the window's own bar carries, in its order. */
const TABS = [
  { id: 'files', label: 'Files', icon: SquarePlay, active: true },
  { id: 'music', label: 'Music', icon: Music, active: false },
];

/** Where the bookmarks sit on the timeline, as fractions of the film. */
const BOOKMARKS = [0.18, 0.41, 0.77];

/**
 * The application's own window, with a film playing in it, rebuilt in the page.
 *
 * This was a screenshot once, and a screenshot is the wrong medium for it:
 * fixed at one resolution, heavier than the markup it depicts, and quietly out
 * of date the first time the interface changes. Then it was the empty window
 * with its drop card, which was accurate and showed a player doing nothing.
 * Now it is the thing a visitor is here for, a film playing, with the two
 * facts about it that no other player can claim pinned beside it.
 *
 * The chrome is the player's, written out rather than imported: the bar is
 * `app/src/components/TitleBar.jsx` and the transport is
 * `app/src/components/player/ControlBar.tsx`, and those files are what this is
 * read against when the two next disagree. The film is not a film. It is a
 * few gradients, so it costs nothing to download and never looks compressed.
 *
 * `inert` covers the window. It is a picture of an interface, and every control
 * in it would otherwise be focusable, offering to do something none of it can.
 */
export default function AppPreview() {
  return (
    <div className="stage">
      <div
        className="window"
        role="img"
        aria-label="The Cadence window playing a film, with subtitles, a timeline and the transport along the bottom."
      >
        <div className="window__inner" inert={true}>
          <div className="window__bar">
            <span className="window__mark">
              <Mark size={16} cut="small" />
            </span>
            <span className="window__history">
              <span className="window__arrow">
                <ArrowLeft size={15} />
              </span>
              <span className="window__arrow window__arrow--off">
                <ArrowRight size={15} />
              </span>
            </span>

            <span className="window__nav">
              {TABS.map(({ id, label, icon: Icon, active }) => (
                <span key={id} className={`window__tab${active ? ' window__tab--on' : ''}`}>
                  <Icon size={13} />
                  {label}
                </span>
              ))}
            </span>

            <span className="window__controls">
              <span className="window__btn">
                <Minus size={15} />
              </span>
              <span className="window__btn">
                <Square size={12} />
              </span>
              <span className="window__btn window__btn--close">
                <X size={15} />
              </span>
            </span>
          </div>

          <div className="film">
            {/* Sky, sun, three ridges and a lake, back to front. */}
            <span className="film__sky" />
            <span className="film__sun" />
            <span className="film__ridge film__ridge--far" />
            <span className="film__ridge film__ridge--mid" />
            <span className="film__ridge film__ridge--near" />
            <span className="film__grain" />

            <p className="film__title">The Long Light.mkv</p>

            <p className="film__subtitle">
              We leave when the light goes,
              <br />
              and not a minute before.
            </p>

            <div className="transport">
              <div className="timeline">
                <span className="timeline__buffered" />
                <span className="timeline__played" />
                {BOOKMARKS.map((at) => (
                  <span
                    key={at}
                    className="timeline__mark"
                    style={{ '--at': at } as CSSProperties}
                  />
                ))}
                <span className="timeline__head" />
              </div>

              <div className="transport__row">
                <span className="transport__group">
                  <span className="transport__btn transport__btn--play">
                    <Pause size={22} />
                  </span>
                  <span className="transport__btn">
                    <SkipBack size={18} />
                  </span>
                  <span className="transport__btn">
                    <SkipForward size={18} />
                  </span>
                  <span className="transport__btn">
                    <RotateCcw size={18} />
                  </span>
                  <span className="transport__btn">
                    <RotateCw size={18} />
                  </span>
                  <span className="transport__btn">
                    <Volume2 size={18} />
                  </span>
                  <span className="transport__time">
                    1:12:08 <span className="transport__time-total">/ 2:04:51</span>
                  </span>
                </span>

                <span className="transport__group">
                  <span className="transport__chip">1×</span>
                  <span className="transport__btn transport__btn--on">
                    <Captions size={18} />
                  </span>
                  <span className="transport__btn">
                    <Bookmark size={18} />
                  </span>
                  <span className="transport__btn">
                    <Settings size={18} />
                  </span>
                  <span className="transport__btn">
                    <Maximize size={18} />
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The two facts about this frame worth reading, pinned to it. Outside
          the window's `img` role because they are prose, and a screen reader
          should hear them as such. Plain blocks rather than <aside>: they are
          notes on a picture, not regions of the page to jump between. */}
      <div className="callout callout--codec">
        <p className="callout__lede">HEVC Main 10 in Matroska</p>
        <p className="callout__body">Handed to the decoder untouched</p>
      </div>
      <div className="callout callout--subs">
        <p className="callout__lede">Styled subtitles</p>
        <p className="callout__body">ASS, drawn by libass, in the film's own fonts</p>
      </div>
    </div>
  );
}
