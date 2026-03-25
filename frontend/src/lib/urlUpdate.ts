/**
 * urlUpdate
 *
 * Returns the provided asset URL unchanged. Previously this function
 * prepended `/app` when the SPA was mounted under `/app/`, but now that
 * the app is served at `/` the prefix is no longer needed.
 *
 * Kept as a passthrough so existing call sites continue to work.
 *
 * @param url - The asset path to normalize (should start with `/`)
 * @returns The asset path unchanged
 */
export function urlUpdate(url: string): string {
  return url;
}

export default urlUpdate;
