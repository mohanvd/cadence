import { useState, useCallback, useEffect } from 'react';
import { addRecentFile, clearBookmarkStorage } from './utils/storage';
import { capturePoster } from './utils/poster';
import { useToast } from './hooks/useToast';
import { useAppUpdates } from './hooks/useAppUpdates';
import { isDesktop, onOpenFile, takeLaunchFile, basename } from './lib/desktop';
import { useFolderQueue, useQueueControls } from './features/playback/useFolderQueue';
import Home from './screens/Home';
import TitleBar from './components/TitleBar';
import { PlayerSurface } from './components/player/PlayerSurface';
import Toast from './components/Toast';
import UpdatePill from './components/UpdatePill';

/*
 * The install prompt that used to live here has gone with the progressive web
 * app. `beforeinstallprompt`, `appinstalled` and the display-mode check were
 * all ways of asking a browser to pretend a tab was a program; there is nothing
 * left for them to ask.
 */
export default function App() {
  const [playerOpen, setPlayerOpen] = useState(false);
  const [videoSource, setVideoSource] = useState(null);
  const [urlLoadError, setUrlLoadError] = useState('');
  const { toast, showToast } = useToast();
  const {
    version: updateVersion,
    status: updateStatus,
    progress: updateProgress,
    error: updateError,
    installAndRestart,
  } = useAppUpdates();

  useEffect(() => {
    clearBookmarkStorage();
  }, []);

  /* A `File` with no path behind it, which only the browser dev server
     produces. The recent entry it leaves is a record that the file was
     watched, not a way back to it. */
  const playFile = useCallback((file) => {
    setUrlLoadError('');
    setVideoSource({ kind: 'file', file, name: file.name });
    addRecentFile({ name: file.name, size: file.size });
    setPlayerOpen(true);
  }, []);

  /**
   * Play a file the operating system handed us, identified by its path.
   *
   * The path is passed on as a path. What opens it is the engine's decision:
   * a container the browser demuxes goes straight to the media element as an
   * asset URL, and everything else goes through FFmpeg. Either way the file is
   * streamed rather than read, because a film is measured in gigabytes.
   */
  const playPath = useCallback((path) => {
    const name = basename(path);

    setUrlLoadError('');
    setVideoSource({ kind: 'path', path, name });
    // The path goes in straight away so the entry is re-openable even if the
    // poster never arrives.
    addRecentFile({ name, path });
    setPlayerOpen(true);

    /* Then, without holding up playback, take a still for the tile. FFmpeg
       reads the frame, so it works for every file the player will open rather
       than only the ones the browser demuxes. Every failure resolves to null
       and the tile keeps its placeholder. */
    void capturePoster(path)
      .then((poster) => {
        if (poster) addRecentFile({ name, path, poster });
      })
      .catch(() => {});
  }, []);

  /* Two ways a file arrives from outside the app, and both land here: the one
     Cadence was launched with, collected once on startup, and any opened while
     it is already running, which the shell routes to this window rather than
     starting a second copy. */
  useEffect(() => {
    if (!isDesktop()) return undefined;
    void takeLaunchFile().then((path) => {
      if (path) void playPath(path);
    });
    return onOpenFile((path) => void playPath(path));
  }, [playPath]);

  const playUrl = useCallback((url) => {
    const pathname = url.split('?')[0];
    const filename = pathname.split('/').pop() || 'video';
    setUrlLoadError('');
    setVideoSource({ kind: 'url', url, name: filename });
    addRecentFile({ name: filename, size: 0, url });
    setPlayerOpen(true);
  }, []);

  /* The rest of the folder, and the two ways through it.
   *
   * Derived from whatever is playing rather than assembled when a file is
   * opened, so it is right no matter how the file arrived — the launcher, a
   * double-click while Cadence was already running, or the end of the previous
   * episode. */
  const queue = useFolderQueue(videoSource);
  const { onNext, onPrevious } = useQueueControls(queue, playPath);

  // Load failures are now reported by the player surface itself, which can name
  // the offending codec rather than guessing from the source type.

  const closePlayer = useCallback(() => {
    setPlayerOpen(false);
  }, []);

  return (
    <div className="app-shell">
      <TitleBar />

      {/* One screen, so no router. The player is an overlay over this rather
          than a route of its own: it has to be able to appear without the
          launcher unmounting, since going back to it should not mean rebuilding
          the recent list. */}
      <Home
        onPlayFile={playFile}
        onPlayUrl={playUrl}
        onPlayPath={playPath}
        urlLoadError={urlLoadError}
        onClearUrlError={() => setUrlLoadError('')}
        showToast={showToast}
        updateStatus={updateStatus}
        updateError={updateError}
      />

      {playerOpen && videoSource && (
        <div className="player-overlay">
          <PlayerSurface
            source={videoSource}
            title={videoSource.name}
            onBack={closePlayer}
            onNext={onNext}
            onPrevious={onPrevious}
            position={queue.position}
          />
        </div>
      )}

      <Toast toast={toast} />

      {/* Decides for itself whether there is anything to say. Downloading and
          ready are both worth a word; idle and up to date are not. */}
      <UpdatePill
        status={updateStatus}
        version={updateVersion}
        progress={updateProgress}
        onInstall={installAndRestart}
      />
    </div>
  );
}
