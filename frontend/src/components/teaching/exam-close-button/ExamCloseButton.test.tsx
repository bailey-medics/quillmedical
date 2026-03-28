import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import ExamCloseButton from "./ExamCloseButton";

describe("ExamCloseButton", () => {
  it("renders the end exam badge", () => {
    renderWithMantine(<ExamCloseButton onConfirm={vi.fn()} />);
    expect(screen.getByText("End exam")).toBeInTheDocument();
  });

  it("opens confirmation modal on click", async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExamCloseButton onConfirm={vi.fn()} />);

    await user.click(screen.getByText("End exam"));

    expect(screen.getByText(/unanswered questions/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue exam" }),
    ).toBeInTheDocument();
  });

  it("calls onConfirm when End exam is confirmed", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<ExamCloseButton onConfirm={onConfirm} />);

    await user.click(screen.getByText("End exam"));
    // The modal also has an "End exam" button
    const buttons = screen.getAllByRole("button", { name: "End exam" });
    await user.click(buttons[buttons.length - 1]);

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("closes modal when Continue exam is clicked", async () => {
    const user = userEvent.setup();
    renderWithMantine(<ExamCloseButton onConfirm={vi.fn()} />);

    await user.click(screen.getByText("End exam"));
    await user.click(screen.getByRole("button", { name: "Continue exam" }));

    expect(screen.queryByText(/unanswered questions/i)).not.toBeInTheDocument();
  });
});
