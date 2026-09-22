/**
 * When to warn a holder that their right to write is ending.
 *
 * The rule is two weeks out, then every five days. Shown on the way in
 * to the passport rather than at the moment a write is refused, because
 * discovering it half way through typing a reflection is the worst
 * possible moment.
 *
 * A pure function of the days remaining, so the decision is testable
 * without a clock, a render or a fixed date. The backend counts the
 * days against its own clock; nothing here does date arithmetic.
 */

import type { Entitlement } from "./types";

/** How far out the warning starts. */
export const WARN_FROM_DAYS = 14;

/** How often it repeats once it has started. */
export const WARN_EVERY_DAYS = 5;

/**
 * Whether to warn at this many days remaining.
 *
 * Repeating "every five days" is read from the days left rather than
 * from when somebody was last warned: there is nowhere to record that
 * they were, and a rule the client can evaluate from one number needs
 * no state to go stale.
 *
 * So the warning appears at 14, 9 and 4 days, and every day from 3
 * onwards. The last stretch is deliberately not spaced out: by then it
 * is days rather than weeks, and a warning somebody sees once and
 * forgets is the failure this exists to avoid.
 */
export function shouldWarn(daysRemaining: number): boolean {
  if (daysRemaining < 0 || daysRemaining > WARN_FROM_DAYS) {
    return false;
  }

  if (daysRemaining <= WARN_EVERY_DAYS - 2) {
    return true;
  }

  return (WARN_FROM_DAYS - daysRemaining) % WARN_EVERY_DAYS === 0;
}

/**
 * The warning to show, or null when there is nothing to say.
 *
 * Null covers three ordinary cases: no entitlement information at all
 * (an older response), one that has already ended, and one far enough
 * off that saying so would be noise.
 */
export function entitlementWarning(
  entitlement: Entitlement | null | undefined,
): { title: string; description: string } | null {
  const days = entitlement?.days_remaining;

  if (days === undefined || days === null) {
    return null;
  }

  if (days === 0) {
    // Ended today, or already over. Said plainly rather than as a
    // countdown, and without alarm: the record is still theirs to read
    // and to export, which is the part worth knowing.
    return {
      title: "Your passport is now read-only",
      description:
        "You can still read your record and download it in full. " +
        "Adding to it needs an active entitlement.",
    };
  }

  if (!shouldWarn(days)) {
    return null;
  }

  const when = days === 1 ? "tomorrow" : `in ${days} days`;

  return {
    title: `Your passport becomes read-only ${when}`,
    description:
      "You will still be able to read your record and download it in " +
      "full. Adding to it needs an active entitlement.",
  };
}
