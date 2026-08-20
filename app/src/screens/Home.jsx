import { Icon } from '../components/ui/icons';
import DropCard from '../components/home/DropCard';
import RecentRail from '../components/home/RecentRail';
import { useVideoIntake } from '../hooks/useVideoIntake';

/**
 * The screen behind the player: somewhere to open a file from.
 *
 * It used to carry the feature bento, the shortcut table and the capability
 * index as well, because this page was also the product's only shop window.
 * Those now live on the site, which is where someone deciding whether to
 * install this reads them. Someone who has already installed it opened the app
 * to play something, and every section between them and the drop card was in
 * the way.
 */
export default function Home({
  onPlayFile,
  onPlayUrl,
  onPlayPath,
  urlLoadError,
  onClearUrlError,
  showToast,
  updateStatus,
  updateError,
}) {
  const intake = useVideoIntake({
    onFileSelect: onPlayFile,
    onUrlSelect: onPlayUrl,
    onPathSelect: onPlayPath,
    showToast,
    urlLoadError,
    onClearUrlError,
  });

  return (
    <div className="xn-home" {...intake.dragProps}>
      {/* No navbar. The window's own title bar carries the wordmark, which is
          the whole point of drawing one: two bars stacked at the top of a
          window is what a web page wrapped in a shell looks like. */}
      <main className="xn-home__scroll xn-home__scroll--app custom-scroll">
        <div className="xn-home__inner xn-home__inner--app">
          <section className="xn-hero">
            <h1 className="xn-hero__title">Open a file and it plays</h1>
            <p className="xn-hero__sub">
              Drop it anywhere on this window, or press the space bar once it is open.
            </p>
          </section>

          <DropCard
            active={intake.isDragging}
            error={intake.error}
            urlInput={intake.urlInput}
            onUrlChange={intake.setUrlInput}
            onUrlSubmit={intake.submitUrl}
            onOpenPicker={intake.openPicker}
          />

          <RecentRail files={intake.recentFiles} onOpen={intake.openRecent} />
        </div>

        {/* The site signs off with the wordmark at the size of a shop sign.
            Here it would be an advertisement shown to someone who has already
            bought the thing, so all that survives is the number a bug report
            asks for. */}
        <p className="xn-appversion">
          Cadence {__APP_VERSION__}
          {/* Only ever shown when the update channel is broken. Up to date is
              silence, and an update that is ready gets the banner instead. */}
          {updateStatus === 'error' && (
            <span className="xn-appversion__fault">
              {' · '}
              could not check for updates
              {updateError ? `: ${updateError}` : ''}
            </span>
          )}
        </p>
      </main>

      {intake.needsFallbackInput && (
        <input
          ref={intake.fileInputRef}
          type="file"
          accept=".mp4,.webm,.mkv,.mov,.mp3,.m4a,.flac,.wav,.opus,.ogg,video/*,audio/*"
          className="hidden"
          onChange={intake.handleFileInput}
          aria-label="Select a file to play"
        />
      )}

      {intake.isDragging && (
        <div className="xn-dragveil" aria-hidden>
          <div className="xn-dragveil__box">
            <Icon name="play" size={26} />
            <p className="xn-dragveil__title">Drop to play</p>
            <p className="xn-dragveil__sub">Release anywhere on the window</p>
          </div>
        </div>
      )}
    </div>
  );
}
