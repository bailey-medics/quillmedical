import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import type { FormSubmitResult } from "@/components/form/Form";
import LoginForm from "./LoginForm";

const successResult: FormSubmitResult = {
  state: "success",
  message: { title: "Signed in" },
};

const errorResult: FormSubmitResult = {
  state: "error",
  message: { title: "Invalid credentials" },
};

describe("LoginForm", () => {
  it("renders all form fields", () => {
    renderWithRouter(<LoginForm onSubmit={() => new Promise(() => {})} />);

    expect(screen.getByText("Sign in to Quill")).toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByTestId("submit-button")).toBeInTheDocument();
  });

  it("renders register link by default", () => {
    renderWithRouter(<LoginForm onSubmit={() => new Promise(() => {})} />);

    expect(
      screen.getByText("Don't have an account? Register"),
    ).toBeInTheDocument();
  });

  it("hides register link when registerPath is null", () => {
    renderWithRouter(
      <LoginForm onSubmit={() => new Promise(() => {})} registerPath={null} />,
    );

    expect(
      screen.queryByText("Don't have an account? Register"),
    ).not.toBeInTheDocument();
  });

  it("calls onSubmit with username and password", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(successResult);

    renderWithRouter(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Password *"), "pass123");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        username: "testuser",
        password: "pass123",
        totp: undefined,
      });
    });
  });

  it("shows TOTP input when requireTotp is true", () => {
    renderWithRouter(
      <LoginForm onSubmit={() => new Promise(() => {})} requireTotp />,
    );

    expect(screen.getByText("Authenticator code")).toBeInTheDocument();
  });

  it("does not show TOTP input by default", () => {
    renderWithRouter(<LoginForm onSubmit={() => new Promise(() => {})} />);

    expect(screen.queryByText("Authenticator code")).not.toBeInTheDocument();
  });

  it("includes totp in onSubmit when requireTotp is true", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(successResult);

    renderWithRouter(<LoginForm onSubmit={onSubmit} requireTotp />);

    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Password *"), "pass123");
    await user.type(screen.getByLabelText("Authenticator code *"), "123456");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        username: "testuser",
        password: "pass123",
        totp: "123456",
      });
    });
  });

  it("displays error message after failed submission", async () => {
    const user = userEvent.setup();

    renderWithRouter(<LoginForm onSubmit={async () => errorResult} />);

    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Password *"), "pass123");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("disables submit button while submitting", async () => {
    const user = userEvent.setup();

    renderWithRouter(<LoginForm onSubmit={() => new Promise(() => {})} />);

    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Password *"), "pass123");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("submit-button")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
  });
});
