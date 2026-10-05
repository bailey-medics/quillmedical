/**
 * VerifyEmailPage Tests
 *
 * Tests the page reached from the link in a verification email:
 * - Loading, success and failure states
 * - A missing token fails without calling the backend
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import * as apiModule from "@/lib/api";
import VerifyEmailPage from "./VerifyEmailPage";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

const post = apiModule.api.post as ReturnType<typeof vi.fn>;

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the loading state while the token is checked", () => {
    post.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<VerifyEmailPage />, {
      initialRoute: "/verify-email?token=abc",
    });

    expect(
      screen.getByRole("heading", { name: "Verify your email" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Verifying your email…")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/auth/verify-email", { token: "abc" });
  });

  it("shows success and a link to login once verified", async () => {
    post.mockResolvedValue({});
    renderWithRouter(<VerifyEmailPage />, {
      initialRoute: "/verify-email?token=abc",
    });

    await waitFor(() => {
      expect(screen.getByText("Email verified")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Verify your email" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to login" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("shows failure and the way to a new link when the token is refused", async () => {
    post.mockRejectedValue(new Error("expired"));
    renderWithRouter(<VerifyEmailPage />, {
      initialRoute: "/verify-email?token=abc",
    });

    await waitFor(() => {
      expect(screen.getByText("Verification failed")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: "Sign in for a new link" }),
    ).toHaveAttribute("href", "/login");
  });

  it("fails without calling the backend when there is no token", () => {
    renderWithRouter(<VerifyEmailPage />, { initialRoute: "/verify-email" });

    expect(screen.getByText("Verification failed")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
