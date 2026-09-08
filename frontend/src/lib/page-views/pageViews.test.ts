import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasOptedOut, setOptedOut } from "./optOut";
import { recordPageView, resetPageViewStateForTests } from "./pageViews";

async function lastBody(
  beacon: ReturnType<typeof vi.fn>,
): Promise<Record<string, unknown>> {
  const blob = beacon.mock.calls.at(-1)?.[1] as Blob;
  return JSON.parse(await blob.text()) as Record<string, unknown>;
}

let beacon: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetPageViewStateForTests();
  beacon = vi.fn().mockReturnValue(true);
  vi.stubGlobal("navigator", { sendBeacon: beacon, userAgent: "test" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
  } catch {
    /* nothing stored */
  }
});

describe("sending a page view", () => {
  it("posts the pattern and the session identifier", async () => {
    recordPageView("/patients/:id");

    expect(beacon).toHaveBeenCalledTimes(1);
    const body = await lastBody(beacon);
    expect(body["page"]).toBe("/patients/:id");
    expect(String(body["session_id"])).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it("sends nothing else at all", async () => {
    recordPageView("/settings");

    expect(Object.keys(await lastBody(beacon)).sort()).toEqual([
      "page",
      "session_id",
    ]);
  });

  it("shares the session identifier with the error reporter", async () => {
    // Two identifiers for one visit would make the counts impossible to line
    // up against the errors from the same session.
    const { getSessionId } = await import("@lib/error-reporting/report");
    recordPageView("/settings");

    expect((await lastBody(beacon))["session_id"]).toBe(getSessionId());
  });
});

describe("not counting the same thing twice", () => {
  it("ignores a repeat of the pattern just sent", () => {
    recordPageView("/settings");
    recordPageView("/settings");
    recordPageView("/settings");

    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("counts a genuine navigation away and back", () => {
    recordPageView("/settings");
    recordPageView("/messages");
    recordPageView("/settings");

    expect(beacon).toHaveBeenCalledTimes(3);
  });

  it("stops at the per-page cap, leaving allowance for other tabs", () => {
    for (let i = 0; i < 500; i += 1) recordPageView(`/page-${i}`);

    expect(beacon).toHaveBeenCalledTimes(100);
  });
});

describe("never becoming a problem of its own", () => {
  it("does nothing when the browser cannot send beacons", () => {
    vi.stubGlobal("navigator", {});

    expect(() => recordPageView("/settings")).not.toThrow();
  });

  it("does not throw when sendBeacon itself throws", () => {
    vi.stubGlobal("navigator", {
      sendBeacon: () => {
        throw new Error("beacon exploded");
      },
    });

    expect(() => recordPageView("/settings")).not.toThrow();
  });

  it("ignores an empty pattern", () => {
    recordPageView("");

    expect(beacon).not.toHaveBeenCalled();
  });
});

describe("the opt-out", () => {
  it("is off until the user asks", () => {
    expect(hasOptedOut()).toBe(false);
  });

  it("remembers the choice across page loads, unlike the session id", () => {
    // A preference that forgets itself on every refresh is not a preference.
    setOptedOut(true);

    expect(hasOptedOut()).toBe(true);
  });

  it("can be turned back on", () => {
    setOptedOut(true);
    setOptedOut(false);

    expect(hasOptedOut()).toBe(false);
  });

  it("counts rather than fails when storage cannot be read", () => {
    // A private window or blocked storage. The user has expressed no wish,
    // and a page view carries no identifier that could be traced to them.
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });

    expect(hasOptedOut()).toBe(false);
  });
});
