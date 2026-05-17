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
        onNavigate={() => {}}
        onExit={() => {}}
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
        onNavigate={() => {}}
        onExit={() => {}}
      />,
    );

    expect(screen.getByText("3 of 7")).toBeInTheDocument();
  });

  it("calls onNavigate when a slide title is clicked", async () => {
    const handleNavigate = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <LearningNav
        slides={stubSlides}
        currentIndex={0}
        onNavigate={handleNavigate}
        onExit={() => {}}
      />,
    );

    await user.click(screen.getByText("Recorded lecture"));
    expect(handleNavigate).toHaveBeenCalledWith(1);
  });

  it("renders the exit link and calls onExit when clicked", async () => {
    const handleExit = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <LearningNav
        slides={stubSlides}
        currentIndex={0}
        onNavigate={() => {}}
        onExit={handleExit}
      />,
    );

    const exitLink = screen.getByText("Exit");
    expect(exitLink).toBeInTheDocument();
    await user.click(exitLink);
    expect(handleExit).toHaveBeenCalledOnce();
  });
});
