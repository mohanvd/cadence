import * as React from 'react';
import { useDiscordStore } from '@/store/discordStore';

/**
 * A picture of the record, on a server somebody else can reach.
 *
 * Cadence already has the sleeve: it is inside the file, or sitting in the
 * folder beside it. None of that helps here. Discord draws activity artwork by
 * fetching it from its own servers, and nothing on this disk is reachable from
 * there, so a local sleeve can only ever be a picture nobody else can load.
 *
 * The record is therefore looked up by name. What leaves this machine is the
 * artist and the album, and only while the presence is switched on, which is to
 * say only while those two strings are already being published to everyone who
 * can see the profile. The file itself never moves. That is the line: Cadence
 * sends what you chose to broadcast, never what is on your disk.
 *
 * Off unless asked for, like everything else here.
 */

/** Answers are kept for the session, so a queue does not ask twice. */
const answers = new Map<string, string | null>();

/**
 * MusicBrainz first.
 *
 * Not a coin toss between services. It answers with a relevance score, which is
 * a judgement made by something that knows the catalogue, rather than the string
 * comparison this file would otherwise be doing on titles that disagree about
 * remasters and deluxe editions. It also simply knows more: the iTunes search
 * that was tried first could not find `The Dark Side of the Moon` under any
 * phrasing, and MusicBrainz scores it 100.
 */
const MUSICBRAINZ = 'https://musicbrainz.org/ws/2/release-group';

/** Below this the catalogue is guessing, and a wrong sleeve is worse than none. */
const CONFIDENT = 85;

/** The pictures for what MusicBrainz identified. Not every record has one. */
const COVER_ART = 'https://coverartarchive.org/release-group';

interface Group {
  id?: string;
  score?: number;
}

interface Match {
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
}

/** Strip what differs between two spellings of one record. */
function loose(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '')
    .trim();
}

/** Quote a term for a Lucene query, where a stray quote changes the meaning. */
function quoted(text: string): string {
  return `"${text.replace(/["\\]/g, ' ')}"`;
}

/** The ways a tag says "more than one of us made this". */
const JOINERS = /\s*[/;]\s*|\s+(?:&|feat\.?|ft\.?|with|vs\.?)\s+/i;

/**
 * The names worth asking a catalogue about, most likely first.
 *
 * The whole string first, always. A band really called `Florence + the Machine`
 * or `Earth, Wind & Fire` has to be found under its own name before anything
 * starts cutting it in half.
 *
 * Then the pieces, because a collaboration is tagged as one artist and
 * catalogued as another: a file saying `League of Legends/Against The Current`
 * returns nothing at all, and `Against The Current` alone scores 100 for the
 * same record.
 */
function namesIn(artist: string): string[] {
  const whole = artist.trim();
  const parts = whole
    .split(JOINERS)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && part !== whole);
  // Three at most. Past that the guesses are worse than the logo, and each one
  // is a request to somebody else's server for a picture nobody asked twice for.
  return [whole, ...parts].slice(0, 3);
}

async function fromMusicBrainz(
  artist: string,
  album: string,
  signal: AbortSignal,
): Promise<string | null> {
  for (const name of namesIn(artist)) {
    const query = encodeURIComponent(`artist:${quoted(name)} AND releasegroup:${quoted(album)}`);
    const response = await fetch(`${MUSICBRAINZ}?query=${query}&fmt=json&limit=3`, {
      signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) continue;

    const body = (await response.json()) as { 'release-groups'?: Group[] };
    const best = body['release-groups']?.[0];
    if (!best?.id || (best.score ?? 0) < CONFIDENT) continue;

    /* Being catalogued is not the same as being photographed: plenty of records
       are known here and have no sleeve on file. Asking now is one request that
       saves handing Discord a URL it will fetch, fail on, and draw as an empty
       square, which looks broken in a way the logo never does. */
    const cover = `${COVER_ART}/${best.id}/front-500`;
    const check = await fetch(cover, { signal, method: 'HEAD' });
    if (check.ok) return cover;
  }
  return null;
}

/**
 * Whether the record iTunes came back with is the one that was asked for.
 *
 * A search always answers. Asking for something obscure returns the nearest
 * famous thing to it, and this is the only guard against that: asking for
 * `The Dark Side of the Moon` returns `The Wall` at the top of the list.
 */
function trustworthy(match: Match, artist: string, album: string): boolean {
  const wantedArtist = loose(artist);
  const wantedAlbum = loose(album);
  const gotArtist = loose(match.artistName ?? '');
  const gotAlbum = loose(match.collectionName ?? '');
  if (!gotArtist || !gotAlbum) return false;

  const artistAgrees = gotArtist.includes(wantedArtist) || wantedArtist.includes(gotArtist);
  const albumAgrees = gotAlbum.includes(wantedAlbum) || wantedAlbum.includes(gotAlbum);
  return artistAgrees && albumAgrees;
}

async function fromItunes(
  artist: string,
  album: string,
  signal: AbortSignal,
): Promise<string | null> {
  const term = encodeURIComponent(`${artist} ${album}`);
  const response = await fetch(
    `https://itunes.apple.com/search?term=${term}&entity=album&limit=10`,
    { signal },
  );
  if (!response.ok) return null;

  const body = (await response.json()) as { results?: Match[] };
  const found = (body.results ?? []).find((match) => trustworthy(match, artist, album));
  const small = found?.artworkUrl100;
  if (!small) return null;

  // The search hands back a thumbnail. The same file is served at any size by
  // asking for one, and Discord draws this at about 160 points on a display
  // that may be doubling them.
  return small.replace('100x100bb', '512x512bb');
}

async function lookUp(artist: string, album: string, signal: AbortSignal): Promise<string | null> {
  try {
    const known = await fromMusicBrainz(artist, album, signal);
    if (known) return known;
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    // One catalogue being unreachable is not a reason to skip the other.
  }
  return fromItunes(artist, album, signal);
}

/**
 * The cover for what is playing, or an empty string.
 *
 * Empty covers every case that is not a found record: the setting is off, the
 * file is a film, it has no tags to search with, neither catalogue knew it, or
 * the answer has not arrived yet. The card falls back to the logo, which is
 * what it showed before this existed.
 */
export function useCoverArt(artist: string, album: string, music: boolean): string {
  const enabled = useDiscordStore((state) => state.enabled && state.albumArt);
  const [url, setUrl] = React.useState('');

  const wanted = music && enabled && artist.trim() !== '' && album.trim() !== '';
  const key = wanted ? `${artist.trim()}\u0000${album.trim()}` : '';

  React.useEffect(() => {
    if (!key) {
      setUrl('');
      return undefined;
    }

    const remembered = answers.get(key);
    if (remembered !== undefined) {
      setUrl(remembered ?? '');
      return undefined;
    }

    /* Nothing is shown while the answer is on its way. The card is already up
       with the logo on it, and swapping the picture in when it arrives beats
       holding the whole card back for one that may never come. */
    setUrl('');

    const controller = new AbortController();
    const divide = key.indexOf('\u0000');
    const wantedArtist = key.slice(0, divide);
    const wantedAlbum = key.slice(divide + 1);
    void lookUp(wantedArtist, wantedAlbum, controller.signal)
      .then((found) => {
        answers.set(key, found);
        setUrl(found ?? '');
      })
      .catch(() => {
        /* Offline, rate-limited, or the track changed while the answer was in
           the air. Only the first two are worth remembering, and telling them
           apart is not worth a branch: a card with the logo on it is a card. */
        if (!controller.signal.aborted) answers.set(key, null);
      });

    return () => controller.abort();
  }, [key]);

  return url;
}
