/**
 * Creates the `<video>` element every backend renders into.
 *
 * Shared so the two backends cannot drift, and so the hardening below is
 * applied in exactly one place.
 */
export function createVideoElement(): HTMLVideoElement {
  const video = document.createElement('video');
  // No background of its own: the shell behind it is already black, and an
  // opaque element here would paint over the ambient glow in the letterbox.
  video.className = 'h-full w-full object-contain';
  video.playsInline = true;
  video.preload = 'auto';
  // The engine owns the UI; the browser's own controls must never appear.
  video.controls = false;

  /*
   * Remove the browser's built-in extraction affordances.
   *
   * `controlsList` drops "Save video as…" and the remote-playback entries from
   * the native menu. Suppressing that menu outright is deliberately *not* done
   * here: the app renders its own right-click menu over this element, and
   * calling `preventDefault` on a listener attached to the element itself would
   * silently disable it. React delegates events at the root, so an
   * element-level listener runs first, and Radix skips opening whenever the
   * event arrives already default-prevented.
   *
   * This is a product decision, not a security control: it stops a casual
   * right-click from pulling the file out, and nothing more. Anyone with
   * devtools still has the blob URL. Treat it as removing an affordance, not as
   * protection.
   */
  video.setAttribute('controlsList', 'nodownload noremoteplayback noplaybackrate');
  video.disableRemotePlayback = true;

  return video;
}
