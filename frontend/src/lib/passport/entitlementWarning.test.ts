/**
 * The rule for warning a holder before their passport goes read-only.
 *
 * Two weeks out, then every five days, then daily once it is close.
 */

import { describe, expect, it } from "vitest";
import {
  entitlementWarning,
  shouldWarn,
  WARN_FROM_DAYS,
} from "./entitlementWarning";

describe("shouldWarn", () => {
  it("says nothing while the end is further off than two weeks", () => {
    // A warning somebody sees for a month is one they stop reading.
    expect(shouldWarn(WARN_FROM_DAYS + 1)).toBe(false);
    expect(shouldWarn(60)).toBe(false);
  });

  it("starts exactly two weeks out", () => {
    expect(shouldWarn(WARN_FROM_DAYS)).toBe(true);
  });

  it("repeats every five days after that", () => {
    expect(shouldWarn(13)).toBe(false);
    expect(shouldWarn(9)).toBe(true);
    expect(shouldWarn(4)).toBe(true);
  });

  it("warns every day once it is days away", () => {
    // By this point the spacing would mean somebody sees it once and
    // forgets, which is the failure the warning exists to prevent.
    for (const days of [3, 2, 1]) {
      expect(shouldWarn(days)).toBe(true);
    }
  });

  it("refuses a negative count rather than warning for ever", () => {
    expect(shouldWarn(-1)).toBe(false);
  });
});

describe("entitlementWarning", () => {
  it("says nothing when the response carries no entitlement", () => {
    // An older backend, or a reader who is not the holder.
    expect(entitlementWarning(undefined)).toBeNull();
    expect(entitlementWarning(null)).toBeNull();
    expect(entitlementWarning({})).toBeNull();
  });

  it("says nothing while the end is far off", () => {
    expect(entitlementWarning({ days_remaining: 90 })).toBeNull();
  });

  it("names the day when the end is close", () => {
    const warning = entitlementWarning({ days_remaining: 14 });

    expect(warning?.title).toContain("14 days");
  });

  it("says tomorrow rather than in 1 days", () => {
    expect(entitlementWarning({ days_remaining: 1 })?.title).toContain(
      "tomorrow",
    );
  });

  it("states the read-only position once it has ended", () => {
    const warning = entitlementWarning({ days_remaining: 0 });

    expect(warning?.title).toContain("read-only");
  });

  it("warns somebody who has no entitlement at all", () => {
    // No date to count down to, so the days-remaining branches say
    // nothing. This used to fall through to null, leaving the page
    // silent and its "Add an entry" button live.
    const warning = entitlementWarning({ can_write: false });

    expect(warning?.title).toContain("read-only");
  });

  it("stays quiet for a response that predates the field", () => {
    // `can_write` undefined means an older server, not a refusal. The
    // server rejects the write either way, and warning somebody who
    // may in fact write is the worse of the two failures.
    expect(entitlementWarning({})).toBeNull();
  });

  it("always says the record can still be read and downloaded", () => {
    // The guarantee that matters: an entitlement ending never locks
    // somebody out of their own professional record.
    for (const days of [0, 1, 14]) {
      expect(entitlementWarning({ days_remaining: days })?.description).toMatch(
        /read your record and download it/,
      );
    }
  });
});
