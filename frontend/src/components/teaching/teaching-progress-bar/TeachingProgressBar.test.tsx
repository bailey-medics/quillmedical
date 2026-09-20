import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import { TeachingProgressBar } from "./TeachingProgressBar";

describe("TeachingProgressBar", () => {
  it("renders current and total", () => {
    renderWithMantine(<TeachingProgressBar current={5} total={120} />);
    expect(screen.getByText("5 of 120")).toBeInTheDocument();
  });

  it("shows progress bar", () => {
    renderWithMantine(<TeachingProgressBar current={60} total={120} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("fills the bar from the count by default", () => {
    renderWithMantine(<TeachingProgressBar current={60} total={120} />);

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });

  it("carries the classes that make it fill its container", () => {
    // Without these the row shrinks to its widest neighbour, so in a
    // narrow table cell the same bar was full width beside a long file
    // name and half width beside a short line of text.
    //
    // Only the classes are checked: jsdom does not lay anything out,
    // so an assertion about actual width here would pass whatever the
    // stylesheet said. The widths themselves are a Storybook check.
    renderWithMantine(<TeachingProgressBar current={1} total={4} />);

    // The bar's own element, then the row holding it. Walked from the
    // bar rather than from the container, whose first child is the
    // style tag Mantine injects.
    const bar = screen.getByRole("progressbar");
    expect(bar.parentElement?.className).toMatch(/bar/);
    expect(bar.parentElement?.parentElement?.className).toMatch(/root/);
  });

  it("hides the count when asked", () => {
    // The video card's stages are internal machinery, not something a
    // person works through, so "0 of 4" only invites the question of
    // what the four are.
    renderWithMantine(
      <TeachingProgressBar current={0} total={4} showCount={false} />,
    );

    expect(screen.queryByText("0 of 4")).toBeNull();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("fills part of a stage without moving the count", () => {
    // A bar that only moves in whole stages looks stopped during a
    // long one, which is what a large video upload is.
    renderWithMantine(
      <TeachingProgressBar current={0} total={4} fill={0.42} />,
    );

    expect(screen.getByText("0 of 4")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "10.5",
    );
  });

  it("never overflows the track", () => {
    // The caller's arithmetic is not this component's to trust; a
    // percentage over 100 would otherwise run past the end.
    renderWithMantine(<TeachingProgressBar current={0} total={4} fill={9} />);

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("never draws a negative bar", () => {
    renderWithMantine(<TeachingProgressBar current={0} total={4} fill={-3} />);

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });
});
