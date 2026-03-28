import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import LoginForm from "./LoginForm";

describe("LoginForm", () => {
  it("renders all form fields", () => {
    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.getByText("Sign in to Quill")).toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders register link by default", () => {
    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    expect(
      screen.getByText("Don't have an account? Register"),
    ).toBeInTheDocument();
  });

  it("hides register link when registerPath is null", () => {
    renderWithRouter(<LoginForm onSubmit={vi.fn()} registerPath={null} />);

    expect(
      screen.queryByText("Don't have an account? Register"),
    ).not.toBeInTheDocument();
  });

  it("calls onSubmit with username and password", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Password *"), "pass123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSubmit).toHaveBeenCalledWith({
      username: "testuser",
      password: "pass123",
      totp: undefined,
    });
  });

  it("shows TOTP input when requireTotp is true", () => {
    renderWithRouter(<LoginForm onSubmit={vi.fn()} requireTotp />);

    expect(screen.getByText("Authenticator code")).toBeInTheDocument();
  });

  it("does not show TOTP input by default", () => {
    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.queryByText("Authenticator code")).not.toBeInTheDocument();
  });

  it("includes totp in onSubmit when requireTotp is true", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<LoginForm onSubmit={onSubmit} requireTotp />);

    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Password *"), "pass123");
    await user.type(screen.getByLabelText("Authenticator code *"), "123456");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSubmit).toHaveBeenCalledWith({
      username: "testuser",
      password: "pass123",
      totp: "123456",
    });
  });

  it("displays error message", () => {
    renderWithRouter(
      <LoginForm onSubmit={vi.fn()} error="Invalid credentials" />,
    );

    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });

  it("shows loading state when submitting", () => {
    renderWithRouter(<LoginForm onSubmit={vi.fn()} submitting />);

    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});
