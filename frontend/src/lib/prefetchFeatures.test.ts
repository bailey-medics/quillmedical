import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isBackgroundFetchInFlight,
  mayPrefetch,
  prefetchNextFeature,
  readConnection,
  resetPrefetchStateForTests,
  whenIdle,
  type PrefetchConditions,
  type PrefetchChunk,
} from "./prefetchFeatures";

interface TestUser {
  features: string[];
}

function chunk(
  name: string,
  load: () => Promise<unknown> = () => Promise.resolve({}),
): PrefetchChunk<TestUser> & { load: ReturnType<typeof vi.fn> } {
  return {
    name,
    load: vi.fn(load),
    canOpen: (user) => user.features.includes(name),
  };
}

const everything: PrefetchConditions = {
  signedIn: true,
  routeIsSafe: true,
  navigationIdle: true,
  online: true,
  constrained: false,
};

beforeEach(() => {
  resetPrefetchStateForTests();
});

describe("mayPrefetch", () => {
  it("allows a fetch when every condition holds", () => {
    expect(mayPrefetch(everything)).toBe(true);
  });

  it.each<[string, Partial<PrefetchConditions>]>([
    ["nobody is signed in", { signedIn: false }],
    [
      "the route is not safe to reload, as an exam is not",
      { routeIsSafe: false },
    ],
    ["a navigation is under way", { navigationIdle: false }],
    ["the browser is offline", { online: false }],
    ["the connection is constrained", { constrained: true }],
  ])("refuses when %s", (_why, change) => {
    expect(mayPrefetch({ ...everything, ...change })).toBe(false);
  });
});

describe("readConnection", () => {
  it("treats a browser that says nothing as online and unconstrained", () => {
    expect(readConnection({})).toEqual({ online: true, constrained: false });
  });

  it("reports offline", () => {
    expect(readConnection({ onLine: false }).online).toBe(false);
  });

  it("reports data saver as constrained", () => {
    expect(readConnection({ connection: { saveData: true } }).constrained).toBe(
      true,
    );
  });

  it.each(["slow-2g", "2g"])("reports %s as constrained", (effectiveType) => {
    expect(readConnection({ connection: { effectiveType } }).constrained).toBe(
      true,
    );
  });

  it("does not treat 4g as constrained", () => {
    expect(
      readConnection({ connection: { effectiveType: "4g" } }).constrained,
    ).toBe(false);
  });
});

describe("prefetchNextFeature", () => {
  const user: TestUser = { features: ["teaching", "passport"] };

  it("fetches the first chunk the person can open", async () => {
    const admin = chunk("admin");
    const teaching = chunk("teaching");

    const outcome = await prefetchNextFeature(
      [admin, teaching],
      user,
      () => true,
    );

    expect(outcome).toBe("fetched");
    expect(teaching.load).toHaveBeenCalledTimes(1);
  });

  it("never fetches a feature the person cannot open", async () => {
    const admin = chunk("admin");

    const outcome = await prefetchNextFeature([admin], user, () => true);

    expect(outcome).toBe("nothing-left");
    expect(admin.load).not.toHaveBeenCalled();
  });

  it("fetches one chunk per call, in order, and each only once", async () => {
    const teaching = chunk("teaching");
    const passport = chunk("passport");
    const chunks = [teaching, passport];

    expect(await prefetchNextFeature(chunks, user, () => true)).toBe("fetched");
    expect(passport.load).not.toHaveBeenCalled();
    expect(await prefetchNextFeature(chunks, user, () => true)).toBe("fetched");
    expect(await prefetchNextFeature(chunks, user, () => true)).toBe(
      "nothing-left",
    );

    expect(teaching.load).toHaveBeenCalledTimes(1);
    expect(passport.load).toHaveBeenCalledTimes(1);
  });

  // Guarantee one. The caller passes the conditions as they are at this
  // moment; on an exam route they say no, and nothing is fetched.
  it("starts nothing when now is not the moment, and can try again later", async () => {
    const teaching = chunk("teaching");

    expect(await prefetchNextFeature([teaching], user, () => false)).toBe(
      "blocked",
    );
    expect(teaching.load).not.toHaveBeenCalled();
    expect(isBackgroundFetchInFlight()).toBe(false);

    expect(await prefetchNextFeature([teaching], user, () => true)).toBe(
      "fetched",
    );
  });

  it("swallows a failed fetch, and does not try that chunk again", async () => {
    const teaching = chunk("teaching", () =>
      Promise.reject(new Error("Failed to fetch dynamically imported module")),
    );
    const passport = chunk("passport");
    const chunks = [teaching, passport];

    await expect(prefetchNextFeature(chunks, user, () => true)).resolves.toBe(
      "failed",
    );
    await expect(prefetchNextFeature(chunks, user, () => true)).resolves.toBe(
      "fetched",
    );

    expect(teaching.load).toHaveBeenCalledTimes(1);
  });
});

describe("isBackgroundFetchInFlight", () => {
  const user: TestUser = { features: ["teaching"] };

  it("is true only while a background fetch is under way", async () => {
    let finish: (value: unknown) => void = () => {};
    const teaching = chunk(
      "teaching",
      () => new Promise((resolve) => (finish = resolve)),
    );

    expect(isBackgroundFetchInFlight()).toBe(false);
    const pending = prefetchNextFeature([teaching], user, () => true);
    expect(isBackgroundFetchInFlight()).toBe(true);

    finish({});
    await pending;
    expect(isBackgroundFetchInFlight()).toBe(false);
  });

  // The recovery handler runs when Vite fires `vite:preloadError`, which
  // is before the import's promise rejects. So the flag must still be up
  // at the moment of failure, or the handler would take a failed
  // background fetch for a failed navigation and reload the page.
  it("is still true at the moment the fetch fails", async () => {
    let seenAtFailure: boolean | undefined;
    const teaching = chunk("teaching", () => {
      seenAtFailure = isBackgroundFetchInFlight();
      return Promise.reject(new Error("chunk gone"));
    });

    await prefetchNextFeature([teaching], user, () => true);

    expect(seenAtFailure).toBe(true);
    expect(isBackgroundFetchInFlight()).toBe(false);
  });
});

describe("whenIdle", () => {
  it("uses requestIdleCallback where the browser has it", () => {
    const callback = vi.fn();
    const win = {
      requestIdleCallback: vi.fn(() => 7),
      cancelIdleCallback: vi.fn(),
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
    };

    const cancel = whenIdle(callback, win);
    cancel();

    expect(win.requestIdleCallback).toHaveBeenCalledWith(callback, {
      timeout: 5000,
    });
    expect(win.cancelIdleCallback).toHaveBeenCalledWith(7);
    expect(win.setTimeout).not.toHaveBeenCalled();
  });

  it("falls back to a timer where it does not, as in Safari", () => {
    const callback = vi.fn();
    const win = { setTimeout: vi.fn(() => 3), clearTimeout: vi.fn() };

    const cancel = whenIdle(callback, win);
    cancel();

    expect(win.setTimeout).toHaveBeenCalledWith(callback, 2000);
    expect(win.clearTimeout).toHaveBeenCalledWith(3);
  });
});
