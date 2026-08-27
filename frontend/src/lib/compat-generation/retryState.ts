/**
 * retryState
 *
 * sessionStorage-backed tracking for the forced-reload retry/fallback
 * decision, surviving across the `location.reload()` calls that this
 * mechanism itself triggers (a plain in-memory flag would not survive a
 * reload). See docs/docs/plans/2026-08-09-sub-plan-api-compatibility-plan.md
 * "Forced-reload flow" for the full behaviour this implements:
 *
 * - First mismatch seen for a given server generation -> reload immediately.
 * - Mismatch still present for that *same* generation after the reload ->
 *   this is a repeat failure: show the dismissible fallback banner AND
 *   keep retrying a reload automatically every RETRY_INTERVAL_MS in the
 *   background, in case the deploy is simply still rolling out.
 * - A mismatch for a *different* (newer) generation always resets the
 *   record and reloads immediately again — it's a fresh decision, not a
 *   repeat of the one already tracked.
 */

const STORAGE_KEY = "quill-forced-reload-retry";

export const RETRY_INTERVAL_MS = 5 * 60 * 1000;

export interface RetryRecord {
  /** The server generation this record was tracking a mismatch against. */
  generation: number;
  /** How many reload attempts have been made for this generation. */
  attempts: number;
  /** Epoch ms — the earliest time a further automatic retry may fire. */
  nextRetryAt: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readRecord(storage: StorageLike): RetryRecord | null {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RetryRecord>;
    if (
      typeof parsed.generation === "number" &&
      typeof parsed.attempts === "number" &&
      typeof parsed.nextRetryAt === "number"
    ) {
      return parsed as RetryRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function writeRecord(storage: StorageLike, record: RetryRecord): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // sessionStorage unavailable/full — best-effort only, never blocks the
    // reload flow itself.
  }
}

export function clearRetryRecord(storage: StorageLike = sessionStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * True if a retry record is already tracked from a previous mismatch —
 * used on mount to decide whether to proactively re-check compatibility
 * (via a lightweight request) rather than waiting for organic traffic.
 * Read-only: never writes or mutates state.
 */
export function hasPendingRetryRecord(
  storage: StorageLike = sessionStorage,
): boolean {
  return readRecord(storage) !== null;
}

export type RetryDecision =
  | { action: "reload-now"; attempts: number }
  | { action: "fallback"; waitMs: number }
  | { action: "wait"; waitMs: number };

/**
 * Decides what to do about a detected mismatch against `serverGeneration`,
 * given whatever retry state (if any) is already recorded from a previous
 * attempt, and records the outcome back to storage.
 *
 * - `reload-now`: no record for this generation yet (fresh mismatch, or a
 *   newer generation than last tracked) -> caller should persist form
 *   state and reload immediately.
 * - `fallback`: a record for this exact generation already exists (the
 *   previous reload didn't fix it) -> caller should show the dismissible
 *   banner. `waitMs` is how long until the next automatic background
 *   retry is due (may be 0 if already overdue).
 * - `wait`: same as fallback but the background retry isn't due yet and
 *   the caller has already shown the fallback banner this session — kept
 *   distinct so the caller doesn't need to re-derive "already showing".
 */
export function decideRetryAction(
  serverGeneration: number,
  now: number,
  storage: StorageLike = sessionStorage,
): RetryDecision {
  const existing = readRecord(storage);

  if (!existing || existing.generation !== serverGeneration) {
    writeRecord(storage, {
      generation: serverGeneration,
      attempts: 1,
      nextRetryAt: now + RETRY_INTERVAL_MS,
    });
    return { action: "reload-now", attempts: 1 };
  }

  if (now >= existing.nextRetryAt) {
    const attempts = existing.attempts + 1;
    writeRecord(storage, {
      generation: serverGeneration,
      attempts,
      nextRetryAt: now + RETRY_INTERVAL_MS,
    });
    return { action: "reload-now", attempts };
  }

  return { action: "fallback", waitMs: existing.nextRetryAt - now };
}
