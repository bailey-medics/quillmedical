/**
 * Reading and writing the time a poster frame is taken from.
 *
 * The admin reads the time off the player in the slides, which shows
 * minutes and seconds, so both "85" and "1:25" are accepted.
 */

/** The second the transcode job takes a poster from when none is chosen. */
export const DEFAULT_POSTER_SECONDS = 5;

/** The longest time accepted, matching the backend's cap of a day. */
export const MAX_POSTER_SECONDS = 86_400;

/**
 * Whole seconds from "85", "1:25" or "1:02:05", or null for anything
 * else: a fraction, a negative, a blank, or past a day.
 */
export function parsePosterTime(text: string): number | null {
  const trimmed = text.trim();

  if (!/^\d+(:\d{1,2}){0,2}$/.test(trimmed)) return null;

  const parts = trimmed.split(":").map(Number);

  // Every part after the first is minutes or seconds, so 60 or more is
  // a typo rather than a time.
  if (parts.slice(1).some((part) => part >= 60)) return null;

  const seconds = parts.reduce((total, part) => total * 60 + part, 0);

  return seconds <= MAX_POSTER_SECONDS ? seconds : null;
}

/** "0:05", "1:25" or "1:02:05", as the player shows a time. */
export function formatPosterTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = String(seconds % 60).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secs}`;
  }

  return `${minutes}:${secs}`;
}
