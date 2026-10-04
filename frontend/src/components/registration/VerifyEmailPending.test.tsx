import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import VerifyEmailPending from "./VerifyEmailPending";

const baseProps = {
  email: "user@example.com",
  resent: false,
  loading: false,
  onResend: () => {},
};

describe("VerifyEmailPending", () => {
  it("shows the heading, the address and a link back to login", () => {
    renderWithRouter(<VerifyEmailPending {...baseProps} />);

    expect(
      screen.getByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to login" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("calls onResend when the resend button is pressed", async () => {
    const user = userEvent.setup();
    const onResend = vi.fn();
    renderWithRouter(<VerifyEmailPending {...baseProps} onResend={onResend} />);

    await user.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );

    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it("replaces the button with a confirmation once resent", () => {
    renderWithRouter(<VerifyEmailPending {...baseProps} resent />);

    expect(screen.getByText("Verification email resent")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resend verification email" }),
    ).not.toBeInTheDocument();
  });

  it("offers no resend when the address is not known", () => {
    renderWithRouter(<VerifyEmailPending {...baseProps} email="" />);

    expect(screen.getByText(/your email address/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resend verification email" }),
    ).not.toBeInTheDocument();
  });
});
