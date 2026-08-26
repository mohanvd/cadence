/**
 * What a file's name says it is.
 *
 * By extension, and that is the point rather than a shortcut. Three places
 * need this answer, the tile that has to choose between a frame and a sleeve,
 * the mode that decides whether "no video track" is news, and the window that
 * decides whether leaving the player should stop it, and all three are asked
 * about a list of files at once, where opening each one to find out would cost
 * a process per answer to learn something the name already told us.
 *
 * The list is the one the intake accepts, and it has to stay that way: a
 * format that can be opened and is not named here is a track that gets treated
 * as a film.
 */
const SOUND_ONLY = /\.(mp3|m4a|m4b|flac|wav|opus|ogg|oga|aac|wma|aiff?|ape|wv|mka)$/i;

/** Whether this name belongs to a file that has no picture in it. */
export function isSoundOnly(name: string): boolean {
  return SOUND_ONLY.test(name);
}
