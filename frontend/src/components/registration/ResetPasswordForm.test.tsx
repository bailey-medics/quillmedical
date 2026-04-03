import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import ResetPasswordForm from "./ResetPasswordForm";

describe("ResetPasswordForm", () => {
  it("renders all form fields", () => {
    renderWithRouter(<ResetPasswordForm onSubmit={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Reset password" }),
    ).toBeInTheDocument();
    expect(screen.getByText("New password")).toBeInTheDocument();
    expect(screen.getByText("Confirm password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset password" }),
    ).toBeInTheDocument();
  });

  it("renders back to sign in link", () => {
    renderWithRouter(<ResetPasswordForm onSubmit={vi.fn()} />);

    expect(screen.getByText("Back to sign in")).toBeInTheDocument();
  });

  it("calls onSubmit with password when valid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<ResetPasswordForm onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText("New password *"),
      "NewSecurePass123!",
    );
    await user.type(
      screen.getByLabelText("Confirm password *"),
      "NewSecurePass123!",
    );
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(onSubmit).toHaveBeenCalledWith("NewSecurePass123!");
  });

  it("shows error when passwords do not match", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<ResetPasswordForm onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText("New password *"),
      "NewSecurePass123!",
    );
    await user.type(
      screen.getByLabelText("Confirm password *"),
      "DifferentPass123!",
    );
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows error when password is too short", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<ResetPasswordForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("New password *"), "short");
    await user.type(screen.getByLabelText("Confirm password *"), "short");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(
      screen.getByText("Password must be at least 8 characters"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("displays server error message", () => {
    renderWithRouter(
      <ResetPasswordForm
        onSubmit={vi.fn()}
        error="Invalid or expired reset link"
      />,
    );

    expect(
      screen.getByText("Invalid or expired reset link"),
    ).toBeInTheDocument();
  });

  it("shows loading state when submitting", () => {
    renderWithRouter(<ResetPasswordForm onSubmit={vi.fn()} submitting />);

    expect(
      screen.getByRole("button", { name: /reset password/i }),
    ).toBeDisabled();
  });
});
