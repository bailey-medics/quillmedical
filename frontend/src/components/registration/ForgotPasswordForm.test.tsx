import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import type { FormSubmitResult } from "@/components/form/Form";
import ForgotPasswordForm from "./ForgotPasswordForm";

vi.mock("@lib/connectivity", () => ({
  useConnectivity: () => ({ isOnline: true }),
}));

const successResult: FormSubmitResult = {
  state: "success",
  message: {
    title: "Check your inbox",
    description:
      "If an account with that email exists, we've sent a reset link.",
  },
};

const errorResult: FormSubmitResult = {
  state: "error",
  message: {
    title: "Something went wrong",
    description: "Please try again.",
  },
};

describe("ForgotPasswordForm", () => {
  it("renders all form fields", () => {
    renderWithRouter(
      <ForgotPasswordForm onSubmit={() => new Promise(() => {})} />,
    );

    expect(screen.getByText("Forgot password")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByTestId("submit-button")).toBeInTheDocument();
  });

  it("renders back to sign in link", () => {
    renderWithRouter(
      <ForgotPasswordForm onSubmit={() => new Promise(() => {})} />,
    );

    expect(screen.getByText("Back to sign in")).toBeInTheDocument();
  });

  it("calls onSubmit with email", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(successResult);

    renderWithRouter(<ForgotPasswordForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Email *"), "test@example.com");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("test@example.com");
    });
  });

  it("displays error message after failed submission", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ForgotPasswordForm onSubmit={async () => errorResult} />);

    await user.type(screen.getByLabelText("Email *"), "test@example.com");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
  });

  it("displays success message and hides form fields", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <ForgotPasswordForm onSubmit={async () => successResult} />,
    );

    await user.type(screen.getByLabelText("Email *"), "test@example.com");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "If an account with that email exists, we've sent a reset link.",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Email *")).not.toBeInTheDocument();
  });

  it("disables submit button while submitting", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <ForgotPasswordForm onSubmit={() => new Promise(() => {})} />,
    );

    await user.type(screen.getByLabelText("Email *"), "test@example.com");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("submit-button")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
  });
});
