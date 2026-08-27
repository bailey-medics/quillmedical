import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRetryRecord,
  decideRetryAction,
  hasPendingRetryRecord,
  RETRY_INTERVAL_MS,
} from "./retryState";

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe("decideRetryAction", () => {
  let storage: Storage;
  const now = 1_700_000_000_000;

  beforeEach(() => {
    storage = makeMemoryStorage();
  });

  it("reloads immediately on a fresh mismatch with no prior record", () => {
    const decision = decideRetryAction(5, now, storage);
    expect(decision).toEqual({ action: "reload-now", attempts: 1 });
  });

  it("falls back when the same generation mismatches again before the retry interval elapses", () => {
    decideRetryAction(5, now, storage);
    const decision = decideRetryAction(5, now + 1000, storage);
    expect(decision.action).toBe("fallback");
    if (decision.action === "fallback") {
      expect(decision.waitMs).toBe(RETRY_INTERVAL_MS - 1000);
    }
  });

  it("reloads again once the retry interval has elapsed for the same generation", () => {
    decideRetryAction(5, now, storage);
    const decision = decideRetryAction(5, now + RETRY_INTERVAL_MS, storage);
    expect(decision).toEqual({ action: "reload-now", attempts: 2 });
  });

  it("treats a newer generation as a fresh mismatch, resetting attempts", () => {
    decideRetryAction(5, now, storage);
    decideRetryAction(5, now + 1000, storage); // fallback
    const decision = decideRetryAction(6, now + 2000, storage);
    expect(decision).toEqual({ action: "reload-now", attempts: 1 });
  });

  it("hasPendingRetryRecord reflects whether a record is stored", () => {
    expect(hasPendingRetryRecord(storage)).toBe(false);
    decideRetryAction(5, now, storage);
    expect(hasPendingRetryRecord(storage)).toBe(true);
  });

  it("clearRetryRecord removes any tracked state", () => {
    decideRetryAction(5, now, storage);
    clearRetryRecord(storage);
    expect(hasPendingRetryRecord(storage)).toBe(false);
  });

  it("treats corrupted JSON in storage as no record", () => {
    storage.setItem("quill-forced-reload-retry", "{not-json");
    expect(hasPendingRetryRecord(storage)).toBe(false);
    const decision = decideRetryAction(5, now, storage);
    expect(decision).toEqual({ action: "reload-now", attempts: 1 });
  });
});
