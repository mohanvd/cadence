import { Play, Link2 } from 'lucide-react';
import { formatFileSize } from '../../utils/formatFileSize';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

/**
 * Recently opened videos, as cards rather than a text list.
 *
 * A tile shows a frame from the file itself, sampled once when the file was
 * opened and kept beside the entry. Entries added before that existed, and
 * links, have no frame to show and fall back to the play glyph on its own.
 */
export default function RecentRail({ files, onOpen }) {
  if (!files.length) return null;

  return (
    <section className="xn-section">
      <header className="xn-section__head">
        <h2 className="xn-section__title">Recent</h2>
        <span className="xn-section__meta">
          {files.length} {files.length === 1 ? 'video' : 'videos'}
        </span>
      </header>

      <div className="xn-recent">
        {files.map((recent) => (
          <button
            key={`${recent.name}-${recent.openedAt}`}
            type="button"
            className="xn-card"
            onClick={() => onOpen(recent)}
            title={recent.url ? recent.url : recent.name}
          >
            <span className="xn-card__thumb">
              {recent.poster && (
                <img className="xn-card__poster" src={recent.poster} alt="" loading="lazy" />
              )}
              <span className="xn-card__play">
                <Play size={15} fill="currentColor" strokeWidth={0} />
              </span>
              {recent.url && (
                <span className="xn-card__badge">
                  <Link2 size={11} aria-hidden />
                  Link
                </span>
              )}
            </span>
            <span className="xn-card__body">
              <span className="xn-card__name">{recent.name}</span>
              <span className="xn-card__meta">
                {recent.size > 0 && <span>{formatFileSize(recent.size)}</span>}
                {recent.size > 0 && recent.openedAt && <span className="xn-card__dot">·</span>}
                {recent.openedAt && <span>{formatRelativeTime(recent.openedAt)}</span>}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
