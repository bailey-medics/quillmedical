import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import { AssessmentTimer } from "./AssessmentTimer";

/** Let *ms* pass, with every tick in it firing as it should. */
function pass(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("AssessmentTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
        "performance",
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("displays the seconds it is told are left", () => {
    renderWithMantine(
      <AssessmentTimer secondsLeft={75 * 60} onExpire={() => {}} />,
    );

    expect(screen.getByText("75:00")).toBeInTheDocument();
  });

  it("starts part way through when told fewer seconds than the whole time", () => {
    renderWithMantine(
      <AssessmentTimer secondsLeft={65 * 60} onExpire={() => {}} />,
    );

    expect(screen.getByText("65:00")).toBeInTheDocument();
  });

  it("counts down as time passes", () => {
    renderWithMantine(
      <AssessmentTimer secondsLeft={3 * 60} onExpire={() => {}} />,
    );

    pass(1_000);
    expect(screen.getByText("02:59")).toBeInTheDocument();

    pass(59_000);
    expect(screen.getByText("02:00")).toBeInTheDocument();
  });

  it("counts from when the figure arrived, not from when it was shown", () => {
    const arrived = performance.now();
    vi.advanceTimersByTime(20_000);

    renderWithMantine(
      <AssessmentTimer
        secondsLeft={60}
        receivedAt={arrived}
        onExpire={() => {}}
      />,
    );

    expect(screen.getByText("00:40")).toBeInTheDocument();
  });

  it("shows 'Time up' when there is no time left", () => {
    renderWithMantine(<AssessmentTimer secondsLeft={0} onExpire={() => {}} />);

    expect(screen.getByText("Time up")).toBeInTheDocument();
  });

  it("displays countdown when 1 minute or less remains", () => {
    renderWithMantine(<AssessmentTimer secondsLeft={30} onExpire={() => {}} />);

    expect(screen.getByText("00:30")).toBeInTheDocument();
  });

  describe("a tab whose ticks stop", () => {
    it("shows the right time on the first tick after five minutes of none", () => {
      // The stopwatch runs on while no tick fires, as in a tab nobody is
      // looking at
      const steady = performance.now.bind(performance);
      let unseen = 0;
      vi.spyOn(performance, "now").mockImplementation(() => steady() + unseen);

      renderWithMantine(
        <AssessmentTimer secondsLeft={30 * 60} onExpire={() => {}} />,
      );
      expect(screen.getByText("30:00")).toBeInTheDocument();

      unseen = 5 * 60 * 1000;
      pass(250);

      expect(screen.getByText("25:00")).toBeInTheDocument();
    });

    it("says the time is up if it ran out while no tick fired", () => {
      const handleExpire = vi.fn();
      const steady = performance.now.bind(performance);
      let unseen = 0;
      vi.spyOn(performance, "now").mockImplementation(() => steady() + unseen);

      renderWithMantine(
        <AssessmentTimer secondsLeft={60} onExpire={handleExpire} />,
      );

      unseen = 5 * 60 * 1000;
      pass(250);

      expect(screen.getByText("Time up")).toBeInTheDocument();
      expect(handleExpire).toHaveBeenCalledTimes(1);
    });
  });

  describe("a computer whose clock is wrong", () => {
    it.each([
      ["three minutes fast", 3 * 60 * 1000],
      ["three minutes slow", -3 * 60 * 1000],
    ])("shows the right time on a clock %s", (_name, wrongBy) => {
      vi.setSystemTime(Date.now() + wrongBy);

      renderWithMantine(
        <AssessmentTimer secondsLeft={10 * 60} onExpire={() => {}} />,
      );

      expect(screen.getByText("10:00")).toBeInTheDocument();
    });

    it("is not moved by the clock being corrected part way through", () => {
      renderWithMantine(
        <AssessmentTimer secondsLeft={10 * 60} onExpire={() => {}} />,
      );
      pass(60_000);
      expect(screen.getByText("09:00")).toBeInTheDocument();

      vi.setSystemTime(Date.now() + 3 * 60 * 1000);
      pass(1_000);

      expect(screen.getByText("08:59")).toBeInTheDocument();
    });
  });

  describe("a fresh figure from the server", () => {
    it("sets the countdown to it", () => {
      const { rerender } = renderWithMantine(
        <AssessmentTimer
          secondsLeft={10 * 60}
          receivedAt={performance.now()}
          onExpire={() => {}}
        />,
      );
      pass(60_000);
      expect(screen.getByText("09:00")).toBeInTheDocument();

      // The page had fallen seven seconds behind the server
      rerender(
        <AssessmentTimer
          secondsLeft={8 * 60 + 53}
          receivedAt={performance.now()}
          onExpire={() => {}}
        />,
      );

      expect(screen.getByText("08:53")).toBeInTheDocument();

      pass(1_000);
      expect(screen.getByText("08:52")).toBeInTheDocument();
    });

    it("starts again from the same figure when it arrives a second time", () => {
      const { rerender } = renderWithMantine(
        <AssessmentTimer
          secondsLeft={60}
          receivedAt={performance.now()}
          onExpire={() => {}}
        />,
      );
      pass(10_000);
      expect(screen.getByText("00:50")).toBeInTheDocument();

      rerender(
        <AssessmentTimer
          secondsLeft={60}
          receivedAt={performance.now()}
          onExpire={() => {}}
        />,
      );

      expect(screen.getByText("01:00")).toBeInTheDocument();
    });
  });

  describe("time running out", () => {
    it("is signalled once when the countdown reaches nought", () => {
      const handleExpire = vi.fn();
      renderWithMantine(
        <AssessmentTimer secondsLeft={2} onExpire={handleExpire} />,
      );

      pass(1_750);
      expect(handleExpire).not.toHaveBeenCalled();

      pass(250);
      expect(screen.getByText("Time up")).toBeInTheDocument();
      expect(handleExpire).toHaveBeenCalledTimes(1);

      pass(10_000);
      expect(handleExpire).toHaveBeenCalledTimes(1);
    });

    it("is signalled once for a timer that starts with no time left", () => {
      const handleExpire = vi.fn();
      renderWithMantine(
        <AssessmentTimer secondsLeft={0} onExpire={handleExpire} />,
      );

      pass(5_000);

      expect(handleExpire).toHaveBeenCalledTimes(1);
    });

    it("is not signalled again when the handler is a new function", () => {
      const first = vi.fn();
      const second = vi.fn();
      const { rerender } = renderWithMantine(
        <AssessmentTimer secondsLeft={0} onExpire={first} />,
      );

      rerender(<AssessmentTimer secondsLeft={0} onExpire={second} />);
      pass(1_000);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
    });

    it("is signalled again for a fresh figure that then runs out", () => {
      const handleExpire = vi.fn();
      const { rerender } = renderWithMantine(
        <AssessmentTimer
          secondsLeft={0}
          receivedAt={performance.now()}
          onExpire={handleExpire}
        />,
      );
      expect(handleExpire).toHaveBeenCalledTimes(1);

      rerender(
        <AssessmentTimer
          secondsLeft={1}
          receivedAt={performance.now()}
          onExpire={handleExpire}
        />,
      );
      pass(1_000);

      expect(handleExpire).toHaveBeenCalledTimes(2);
    });
  });

  describe("text colour on the badge fill", () => {
    /** The badge root carries the `c` colour as an inline style. */
    function badgeRoot(text: string): HTMLElement {
      const root = screen.getByText(text).closest(".mantine-Badge-root");
      if (!(root instanceof HTMLElement)) {
        throw new Error("badge root not found");
      }
      return root;
    }

    it("uses dark text on the yellow warning fill", () => {
      // Four minutes left: inside the five-minute warning window.
      renderWithMantine(
        <AssessmentTimer secondsLeft={4 * 60} onExpire={() => {}} />,
      );
      expect(badgeRoot("04:00").style.color).toBe("var(--status-text-dark)");
    });

    it("uses white text on the blue fill with time to spare", () => {
      renderWithMantine(
        <AssessmentTimer secondsLeft={75 * 60} onExpire={() => {}} />,
      );
      expect(badgeRoot("75:00").style.color).toBe("var(--mantine-color-white)");
    });
  });
});
