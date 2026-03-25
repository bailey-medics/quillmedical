import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { QuestionBankCard } from "./QuestionBankCard";

describe("QuestionBankCard", () => {
  it("renders title and description", () => {
    renderWithMantine(
      <QuestionBankCard
        title="Polyp diagnosis"
        description="Optical diagnosis assessment."
        onStart={() => {}}
      />,
    );

    expect(screen.getByText("Polyp diagnosis")).toBeInTheDocument();
    expect(
      screen.getByText("Optical diagnosis assessment."),
    ).toBeInTheDocument();
  });

  it("calls onStart when button clicked", async () => {
    const handleStart = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <QuestionBankCard
        title="Test"
        description="Desc"
        onStart={handleStart}
      />,
    );

    await user.click(screen.getByText("Start assessment"));
    expect(handleStart).toHaveBeenCalledOnce();
  });

  it("disables button when disabled", () => {
    renderWithMantine(
      <QuestionBankCard
        title="Test"
        description="Desc"
        onStart={() => {}}
        disabled
      />,
    );

    expect(
      screen.getByRole("button", { name: "Start assessment" }),
    ).toBeDisabled();
  });
});
