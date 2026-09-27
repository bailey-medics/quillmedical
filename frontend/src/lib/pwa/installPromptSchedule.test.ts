import { describe, expect, it } from "vitest";
import {
  isAskDue,
  isInstallFinished,
  loadSchedule,
  markInstallFinished,
  saveSchedule,
  withAskShown,
  type InstallPromptState,
  type StorageGetter,
} from "./installPromptSchedule";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 8, 1, 9, 0, 0);

function memoryStorage(initial?: string): {
  getStorage: StorageGetter;
  stored: () => string | null;
} {
  let value: string | null = initial ?? null;
  return {
    getStorage: () => ({
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    }),
    stored: () => value,
  };
}

const throwingOnRead: StorageGetter = () => ({
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => undefined,
});

const throwingOnWrite: StorageGetter = () => ({
  getItem: () => null,
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
});

function state(overrides: Partial<InstallPromptState>): InstallPromptState {
  return {
    version: 1,
    firstSeenAt: START,
    asksShown: 0,
    lastAskedAt: null,
    finished: false,
    ...overrides,
  };
}

describe("isAskDue", () => {
  it("waits a full day before the first ask", () => {
    expect(isAskDue(state({}), START + DAY - 1)).toBe(false);
    expect(isAskDue(state({}), START + DAY)).toBe(true);
  });

  it("waits until seven days for the second ask", () => {
    const afterFirst = state({ asksShown: 1, lastAskedAt: START + DAY });
    expect(isAskDue(afterFirst, START + 7 * DAY - 1)).toBe(false);
    expect(isAskDue(afterFirst, START + 7 * DAY)).toBe(true);
  });

  it("never asks twice in one sitting for somebody who returns late", () => {
    const firstAskOnDayTen = state({
      asksShown: 1,
      lastAskedAt: START + 10 * DAY,
    });
    expect(isAskDue(firstAskOnDayTen, START + 10 * DAY + HOUR)).toBe(false);
    expect(isAskDue(firstAskOnDayTen, START + 11 * DAY)).toBe(true);
  });

  it("never asks a third time", () => {
    expect(
      isAskDue(
        state({ asksShown: 2, lastAskedAt: START + 7 * DAY }),
        START + 100 * DAY,
      ),
    ).toBe(false);
  });

  it("never asks once installed, whatever else is true", () => {
    expect(isAskDue(state({ finished: true }), START + 100 * DAY)).toBe(false);
  });
});

describe("withAskShown", () => {
  it("counts the ask and records when it was shown", () => {
    expect(withAskShown(state({}), START + DAY)).toMatchObject({
      asksShown: 1,
      lastAskedAt: START + DAY,
    });
  });
});

describe("loadSchedule", () => {
  it("starts a schedule on a new device and stores it", () => {
    const storage = memoryStorage();
    const loaded = loadSchedule(START, storage.getStorage);
    expect(loaded).toEqual(state({}));
    expect(JSON.parse(storage.stored() ?? "null")).toEqual(state({}));
  });

  it("keeps an existing schedule", () => {
    const existing = state({ asksShown: 1, lastAskedAt: START + DAY });
    const storage = memoryStorage(JSON.stringify(existing));
    expect(loadSchedule(START + 3 * DAY, storage.getStorage)).toEqual(existing);
  });

  it("treats a malformed value as a new device", () => {
    const storage = memoryStorage("{not json");
    expect(loadSchedule(START, storage.getStorage)).toEqual(state({}));
  });

  it("treats a value of the wrong shape as a new device", () => {
    const storage = memoryStorage(JSON.stringify({ version: 1, asksShown: 9 }));
    expect(loadSchedule(START, storage.getStorage)).toEqual(state({}));
  });

  it("fails closed when storage cannot be read", () => {
    expect(loadSchedule(START, throwingOnRead)).toBeNull();
  });

  it("fails closed when the first-seen time cannot be written", () => {
    expect(loadSchedule(START, throwingOnWrite)).toBeNull();
  });
});

describe("saveSchedule", () => {
  it("reports a refused write", () => {
    expect(saveSchedule(state({}), throwingOnWrite)).toBe(false);
  });
});

describe("markInstallFinished and isInstallFinished", () => {
  it("records an install on a device with a schedule", () => {
    const storage = memoryStorage(JSON.stringify(state({ asksShown: 1 })));
    markInstallFinished(START, storage.getStorage);
    expect(isInstallFinished(storage.getStorage)).toBe(true);
  });

  it("records an install on a device that had no schedule yet", () => {
    const storage = memoryStorage();
    markInstallFinished(START, storage.getStorage);
    expect(isInstallFinished(storage.getStorage)).toBe(true);
  });

  it("reads not finished when nothing is stored or storage throws", () => {
    expect(isInstallFinished(memoryStorage().getStorage)).toBe(false);
    expect(isInstallFinished(throwingOnRead)).toBe(false);
  });
});
