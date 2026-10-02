/**
 * Tests for AdminSafetyDashboard page.
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";

const mockUseAuth = vi.fn();
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

import AdminSafetyDashboard from "./AdminSafetyDashboard";

function signIn(competencies: string[]) {
  mockUseAuth.mockReturnValue({
    state: {
      status: "authenticated",
      user: {
        id: "1",
        username: "safety.admin",
        email: "safety.admin@example.com",
        competencies,
      },
    },
  });
}

describe("AdminSafetyDashboard", () => {
  it("titles the page and links to the safety cases", () => {
    signIn([]);
    renderWithRouter(<AdminSafetyDashboard />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Safety" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Safety cases")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View safety cases" }),
    ).toHaveAttribute("href", "/safety");
  });

  it("offers People to a manage_safety holder", () => {
    signIn(["manage_safety"]);
    renderWithRouter(<AdminSafetyDashboard />);
    expect(screen.getByRole("link", { name: "View people" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
  });

  it("hides People from somebody without manage_safety", () => {
    signIn(["manage_users"]);
    renderWithRouter(<AdminSafetyDashboard />);
    expect(screen.queryByText("People")).not.toBeInTheDocument();
  });
});
