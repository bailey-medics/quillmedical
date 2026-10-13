import { afterEach, describe, expect, it } from "vitest";
import {
  quillSpinnerElapsedMs,
  resetQuillSpinnerClock,
  startQuillSpinnerClockAt,
} from "./quillSpinnerClock";

function setTimelineTime(currentTime: unknown) {
  Object.defineProperty(document, "timeline", {
    value: { currentTime },
    configurable: true,
  });
}

afterEach(() => {
  resetQuillSpinnerClock();
  Reflect.deleteProperty(document, "timeline");
});

describe("quillSpinnerClock", () => {
  it("answers zero where there is no timeline to read", () => {
    expect(quillSpinnerElapsedMs()).toBe(0);
  });

  it("answers zero while the timeline has no time yet", () => {
    setTimelineTime(null);
    expect(quillSpinnerElapsedMs()).toBe(0);
  });

  it("counts from when the page opened until told otherwise", () => {
    setTimelineTime(1500.4);
    expect(quillSpinnerElapsedMs()).toBe(1500);
  });

  it("counts from the moment it is given", () => {
    setTimelineTime(1500);
    startQuillSpinnerClockAt(400);

    expect(quillSpinnerElapsedMs()).toBe(1100);
  });

  it("is never negative, for a start that has not happened yet", () => {
    setTimelineTime(100);
    startQuillSpinnerClockAt(400);

    expect(quillSpinnerElapsedMs()).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -5])(
    "ignores a start of %s",
    (start) => {
      setTimelineTime(1500);
      startQuillSpinnerClockAt(start);

      expect(quillSpinnerElapsedMs()).toBe(1500);
    },
  );
});
