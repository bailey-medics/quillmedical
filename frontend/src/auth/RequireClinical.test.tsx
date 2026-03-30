/**
 * RequireClinical Component Tests
 *
 * Tests for the clinical services route guard:
 * - Redirects to /teaching when clinical services are disabled
 * - Renders children when clinical services are enabled
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import RequireClinical from "./RequireClinical";
import * as authContext from "./AuthContext";

describe("RequireClinical", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when clinical services are enabled", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "doc",
          email: "doc@example.com",
          system_permissions: "staff",
          clinical_services_enabled: true,
        },
      },
      login: vi.fn(),
      logout: vi.fn(),
      reload: vi.fn(),
    });

    renderWithRouter(
      <RequireClinical>
        <div>Clinical Content</div>
      </RequireClinical>,
    );

    expect(screen.getByText("Clinical Content")).toBeInTheDocument();
  });

  it("redirects to /teaching when clinical services are disabled", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "student",
          email: "student@example.com",
          system_permissions: "staff",
          clinical_services_enabled: false,
        },
      },
      login: vi.fn(),
      logout: vi.fn(),
      reload: vi.fn(),
    });

    renderWithRouter(
      <RequireClinical>
        <div>Clinical Content</div>
      </RequireClinical>,
      { initialRoute: "/messages" },
    );

    expect(screen.queryByText("Clinical Content")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/teaching");
  });

  it("renders children when clinical_services_enabled is undefined (defaults to enabled)", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      state: {
        status: "authenticated",
        user: {
          id: "1",
          username: "doc",
          email: "doc@example.com",
          system_permissions: "staff",
        },
      },
      login: vi.fn(),
      logout: vi.fn(),
      reload: vi.fn(),
    });

    renderWithRouter(
      <RequireClinical>
        <div>Clinical Content</div>
      </RequireClinical>,
    );

    expect(screen.getByText("Clinical Content")).toBeInTheDocument();
  });
});
