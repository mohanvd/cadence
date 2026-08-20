import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { addRecentFile, clearBookmarkStorage } from './utils/storage';
import { capturePoster } from './utils/poster';
import { useToast } from './hooks/useToast';
import { useAppUpdates } from './hooks/useAppUpdates';
import { isDesktop, onOpenFile, takeLaunchFile, basename } from './lib/desktop';
import { useFolderQueue, useQueueControls as useFolderControls } from './features/playback/useFolderQueue';
import { usePlayerStore } from './store/playerStore';
import { useQueueStore } from './store/queueStore';
import Home from './screens/Home';
import Music from './screens/Music';
import { TooltipProvider } from './components/ui/tooltip';
import { closeMenus } from './components/ui/popover';
import { MusicSearch } from './components/music/MusicSearch';
import { isSoundOnly } from './lib/media';
import { useView, useViewStore } from './store/viewStore';
import { useNoBrowserMenu } from './components/music/TrackMenu';
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
  /* Which of the two ways in is on screen behind the player. A position in
     the window's history rather than local state, so the arrows in the bar
     move between them like they move between everything else. */
  const view = useView();
  const screen = view.screen;
  const setScreen = useViewStore((s) => s.go);
  /* Hidden rather than closed. The player keeps its element, its decoder and
     its position; only the overlay stops being painted. That is what lets
     somebody go back to the library and keep listening, which is the whole
     difference between a music player and a video player that plays music. */
  const minimised = !view.player;
  const setMinimised = useCallback(
    (away) => useViewStore.getState().go({ player: !away }),
    [],
  );
  /* The search box lives in the window's own bar, so what was typed into it
     lives here rather than inside the library. One bar, one place. */
  const [query, setQuery] = useState('');
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

  /* No Back, Refresh, Save as, Print or Inspect. That menu is WebView2
     introducing itself, and three of its five items would do something
     actively wrong here. */
  useNoBrowserMenu();

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
  const folder = useFolderQueue(videoSource);
  const folderControls = useFolderControls(folder, playPath);

  /* The other queue: a list somebody chose in the library.
   *
   * Which of the two is in charge is decided by how playback started, not by a
   * setting. Opening a file puts the folder in charge, as it always was.
   * Playing something from the library puts this in charge, and it stays in
   * charge until a file is opened from outside it. */
  const chosen = useQueueStore((s) => s.items.length > 0);
  const startQueue = useQueueStore((s) => s.start);
  const advance = useQueueStore((s) => s.advance);
  const retreat = useQueueStore((s) => s.retreat);
  const clearQueue = useQueueStore((s) => s.clear);
  const queueIndex = useQueueStore((s) => s.cursor + 1);
  const queueTotal = useQueueStore((s) => s.items.length);

  /** Play a list of tracks from the library, queueing the rest behind it. */
  const playList = useCallback(
    (songs, index, label) => {
      const paths = songs.map((song) => song.path);
      const first = startQueue(paths, index, label);
      if (!first) return;
      playPath(first);
      // Stay where you are. Picking a track out of a library is not a request
      // to be taken away from the library.
      setScreen({ player: false });
    },
    [startQueue, playPath, setScreen],
  );

  /* Shuffle from the library starts on a random track rather than on the first
     one and then jumping. Starting on the first and shuffling after it would
     mean every shuffled album opened with the same song. */
  const shuffleList = useCallback(
    (songs, label) => {
      if (songs.length === 0) return;
      if (!useQueueStore.getState().shuffle) useQueueStore.getState().toggleShuffle();
      playList(songs, Math.floor(Math.random() * songs.length), label);
    },
    [playList],
  );

  /* Next and previous come from whichever queue is in charge. Repeat-one is
     handled here rather than in the store because it is not a queue move at
     all: the track does not change, it starts again, and only the player knows
     how to do that. */
  const onNext = useCallback(() => {
    if (!chosen) {
      folderControls.onNext?.();
      return;
    }
    if (useQueueStore.getState().repeat === 'one') {
      usePlayerStore.getState().seek(0);
      usePlayerStore.getState().play();
      return;
    }
    const next = advance();
    if (next) playPath(next);
  }, [chosen, folderControls, advance, playPath]);

  const onPrevious = useCallback(() => {
    if (!chosen) {
      folderControls.onPrevious?.();
      return;
    }
    const previous = retreat();
    if (previous) playPath(previous);
  }, [chosen, folderControls, retreat, playPath]);

  /* A queue with nowhere left to go should not leave a dead button in the bar.
     The folder answers with a path or nothing; this answers with whether the
     cursor can move, which for repeat-all is always. */
  const queueHasNext = useQueueStore(
    (s) => s.repeat !== 'off' || s.cursor < s.order.length - 1,
  );
  const queueHasPrevious = useQueueStore((s) => s.repeat !== 'off' || s.cursor > 0);

  const nextHandler = chosen
    ? queueHasNext
      ? onNext
      : undefined
    : folderControls.onNext;
  const previousHandler = chosen
    ? queueHasPrevious
      ? onPrevious
      : undefined
    : folderControls.onPrevious;

  const position = React.useMemo(() => {
    if (!chosen) return folder.position;
    return queueTotal > 1 ? { index: queueIndex, total: queueTotal } : null;
  }, [chosen, folder.position, queueIndex, queueTotal]);

  /* Leaving the player, for a film, means closing it.
   *
   * Music is put away and keeps playing, with a bar along the bottom to come
   * back to. A film has neither — nobody browses a library while watching one
   * — so the same gesture that puts a track away stops a film. Watched here
   * rather than in the back arrow because there are three ways out now: the
   * arrow, the section tabs, and the history. */
  useEffect(() => {
    if (!playerOpen || !minimised) return;
    if (videoSource && isSoundOnly(videoSource.name)) return;
    setPlayerOpen(false);
  }, [playerOpen, minimised, videoSource]);

  /* Opening a file from outside the library hands the queue back to the folder
     it came from. Leaving a library queue standing would mean double-clicking
     an episode in Explorer and then being taken to whatever album happened to
     be playing an hour ago. */
  const openFile = useCallback(
    (path) => {
      clearQueue();
      playPath(path);
      // A file opened on purpose is a file somebody wants to watch, so the
      // player comes to the front even if it was put away a moment ago.
      setScreen({ player: true });
    },
    [clearQueue, playPath],
  );

  // Load failures are now reported by the player surface itself, which can name
  // the offending codec rather than guessing from the source type.

  const closePlayer = useCallback(() => {
    setPlayerOpen(false);
    setMinimised(false);
  }, [setMinimised]);

  /* Changing screen while something is playing puts the player away rather
     than stopping it. Anything else would mean the library is unreachable
     while a record is on, which is the one moment somebody most wants it. */
  const goToScreen = useCallback(
    (next) => {
      setScreen({ screen: next });
      closeMenus();
      /* Music is put away and keeps playing; a film is closed. Nobody browses
         a music library while watching one in the same window, and leaving it
         running invisibly with no transport would be a film playing to nobody
         with no way back to it. */
      if (videoSource && isSoundOnly(videoSource.name)) setMinimised(true);
      else setPlayerOpen(false);
    },
    [videoSource, setScreen, setMinimised],
  );

  const expandPlayer = useCallback(() => setMinimised(false), [setMinimised]);

  /* Collapsing the player puts it away and leaves you where you were.
   *
   * It used to also change screen to the library, which is wrong for the
   * ordinary case: somebody who put a record on and then went to the file
   * screen, expanded the player to look at the sleeve, and collapsed it again
   * was taken somewhere they had not asked to go. Where you were is where you
   * were; the music keeps playing either way. */
  const minimiseToMusic = useCallback(() => {
    setScreen({ player: false });
    closeMenus();
  }, [setScreen]);

  return (
    /* One provider for the whole window rather than one inside the player.
       The transport now appears in two places — over the sleeve and docked to
       the window — and only one of them was inside the player's provider, so
       the other threw the moment it rendered a tooltip. */
    <TooltipProvider delayDuration={400}>
    <div className={`app-shell${playerOpen && minimised ? ' app-shell--playing' : ''}`}>
      <TitleBar
        screen={screen}
        onScreen={goToScreen}
        search={
          screen === 'music' ? <MusicSearch value={query} onChange={setQuery} /> : null
        }
      />

      {/* Two screens and no router. The player is an overlay over whichever is
          showing rather than a route of its own: it has to be able to appear
          without the screen behind it unmounting, since going back should not
          mean rebuilding the recent list or the library.

          Both stay mounted for the same reason, and the hidden one is hidden
          with `display: none` rather than unmounted: switching to the library
          and back should not re-read eight thousand tracks. */}
      {/* Hidden with a real block wrapper rather than `display: contents`.
          Contents removes the box, and a box that is not there cannot be
          hidden: the whole screen stayed clickable and in the tab order
          underneath the library, which is invisible right up until somebody
          presses Tab or a script clicks the wrong button. */}
      <div hidden={screen !== 'home'}>
        <Home
          onPlayFile={playFile}
          onPlayUrl={playUrl}
          onPlayPath={openFile}
          urlLoadError={urlLoadError}
          onClearUrlError={() => setUrlLoadError('')}
          showToast={showToast}
          updateStatus={updateStatus}
          updateError={updateError}
        />
      </div>

      {screen === 'music' && (
        <div className={`music-screen${playerOpen && minimised ? ' music-screen--playing' : ''}`}>
          <Music
            query={query}
            onPlay={playList}
            onShuffle={shuffleList}
            playing={videoSource?.kind === 'path' ? videoSource.path : null}
          />
        </div>
      )}

      {playerOpen && videoSource && (
        <PlayerSurface
          source={videoSource}
          title={videoSource.name}
          minimised={minimised}
          onExpand={expandPlayer}
          onBack={closePlayer}
          onMinimise={minimiseToMusic}
          onNext={nextHandler}
          onPrevious={previousHandler}
          position={position}
        />
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
    </TooltipProvider>
  );
}
