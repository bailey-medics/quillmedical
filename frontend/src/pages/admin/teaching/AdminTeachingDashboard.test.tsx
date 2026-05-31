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
  it("shows Modules card when user has manage_teaching_content competency", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "admin",
          email: "admin@example.com",
          competencies: ["manage_teaching_content"],
        },
      },
    });
    renderWithRouter(<AdminTeachingDashboard />);
    expect(screen.getByText("Modules")).toBeInTheDocument();
    expect(screen.getByText("All delegates")).toBeInTheDocument();
  });

  it("hides Modules card when user lacks manage_teaching_content competency", () => {
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
