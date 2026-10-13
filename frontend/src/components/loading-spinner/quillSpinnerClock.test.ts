import { afterEach, describe, expect, it } from "vitest";
import {
  quillSpinnerElapsedMs,
  resetQuillSpinnerClock,
  startQuillSpinnerClockAt,
  startQuillSpinnerClockFrom,
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

  describe("started from a spinner that is already turning", () => {
    function turningSince(startTime: unknown): Element {
      const element = document.createElement("div");
      element.getAnimations = () => [{ startTime } as Animation];

      return element;
    }

    it("counts from when that spinner began", () => {
      setTimelineTime(1500);
      startQuillSpinnerClockFrom(turningSince(300));

      expect(quillSpinnerElapsedMs()).toBe(1200);
    });

    it("changes nothing when the spinner is not there", () => {
      setTimelineTime(1500);
      startQuillSpinnerClockFrom(null);

      expect(quillSpinnerElapsedMs()).toBe(1500);
    });

    it("changes nothing when its animation has not started yet", () => {
      setTimelineTime(1500);
      startQuillSpinnerClockFrom(turningSince(null));

      expect(quillSpinnerElapsedMs()).toBe(1500);
    });

    // Reduced motion stills the spinner, and jsdom has no animations.
    it("changes nothing when it is not turning", () => {
      setTimelineTime(1500);
      startQuillSpinnerClockFrom(document.createElement("div"));

      expect(quillSpinnerElapsedMs()).toBe(1500);
    });
  });
});
