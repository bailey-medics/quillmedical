import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { AssessmentIntro } from "./AssessmentIntro";

describe("AssessmentIntro", () => {
  it("renders the title", () => {
    renderWithMantine(
      <AssessmentIntro
        title="Before you begin"
        body="Instructions here."
        onBegin={() => {}}
      />,
    );

    expect(screen.getByText("Before you begin")).toBeInTheDocument();
  });

  it("renders the begin button", () => {
    renderWithMantine(
      <AssessmentIntro
        title="Ready"
        body="Read carefully."
        onBegin={() => {}}
      />,
    );

    expect(screen.getByText("Begin")).toBeInTheDocument();
  });

  it("calls onBegin when button clicked", async () => {
    const handleBegin = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <AssessmentIntro title="Ready" body="Go." onBegin={handleBegin} />,
    );

    await user.click(screen.getByText("Begin"));
    expect(handleBegin).toHaveBeenCalledOnce();
  });

  it("disables button when disabled prop is true", () => {
    renderWithMantine(
      <AssessmentIntro
        title="Ready"
        body="Wait."
        onBegin={() => {}}
        disabled
      />,
    );

    expect(screen.getByRole("button", { name: "Begin" })).toBeDisabled();
  });

  it("shows loading spinner when loading prop is true", () => {
    renderWithMantine(
      <AssessmentIntro
        title="Ready"
        body="Starting..."
        onBegin={() => {}}
        loading
      />,
    );

    const button = screen.getByRole("button", { name: "Begin" });
    expect(button).toBeDisabled();
  });
});
