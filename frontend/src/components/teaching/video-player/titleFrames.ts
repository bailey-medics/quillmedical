/**
 * Accessible names for iframes a third-party element builds itself.
 */

/** The name YouTube's own embed code gives its player frame. */
export const YOUTUBE_FRAME_TITLE = "YouTube video player";

/**
 * Title every untitled iframe under `root`, and keep doing so as frames
 * are added. Returns a function that stops watching.
 *
 * youtube-video-element builds its iframe inside its own shadow root
 * with no title and no way to pass one, so a screen reader announces an
 * anonymous frame (axe `frame-title`). The iframe is replaced when the
 * video changes, hence the observer rather than one pass.
 */
export function titleFrames(
  root: ParentNode & Node,
  title: string,
): () => void {
  const apply = (): void => {
    root.querySelectorAll("iframe:not([title])").forEach((frame) => {
      frame.setAttribute("title", title);
    });
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
