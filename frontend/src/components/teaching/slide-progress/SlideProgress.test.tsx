import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import SlideProgress from "./SlideProgress";

describe("SlideProgress", () => {
  it("renders the current/total fraction", () => {
    renderWithMantine(<SlideProgress current={5} total={23} />);
    expect(screen.getByText("5/23")).toBeInTheDocument();
  });

  it("renders the progress bar", () => {
    renderWithMantine(<SlideProgress current={5} total={23} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows 100% progress at the last slide", () => {
    renderWithMantine(<SlideProgress current={23} total={23} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });

  it("shows correct progress at the first slide", () => {
    renderWithMantine(<SlideProgress current={1} total={23} />);
    const bar = screen.getByRole("progressbar");
    const value = Number(bar.getAttribute("aria-valuenow"));
    expect(value).toBeCloseTo(4.35, 0);
  });
});
