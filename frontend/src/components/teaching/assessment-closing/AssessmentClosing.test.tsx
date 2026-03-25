import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { AssessmentClosing } from "./AssessmentClosing";

describe("AssessmentClosing", () => {
  it("renders the title", () => {
    renderWithMantine(
      <AssessmentClosing
        title="Assessment complete"
        body="Well done."
        onViewResults={() => {}}
      />,
    );

    expect(screen.getByText("Assessment complete")).toBeInTheDocument();
  });

  it("renders the view results button", () => {
    renderWithMantine(
      <AssessmentClosing
        title="Done"
        body="Finished."
        onViewResults={() => {}}
      />,
    );

    expect(screen.getByText("View results")).toBeInTheDocument();
  });

  it("calls onViewResults when button clicked", async () => {
    const handleViewResults = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <AssessmentClosing
        title="Done"
        body="OK."
        onViewResults={handleViewResults}
      />,
    );

    await user.click(screen.getByText("View results"));
    expect(handleViewResults).toHaveBeenCalledOnce();
  });

  it("disables button when disabled", () => {
    renderWithMantine(
      <AssessmentClosing
        title="Done"
        body="Wait."
        onViewResults={() => {}}
        disabled
      />,
    );

    expect(screen.getByRole("button", { name: "View results" })).toBeDisabled();
  });
});
