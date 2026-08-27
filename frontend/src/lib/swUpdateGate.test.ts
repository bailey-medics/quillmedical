import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  checkForUpdateAndReloadIfSafe,
  isRouteSafeForReload,
  wireUpdateChecks,
  HOURLY_INTERVAL_MS,
  type RouteMatchLike,
  type RouterLike,
} from "./swUpdateGate";

function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

function makeRegistration(
  overrides: Partial<{
    waiting: ServiceWorkerRegistration["waiting"];
    update: () => Promise<void>;
  }> = {},
) {
  return {
    waiting: overrides.waiting ?? null,
    update: overrides.update ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as ServiceWorkerRegistration;
}

describe("isRouteSafeForReload", () => {
  it("returns false when there are no matches", () => {
    expect(isRouteSafeForReload([])).toBe(false);
  });

  it("returns false when the leaf route has no handle", () => {
    const matches: RouteMatchLike[] = [{ route: { handle: undefined } }];
    expect(isRouteSafeForReload(matches)).toBe(false);
  });

  it("returns false when the leaf route's handle.safeForReload is not true", () => {
    const matches: RouteMatchLike[] = [
      { route: { handle: { safeForReload: false } } },
    ];
    expect(isRouteSafeForReload(matches)).toBe(false);
  });

  it("returns true when the leaf route's handle.safeForReload is true", () => {
    const matches: RouteMatchLike[] = [
      { route: { handle: undefined } },
      { route: { handle: { safeForReload: true } } },
    ];
    expect(isRouteSafeForReload(matches)).toBe(true);
  });

  it("only checks the deepest match, not ancestors", () => {
    const matches: RouteMatchLike[] = [
      { route: { handle: { safeForReload: true } } },
      { route: { handle: undefined } },
    ];
    expect(isRouteSafeForReload(matches)).toBe(false);
  });
});

describe("checkForUpdateAndReloadIfSafe", () => {
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    storage = makeStorage();
  });

  it("does nothing when not a production build", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({ update });

    await checkForUpdateAndReloadIfSafe({
      registration,
      isProd: false,
      routeIsSafe: true,
      hasFlash: false,
      storage,
    });

    expect(update).not.toHaveBeenCalled();
  });

  it("does nothing when the current route is not safe for reload", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({ update });

    await checkForUpdateAndReloadIfSafe({
      registration,
      isProd: true,
      routeIsSafe: false,
      hasFlash: false,
      storage,
    });

    expect(update).not.toHaveBeenCalled();
  });

  it("does nothing when a flash message is in flight for this navigation", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({ update });

    await checkForUpdateAndReloadIfSafe({
      registration,
      isProd: true,
      routeIsSafe: true,
      hasFlash: true,
      storage,
    });

    expect(update).not.toHaveBeenCalled();
  });

  it("does nothing when this tab has already reloaded once this session", async () => {
    storage = makeStorage({ "quill-sw-update-reloaded": "1" });
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({ update });

    await checkForUpdateAndReloadIfSafe({
      registration,
      isProd: true,
      routeIsSafe: true,
      hasFlash: false,
      storage,
    });

    expect(update).not.toHaveBeenCalled();
  });

  it("checks for an update but takes no action when none is waiting", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({ update, waiting: null });

    await checkForUpdateAndReloadIfSafe({
      registration,
      isProd: true,
      routeIsSafe: true,
      hasFlash: false,
      storage,
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("fails closed when the update check itself errors", async () => {
    const update = vi.fn().mockRejectedValue(new Error("network blip"));
    const registration = makeRegistration({ update });

    await checkForUpdateAndReloadIfSafe({
      registration,
      isProd: true,
      routeIsSafe: true,
      hasFlash: false,
      storage,
    });

    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("activates the waiting worker and records the reload-loop guard when everything is safe", async () => {
    const postMessage = vi.fn();
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({
      update,
      waiting: { postMessage } as unknown as ServiceWorker,
    });

    await checkForUpdateAndReloadIfSafe({
      registration,
      isProd: true,
      routeIsSafe: true,
      hasFlash: false,
      storage,
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      "quill-sw-update-reloaded",
      "1",
    );
    expect(postMessage).toHaveBeenCalledWith("SKIP_WAITING");
  });
});

function makeRouter(safeForReload: boolean): RouterLike & {
  setSafe: (safe: boolean) => void;
  triggerNavigation: () => void;
} {
  const state: RouterLike["state"] = {
    matches: [{ route: { handle: { safeForReload } } }],
    location: { state: null },
  };
  let listener: (() => void) | undefined;

  return {
    subscribe: vi.fn((l: () => void) => {
      listener = l;
      return () => {};
    }),
    get state() {
      return state;
    },
    setSafe(safe: boolean) {
      state.matches = [{ route: { handle: { safeForReload: safe } } }];
    },
    triggerNavigation() {
      listener?.();
    },
  };
}

describe("wireUpdateChecks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs an initial check on wiring using the route safety at that moment", async () => {
    const postMessage = vi.fn();
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({
      update,
      waiting: { postMessage } as unknown as ServiceWorker,
    });
    const router = makeRouter(true);

    wireUpdateChecks(router, registration, true);
    await vi.advanceTimersByTimeAsync(0);

    expect(update).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith("SKIP_WAITING");
  });

  it("does nothing on the initial check when the current route is unsafe", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({ update });
    const router = makeRouter(false);

    wireUpdateChecks(router, registration, true);
    await vi.advanceTimersByTimeAsync(0);

    expect(update).not.toHaveBeenCalled();
  });

  it("re-checks on every navigation, using the route safety at that time", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({ update, waiting: null });
    const router = makeRouter(false);

    wireUpdateChecks(router, registration, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(update).not.toHaveBeenCalled();

    router.setSafe(true);
    router.triggerNavigation();
    await vi.advanceTimersByTimeAsync(0);

    expect(update).toHaveBeenCalledTimes(1);
  });

  it("the hourly timer defers on an unsafe route", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({ update, waiting: null });
    const router = makeRouter(false);

    wireUpdateChecks(router, registration, true);
    await vi.advanceTimersByTimeAsync(0);
    update.mockClear();

    await vi.advanceTimersByTimeAsync(HOURLY_INTERVAL_MS);

    expect(update).not.toHaveBeenCalled();
  });

  it("the hourly timer acts immediately when the current route is safe", async () => {
    const postMessage = vi.fn();
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({
      update,
      waiting: { postMessage } as unknown as ServiceWorker,
    });
    const router = makeRouter(false);

    wireUpdateChecks(router, registration, true);
    await vi.advanceTimersByTimeAsync(0);
    update.mockClear();
    postMessage.mockClear();

    router.setSafe(true);
    await vi.advanceTimersByTimeAsync(HOURLY_INTERVAL_MS);

    expect(update).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith("SKIP_WAITING");
  });

  it("respects a custom interval", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = makeRegistration({ update, waiting: null });
    const router = makeRouter(true);
    const customIntervalMs = 1000;

    wireUpdateChecks(router, registration, true, customIntervalMs);
    await vi.advanceTimersByTimeAsync(0);
    update.mockClear();

    await vi.advanceTimersByTimeAsync(customIntervalMs);

    expect(update).toHaveBeenCalledTimes(1);
  });
});
