import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import VerifyEmail from "./VerifyEmail";

describe("VerifyEmail", () => {
  it("shows the heading in every state", () => {
    for (const status of ["loading", "success", "error"] as const) {
      const { unmount } = renderWithRouter(<VerifyEmail status={status} />);
      expect(
        screen.getByRole("heading", { name: "Verify your email" }),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("shows only the waiting message while loading", () => {
    renderWithRouter(<VerifyEmail status="loading" />);

    expect(screen.getByText("Verifying your email…")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the result and a link to login on success", () => {
    renderWithRouter(<VerifyEmail status="success" />);

    expect(screen.getByText("Email verified")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to login" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByText("Verification failed")).not.toBeInTheDocument();
  });

  it("shows the failure and a resend link on error", () => {
    renderWithRouter(<VerifyEmail status="error" />);

    expect(screen.getByText("Verification failed")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Resend verification email" }),
    ).toHaveAttribute("href", "/verify-email-pending");
    expect(screen.queryByText("Email verified")).not.toBeInTheDocument();
  });
});
