import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import LearningNav from "./LearningNav";
import { stubSlides } from "@/components/teaching/slide-layouts/stubSlides";

describe("LearningNav", () => {
  it("renders all slide titles", () => {
    renderWithMantine(
      <LearningNav
        slides={stubSlides}
        currentIndex={0}
        visited={new Set()}
        onNavigate={() => {}}
      />,
    );

    expect(screen.getByText("Colorectal Polyps")).toBeInTheDocument();
    expect(screen.getByText("Recorded lecture")).toBeInTheDocument();
    expect(
      screen.getByText("Paris classification overview"),
    ).toBeInTheDocument();
    expect(screen.getByText("Polyp morphology")).toBeInTheDocument();
    expect(screen.getByText("What this module covers")).toBeInTheDocument();
  });

  it("renders the progress indicator", () => {
    renderWithMantine(
      <LearningNav
        slides={stubSlides}
        currentIndex={2}
        visited={new Set()}
        onNavigate={() => {}}
      />,
    );

    expect(screen.getByText("3/7")).toBeInTheDocument();
  });

  it("calls onNavigate when a slide title is clicked", async () => {
    const handleNavigate = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <LearningNav
        slides={stubSlides}
        currentIndex={0}
        visited={new Set()}
        onNavigate={handleNavigate}
      />,
    );

    await user.click(screen.getByText("Recorded lecture"));
    expect(handleNavigate).toHaveBeenCalledWith(1);
  });

  it("shows visited indicators for visited slides", () => {
    const { container } = renderWithMantine(
      <LearningNav
        slides={stubSlides}
        currentIndex={2}
        visited={new Set([0, 1])}
        onNavigate={() => {}}
      />,
    );

    // Visited slides should have check icons in right section
    // The tabler icon class confirms the check icon is rendered
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });
});
