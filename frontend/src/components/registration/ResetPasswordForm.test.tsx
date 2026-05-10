import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import type { FormSubmitResult } from "@/components/form/Form";
import ResetPasswordForm from "./ResetPasswordForm";

const successResult: FormSubmitResult = {
  state: "success",
  message: { title: "Password reset successfully" },
};

const errorResult: FormSubmitResult = {
  state: "error",
  message: { title: "Invalid or expired reset link" },
};

describe("ResetPasswordForm", () => {
  it("renders all form fields", () => {
    renderWithRouter(
      <ResetPasswordForm onSubmit={() => new Promise(() => {})} />,
    );

    expect(
      screen.getByRole("heading", { name: "Reset password" }),
    ).toBeInTheDocument();
    expect(screen.getByText("New password")).toBeInTheDocument();
    expect(screen.getByText("Confirm password")).toBeInTheDocument();
    expect(screen.getByTestId("submit-button")).toBeInTheDocument();
  });

  it("renders back to sign in link", () => {
    renderWithRouter(
      <ResetPasswordForm onSubmit={() => new Promise(() => {})} />,
    );

    expect(screen.getByText("Back to sign in")).toBeInTheDocument();
  });

  it("calls onSubmit with password when valid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(successResult);

    renderWithRouter(<ResetPasswordForm onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText("New password *"),
      "NewSecurePass123!",
    );
    await user.type(
      screen.getByLabelText("Confirm password *"),
      "NewSecurePass123!",
    );
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("NewSecurePass123!");
    });
  });

  it("disables submit when passwords do not match", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(successResult);

    renderWithRouter(<ResetPasswordForm onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText("New password *"),
      "NewSecurePass123!",
    );
    await user.type(
      screen.getByLabelText("Confirm password *"),
      "DifferentPass123!",
    );

    expect(screen.getByTestId("submit-button")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables submit when password is too short", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(successResult);

    renderWithRouter(<ResetPasswordForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("New password *"), "short");
    await user.type(screen.getByLabelText("Confirm password *"), "short");

    expect(screen.getByTestId("submit-button")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("displays server error message after failed submission", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordForm onSubmit={async () => errorResult} />);

    await user.type(
      screen.getByLabelText("New password *"),
      "NewSecurePass123!",
    );
    await user.type(
      screen.getByLabelText("Confirm password *"),
      "NewSecurePass123!",
    );
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(
        screen.getByText("Invalid or expired reset link"),
      ).toBeInTheDocument();
    });
  });

  it("disables submit button while submitting", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <ResetPasswordForm onSubmit={() => new Promise(() => {})} />,
    );

    await user.type(
      screen.getByLabelText("New password *"),
      "NewSecurePass123!",
    );
    await user.type(
      screen.getByLabelText("Confirm password *"),
      "NewSecurePass123!",
    );
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("submit-button")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
  });
});
