/**
 * When to ask somebody to install Quill
 *
 * Quill asks twice: once a day after it was first opened on this device, and
 * once more at seven days. Then never again. A completed install stops the
 * asking at once. The rule is in `isAskDue`, a pure function over plain
 * timestamps, so it is tested without fake timers.
 *
 * The schedule is stored on the device, under one `localStorage` key. That
 * engages the Privacy and Electronic Communications Regulations, and it
 * relies on the same exemption as the page-view opt-out in `optOut.ts`:
 * storage that is strictly necessary to provide what the user uses. The
 * product owner decided on 2026-09-27 that it qualifies, because installing
 * is an essential part of using Quill well (full screen from its own icon,
 * and on iOS the only way to get notifications). The value is kept as small
 * as that allows: no identifier, never sent anywhere, and mostly the user's
 * own answers. See the plan, `2026-09-26-pwa-install-prompt-plan.md`.
 *
 * It is per device, not per user, on purpose: installing is something a
 * device does, so someone who installed on their phone is still asked on
 * their laptop.
 *
 * It fails closed. Without somewhere to record that an ask was shown, "ask
 * twice, then never" becomes "ask on every page load", so when storage
 * cannot be read or written, nothing is shown.
 */

const KEY = "quill.installPrompt";
const VERSION = 1;

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_ASK_AFTER_MS = DAY_MS;
const SECOND_ASK_AFTER_MS = 7 * DAY_MS;
/** Never both asks in one sitting, for someone who first returns late. */
const MIN_GAP_BETWEEN_ASKS_MS = DAY_MS;
const MAX_ASKS = 2;

export interface InstallPromptState {
  version: typeof VERSION;
  /** When a signed-in page was first shown on this device, epoch ms. */
  firstSeenAt: number;
  /** How many times the automatic ask has been shown: 0, 1 or 2. */
  asksShown: number;
  /** When the last ask was shown, epoch ms, or `null` before the first. */
  lastAskedAt: number | null;
  /** Quill is installed. Nothing is ever asked again. */
  finished: boolean;
}

/** Where the schedule is kept. Injected so tests can make it throw. */
export type StorageGetter = () => Pick<Storage, "getItem" | "setItem">;

const defaultStorage: StorageGetter = () => window.localStorage;

function isState(value: unknown): value is InstallPromptState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === VERSION &&
    typeof v.firstSeenAt === "number" &&
    Number.isFinite(v.firstSeenAt) &&
    typeof v.asksShown === "number" &&
    Number.isInteger(v.asksShown) &&
    v.asksShown >= 0 &&
    v.asksShown <= MAX_ASKS &&
    (v.lastAskedAt === null ||
      (typeof v.lastAskedAt === "number" && Number.isFinite(v.lastAskedAt))) &&
    typeof v.finished === "boolean"
  );
}

function freshState(now: number): InstallPromptState {
  return {
    version: VERSION,
    firstSeenAt: now,
    asksShown: 0,
    lastAskedAt: null,
    finished: false,
  };
}

/** Write the schedule. False when storage refused it. */
export function saveSchedule(
  state: InstallPromptState,
  getStorage: StorageGetter = defaultStorage,
): boolean {
  try {
    getStorage().setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    // A private window, a full quota, or site data blocked outright.
    return false;
  }
}

/**
 * Read the schedule, starting one if this device has none.
 *
 * Returns `null` when storage cannot be used, which callers must treat as
 * "never ask". A stored value that does not parse, or is from another
 * version, is treated as a new device: at worst that means two more asks.
 */
export function loadSchedule(
  now: number,
  getStorage: StorageGetter = defaultStorage,
): InstallPromptState | null {
  let raw: string | null;
  try {
    raw = getStorage().getItem(KEY);
  } catch {
    return null;
  }

  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isState(parsed)) return parsed;
    } catch {
      // Malformed: fall through and start again.
    }
  }

  const state = freshState(now);
  return saveSchedule(state, getStorage) ? state : null;
}

/** Whether the automatic ask should be shown now. */
export function isAskDue(state: InstallPromptState, now: number): boolean {
  if (state.finished) return false;
  if (state.asksShown >= MAX_ASKS) return false;

  const sinceFirstSeen = now - state.firstSeenAt;
  if (state.asksShown === 0) return sinceFirstSeen >= FIRST_ASK_AFTER_MS;

  if (sinceFirstSeen < SECOND_ASK_AFTER_MS) return false;
  return (
    state.lastAskedAt === null ||
    now - state.lastAskedAt >= MIN_GAP_BETWEEN_ASKS_MS
  );
}

/** The schedule after an ask has been shown. */
export function withAskShown(
  state: InstallPromptState,
  now: number,
): InstallPromptState {
  return {
    ...state,
    asksShown: Math.min(state.asksShown + 1, MAX_ASKS),
    lastAskedAt: now,
  };
}

/**
 * Record that Quill is installed, however that happened. Wired to the
 * browser's `appinstalled` event in `main.tsx`.
 */
export function markInstallFinished(
  now: number = Date.now(),
  getStorage: StorageGetter = defaultStorage,
): void {
  const state = loadSchedule(now, getStorage);
  if (state === null || state.finished) return;
  saveSchedule({ ...state, finished: true }, getStorage);
}

/** True once this device has recorded an install. */
export function isInstallFinished(
  getStorage: StorageGetter = defaultStorage,
): boolean {
  try {
    const raw = getStorage().getItem(KEY);
    if (raw === null) return false;
    const parsed: unknown = JSON.parse(raw);
    return isState(parsed) && parsed.finished;
  } catch {
    return false;
  }
}
