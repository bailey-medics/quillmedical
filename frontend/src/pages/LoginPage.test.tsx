/**
 * LoginPage tests
 *
 * What the page says when signing in is refused: at the two-factor
 * step, and by the rate limit.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import type { useAuth } from "@/auth/AuthContext";
import LoginPage from "./LoginPage";

type Login = ReturnType<typeof useAuth>["login"];

const login = vi.fn<Login>();

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ login }),
}));

vi.mock("@lib/connectivity", () => ({
  useConnectivity: () => ({ isOnline: true }),
}));

/** An error as `api.ts` throws one, carrying the backend's code. */
function refusal(message: string, errorCode: string) {
  return Object.assign(new Error(message), { error_code: errorCode });
}

async function signIn() {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText(/Username/), "testuser");
  await user.type(screen.getByLabelText(/^Password/), "password1");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("LoginPage", () => {
  beforeEach(() => {
    login.mockReset();
  });

  it("asks for the authenticator code when two-factor is required", async () => {
    login.mockRejectedValue(
      refusal("Two-factor required", "two_factor_required"),
    );
    renderWithRouter(<LoginPage />);

    await signIn();

    expect(
      await screen.findByText("Enter the 6-digit authenticator code"),
    ).toBeInTheDocument();
  });

  it("says how long to wait after too many wrong codes", async () => {
    login.mockRejectedValue(
      refusal(
        "Too many wrong two-factor codes. Try again in 15 minutes.",
        "totp_locked",
      ),
    );
    renderWithRouter(<LoginPage />);

    await signIn();

    expect(
      await screen.findByText(
        "Too many wrong two-factor codes. Try again in 15 minutes.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Enter the 6-digit authenticator code"),
    ).not.toBeInTheDocument();
  });

  it("says to wait a minute when the rate limit refuses a sign-in", async () => {
    // The limit's answer has no message of its own, so the page used to
    // show the browser's status text, or "HTTP 429" over HTTP/2.
    login.mockRejectedValue(
      Object.assign(new Error("HTTP 429"), { status: 429 }),
    );
    renderWithRouter(<LoginPage />);

    await signIn();

    expect(
      await screen.findByText(
        "Too many sign-in attempts. Please wait a minute, then try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("HTTP 429")).not.toBeInTheDocument();
  });
});
