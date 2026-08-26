import { create } from 'zustand';
import { setDiscordPresence } from '@/lib/desktop';

/**
 * Whether Discord is told what is playing.
 *
 * Two switches, and both start off.
 *
 * Rich Presence is not a private note to a friend: it is published to everyone
 * who can see the profile, and it updates itself without being asked again. A
 * player that turned it on by default would be broadcasting on behalf of
 * somebody who never agreed to broadcast.
 *
 * The second switch exists because music and video are not the same risk. A
 * song title says what somebody has taste for. A file name says what they are
 * watching alone at one in the morning, and people who would happily show the
 * first are not being inconsistent when they refuse the second. With titles
 * off, the card still says Cadence is open and playing something, which is the
 * part that is fun to share, and stops there.
 */

const KEY = 'cadence:discord';

export interface DiscordSettings {
  enabled: boolean;
  videoTitles: boolean;
}

const DEFAULTS: DiscordSettings = {
  enabled: false,
  videoTitles: false,
};

function read(): DiscordSettings {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return DEFAULTS;
    const parsed = JSON.parse(stored) as Partial<DiscordSettings>;
    return {
      enabled: parsed.enabled === true,
      videoTitles: parsed.videoTitles === true,
    };
  } catch {
    // A settings file that will not parse is a settings file that has never
    // been written. Both mean the same thing here: off.
    return DEFAULTS;
  }
}

function write(settings: DiscordSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private browsing, or a full disk. The setting still holds for this run.
  }
}

interface DiscordStore extends DiscordSettings {
  setEnabled: (enabled: boolean) => void;
  setVideoTitles: (videoTitles: boolean) => void;
  /** Hand the current settings to the shell. Called once at startup. */
  sync: () => void;
}

export const useDiscordStore = create<DiscordStore>((set, get) => {
  const push = (next: DiscordSettings) => {
    write(next);
    void setDiscordPresence(next);
  };

  return {
    ...read(),

    setEnabled: (enabled) => {
      const next = { enabled, videoTitles: get().videoTitles };
      set(next);
      push(next);
    },

    // Turning film titles on turns the whole thing on, because a switch that
    // silently does nothing until a second switch is found is a switch that
    // reads as broken.
    setVideoTitles: (videoTitles) => {
      const next = { enabled: get().enabled || videoTitles, videoTitles };
      set(next);
      push(next);
    },

    sync: () => {
      const { enabled, videoTitles } = get();
      void setDiscordPresence({ enabled, videoTitles });
    },
  };
});
