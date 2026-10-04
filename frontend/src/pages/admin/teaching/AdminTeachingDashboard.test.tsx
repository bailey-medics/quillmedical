/**
 * Tests for AdminTeachingDashboard page.
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

import AdminTeachingDashboard from "./AdminTeachingDashboard";

describe("AdminTeachingDashboard", () => {
  it("shows Modules card to an operator who manages teaching", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "admin",
          email: "admin@example.com",
          platform_role: "superadmin",
          competencies: ["manage_teaching"],
        },
      },
    });
    renderWithRouter(<AdminTeachingDashboard />);
    expect(screen.getByText("Modules")).toBeInTheDocument();
    expect(screen.getByText("All delegates")).toBeInTheDocument();
  });

  it("hides Modules card from a teaching admin who is not an operator", () => {
    // The modules pages are operator-only, so the card led to a 404.
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "coordinator",
          email: "coordinator@example.com",
          competencies: ["manage_teaching"],
        },
      },
    });
    renderWithRouter(<AdminTeachingDashboard />);
    expect(screen.queryByText("Modules")).not.toBeInTheDocument();
    expect(screen.getByText("All delegates")).toBeInTheDocument();
  });

  it("hides Modules card from an operator who does not manage teaching", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "operator",
          email: "operator@example.com",
          platform_role: "superadmin",
          competencies: [],
        },
      },
    });
    renderWithRouter(<AdminTeachingDashboard />);
    expect(screen.queryByText("Modules")).not.toBeInTheDocument();
  });

  it("hides Modules card when user lacks manage_teaching competency", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "staff",
          email: "staff@example.com",
          competencies: [],
        },
      },
    });
    renderWithRouter(<AdminTeachingDashboard />);
    expect(screen.queryByText("Modules")).not.toBeInTheDocument();
    expect(screen.getByText("All delegates")).toBeInTheDocument();
  });

  it("hides Modules card when competencies is undefined", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "staff",
          email: "staff@example.com",
        },
      },
    });
    renderWithRouter(<AdminTeachingDashboard />);
    expect(screen.queryByText("Modules")).not.toBeInTheDocument();
    expect(screen.getByText("All delegates")).toBeInTheDocument();
  });
});
