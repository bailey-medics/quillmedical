/**
 * Non-component helpers for the module media card.
 *
 * Separate from the components themselves because a file that exports
 * both a component and a constant breaks React Fast Refresh — the lint
 * rule that enforces this is what put them here.
 */

/** The same types the backend's upload allow-list carries. */
export const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

/** Bytes as something a person reads, e.g. "900 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
