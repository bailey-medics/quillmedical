import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import ModuleNav from "./ModuleNav";

const defaultProps = {
  moduleTitle: "Colorectal polyps",
  onLearning: () => {},
  onAssessment: () => {},
  onBack: () => {},
};

describe("ModuleNav", () => {
  it("renders the module title", () => {
    renderWithMantine(<ModuleNav {...defaultProps} />);
    expect(screen.getByText("Colorectal polyps")).toBeInTheDocument();
  });

  it("renders learning and assessment links", () => {
    renderWithMantine(<ModuleNav {...defaultProps} />);
    expect(screen.getByText("Learning materials")).toBeInTheDocument();
    expect(screen.getByText("Assessment")).toBeInTheDocument();
  });

  it("renders the back link", () => {
    renderWithMantine(<ModuleNav {...defaultProps} />);
    expect(screen.getByText("Back to main app")).toBeInTheDocument();
  });

  it("calls onLearning when learning link is clicked", async () => {
    const handleLearning = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <ModuleNav {...defaultProps} onLearning={handleLearning} />,
    );

    await user.click(screen.getByText("Learning materials"));
    expect(handleLearning).toHaveBeenCalledOnce();
  });

  it("calls onAssessment when assessment link is clicked", async () => {
    const handleAssessment = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <ModuleNav {...defaultProps} onAssessment={handleAssessment} />,
    );

    await user.click(screen.getByText("Assessment"));
    expect(handleAssessment).toHaveBeenCalledOnce();
  });

  it("calls onBack when back link is clicked", async () => {
    const handleBack = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(<ModuleNav {...defaultProps} onBack={handleBack} />);

    await user.click(screen.getByText("Back to main app"));
    expect(handleBack).toHaveBeenCalledOnce();
  });
});
