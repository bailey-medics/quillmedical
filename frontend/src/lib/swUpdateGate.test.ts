import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  checkForUpdateAndReloadIfSafe,
  decidePreloadFailureAction,
  isRouteSafeForReload,
  wirePreloadErrorRecovery,
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

function makePreloadRouter(
  safeForReload: boolean,
  locationState: unknown = null,
): RouterLike {
  return {
    subscribe: vi.fn(() => () => {}),
    state: {
      matches: [{ route: { handle: { safeForReload } } }],
      location: { state: locationState },
    },
  };
}

describe("decidePreloadFailureAction", () => {
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    storage = makeStorage();
  });

  it("reloads on a safe route with no flash", () => {
    expect(
      decidePreloadFailureAction({
        routeIsSafe: true,
        hasFlash: false,
        storage,
      }),
    ).toBe("reload");
  });

  it("records the reload-loop guard when it decides to reload", () => {
    decidePreloadFailureAction({
      routeIsSafe: true,
      hasFlash: false,
      storage,
    });

    expect(storage.setItem).toHaveBeenCalledWith("quill-preload-reloaded", "1");
  });

  it("defers on an unsafe route rather than destroying work", () => {
    expect(
      decidePreloadFailureAction({
        routeIsSafe: false,
        hasFlash: false,
        storage,
      }),
    ).toBe("defer");
  });

  it("defers while a flash message is in flight", () => {
    expect(
      decidePreloadFailureAction({
        routeIsSafe: true,
        hasFlash: true,
        storage,
      }),
    ).toBe("defer");
  });

  it("does not record the guard when it defers", () => {
    decidePreloadFailureAction({
      routeIsSafe: false,
      hasFlash: false,
      storage,
    });

    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("defers a second time, so a chunk missing from the current build cannot spin", () => {
    expect(
      decidePreloadFailureAction({
        routeIsSafe: true,
        hasFlash: false,
        storage,
      }),
    ).toBe("reload");

    expect(
      decidePreloadFailureAction({
        routeIsSafe: true,
        hasFlash: false,
        storage,
      }),
    ).toBe("defer");
  });

  it("uses a different guard key from the service-worker gate", () => {
    const shared = makeStorage({ "quill-sw-update-reloaded": "1" });

    expect(
      decidePreloadFailureAction({
        routeIsSafe: true,
        hasFlash: false,
        storage: shared,
      }),
    ).toBe("reload");
  });
});

describe("wirePreloadErrorRecovery", () => {
  let storage: ReturnType<typeof makeStorage>;
  let listeners: Map<string, (event: Event) => void>;
  let addEventListener: typeof window.addEventListener;

  function firePreloadError(): Event {
    const event = new Event("vite:preloadError", { cancelable: true });
    listeners.get("vite:preloadError")?.(event);
    return event;
  }

  beforeEach(() => {
    storage = makeStorage();
    listeners = new Map();
    addEventListener = vi.fn((type: string, listener: unknown) => {
      listeners.set(type, listener as (event: Event) => void);
    }) as unknown as typeof window.addEventListener;
  });

  it("listens for vite:preloadError", () => {
    wirePreloadErrorRecovery({
      router: makePreloadRouter(true),
      persist: vi.fn(),
      reload: vi.fn(),
      addEventListener,
      storage,
    });

    expect(listeners.has("vite:preloadError")).toBe(true);
  });

  it("reloads on a safe route, persisting form state first", () => {
    const persist = vi.fn();
    const reload = vi.fn();
    const order: string[] = [];
    persist.mockImplementation(() => order.push("persist"));
    reload.mockImplementation(() => order.push("reload"));

    wirePreloadErrorRecovery({
      router: makePreloadRouter(true),
      persist,
      reload,
      addEventListener,
      currentPathname: () => "/passport",
      storage,
    });
    firePreloadError();

    expect(persist).toHaveBeenCalledWith("/passport");
    expect(reload).toHaveBeenCalledTimes(1);
    // Persisting after the reload call would save nothing.
    expect(order).toEqual(["persist", "reload"]);
  });

  it("does not reload on an unsafe route, and reports the deferral", () => {
    const reload = vi.fn();
    const onDeferred = vi.fn();

    wirePreloadErrorRecovery({
      router: makePreloadRouter(false),
      persist: vi.fn(),
      reload,
      onDeferred,
      addEventListener,
      storage,
    });
    firePreloadError();

    expect(reload).not.toHaveBeenCalled();
    expect(onDeferred).toHaveBeenCalledTimes(1);
  });

  it("does not persist form state when it defers, leaving the live page untouched", () => {
    const persist = vi.fn();

    wirePreloadErrorRecovery({
      router: makePreloadRouter(false),
      persist,
      reload: vi.fn(),
      addEventListener,
      storage,
    });
    firePreloadError();

    expect(persist).not.toHaveBeenCalled();
  });

  it("defers when a flash message is in flight on a safe route", () => {
    const reload = vi.fn();

    wirePreloadErrorRecovery({
      router: makePreloadRouter(true, { flash: "Saved" }),
      persist: vi.fn(),
      reload,
      addEventListener,
      storage,
    });
    firePreloadError();

    expect(reload).not.toHaveBeenCalled();
  });

  it("prevents default so Vite does not also rethrow the error", () => {
    wirePreloadErrorRecovery({
      router: makePreloadRouter(true),
      persist: vi.fn(),
      reload: vi.fn(),
      addEventListener,
      storage,
    });

    expect(firePreloadError().defaultPrevented).toBe(true);
  });

  it("prevents default on the deferred path too", () => {
    wirePreloadErrorRecovery({
      router: makePreloadRouter(false),
      persist: vi.fn(),
      reload: vi.fn(),
      addEventListener,
      storage,
    });

    expect(firePreloadError().defaultPrevented).toBe(true);
  });

  it("reloads only once, so a chunk missing from the current build cannot spin", () => {
    const reload = vi.fn();

    wirePreloadErrorRecovery({
      router: makePreloadRouter(true),
      persist: vi.fn(),
      reload,
      addEventListener,
      storage,
    });
    firePreloadError();
    firePreloadError();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
