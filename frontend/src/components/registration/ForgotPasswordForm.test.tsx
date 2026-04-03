import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import ForgotPasswordForm from "./ForgotPasswordForm";

describe("ForgotPasswordForm", () => {
  it("renders all form fields", () => {
    renderWithRouter(<ForgotPasswordForm onSubmit={vi.fn()} />);

    expect(screen.getByText("Forgot password")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toBeInTheDocument();
  });

  it("renders back to sign in link", () => {
    renderWithRouter(<ForgotPasswordForm onSubmit={vi.fn()} />);

    expect(screen.getByText("Back to sign in")).toBeInTheDocument();
  });

  it("calls onSubmit with email", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<ForgotPasswordForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Email *"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(onSubmit).toHaveBeenCalledWith("test@example.com");
  });

  it("displays error message", () => {
    renderWithRouter(
      <ForgotPasswordForm
        onSubmit={vi.fn()}
        error="Something went wrong. Please try again."
      />,
    );

    expect(
      screen.getByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
  });

  it("displays success message", () => {
    renderWithRouter(
      <ForgotPasswordForm
        onSubmit={vi.fn()}
        success="If an account with that email exists, we've sent a reset link."
      />,
    );

    expect(
      screen.getByText(
        "If an account with that email exists, we've sent a reset link.",
      ),
    ).toBeInTheDocument();
  });

  it("shows loading state when submitting", () => {
    renderWithRouter(<ForgotPasswordForm onSubmit={vi.fn()} submitting />);

    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toBeDisabled();
  });
});
