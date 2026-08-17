import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  checkForUpdateAndReloadIfSafe,
  isRouteSafeForReload,
  type RouteMatchLike,
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
    const matches: RouteMatchLike[] = [{ handle: undefined }];
    expect(isRouteSafeForReload(matches)).toBe(false);
  });

  it("returns false when the leaf route's handle.safeForReload is not true", () => {
    const matches: RouteMatchLike[] = [{ handle: { safeForReload: false } }];
    expect(isRouteSafeForReload(matches)).toBe(false);
  });

  it("returns true when the leaf route's handle.safeForReload is true", () => {
    const matches: RouteMatchLike[] = [
      { handle: undefined },
      { handle: { safeForReload: true } },
    ];
    expect(isRouteSafeForReload(matches)).toBe(true);
  });

  it("only checks the deepest match, not ancestors", () => {
    const matches: RouteMatchLike[] = [
      { handle: { safeForReload: true } },
      { handle: undefined },
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
