import { useState, useCallback, useEffect } from 'react';
import { addRecentFile, clearBookmarkStorage } from './utils/storage';
import { capturePoster } from './utils/poster';
import { saveFileHandle } from './utils/fileHandles';
import { useToast } from './hooks/useToast';
import { useAppUpdates } from './hooks/useAppUpdates';
import { isDesktop, onOpenFile, takeLaunchFile, toPlayableUrl, basename } from './lib/desktop';
import Home from './screens/Home';
import TitleBar from './components/TitleBar';
import { PlayerSurface } from './components/player/PlayerSurface';
import Toast from './components/Toast';
import UpdateBanner from './components/UpdateBanner';

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
  const { updateReady, version: updateVersion, installAndRestart } = useAppUpdates();

  useEffect(() => {
    clearBookmarkStorage();
  }, []);

  const playFile = useCallback(async (file, handle) => {
    setUrlLoadError('');
    setVideoSource({ kind: 'file', file, name: file.name });
    addRecentFile({ name: file.name, size: file.size });
    if (handle) {
      await saveFileHandle({ handle, name: file.name, size: file.size, lastOpened: Date.now() });
    }
    setPlayerOpen(true);
  }, []);

  /**
   * Play a file the operating system handed us, identified by its path.
   *
   * The path is turned into an asset URL rather than read into memory: a film
   * is measured in gigabytes, and the engine only ever needs the ranges it is
   * about to show.
   */
  const playPath = useCallback(
    async (path) => {
      const name = basename(path);
      try {
        const url = await toPlayableUrl(path);
        setUrlLoadError('');
        setVideoSource({ kind: 'url', url, name });
        // The path goes in straight away so the entry is re-openable even if
        // the poster never arrives.
        addRecentFile({ name, path });
        setPlayerOpen(true);

        // Then, without holding up playback, take a still for the tile.
        void capturePoster(url).then((poster) => {
          if (poster) addRecentFile({ name, path, poster });
        });
      } catch (err) {
        console.warn('Could not open the launched file:', err);
        showToast(`Could not open ${name}`);
      }
    },
    [showToast]
  );

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
      />

      {playerOpen && videoSource && (
        <div className="player-overlay">
          <PlayerSurface source={videoSource} title={videoSource.name} onBack={closePlayer} />
        </div>
      )}

      <Toast toast={toast} />

      {updateReady && (
        <UpdateBanner version={updateVersion} onInstall={installAndRestart} />
      )}
    </div>
  );
}
