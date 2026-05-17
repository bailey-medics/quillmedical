import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import TeachingMainNav from "./TeachingMainNav";

// Mock useAuth — mirrors SideNav.test.tsx pattern
const mockLogout = vi.fn();
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { system_permissions: "admin" },
    },
    logout: mockLogout,
    login: vi.fn(),
    reload: vi.fn(),
  }),
}));

describe("TeachingMainNav", () => {
  it("renders Teaching link highlighted on /teaching", () => {
    renderWithRouter(<TeachingMainNav />, {
      initialRoute: "/teaching",
    });
    const link = screen.getByText("Teaching");
    expect(link).toBeTruthy();
    expect(link.closest("[data-active]")).toBeTruthy();
  });

  it("renders Settings and Logout links", () => {
    renderWithRouter(<TeachingMainNav />, {
      initialRoute: "/teaching",
    });
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Logout")).toBeTruthy();
  });

  it("renders Admin link for admin users", () => {
    renderWithRouter(<TeachingMainNav />, {
      initialRoute: "/teaching",
    });
    expect(screen.getByText("Admin")).toBeTruthy();
  });

  it("navigates to /settings when Settings is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<TeachingMainNav />, {
      initialRoute: "/teaching",
    });
    await user.click(screen.getByText("Settings"));
    expect(window.location.pathname).toBe("/settings");
  });

  it("navigates to /teaching when Teaching is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <TeachingMainNav
        moduleName="Test module"
        moduleHref="/teaching/test-id"
      />,
      { initialRoute: "/teaching/test-id" },
    );
    await user.click(screen.getByText("Teaching"));
    expect(window.location.pathname).toBe("/teaching");
  });

  it("calls logout when Logout is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<TeachingMainNav />, {
      initialRoute: "/teaching",
    });
    await user.click(screen.getByText("Logout"));
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it("shows module name as child link when provided", () => {
    renderWithRouter(
      <TeachingMainNav moduleName="Short name" moduleHref="/teaching/short" />,
      { initialRoute: "/teaching/short" },
    );
    expect(screen.getByText("Short name")).toBeTruthy();
  });

  it("truncates module name to 15 characters", () => {
    renderWithRouter(
      <TeachingMainNav
        moduleName="Colonoscopy optical diagnosis"
        moduleHref="/teaching/col"
      />,
      { initialRoute: "/teaching/col" },
    );
    expect(screen.getByText("Colonoscopy opt…")).toBeTruthy();
  });

  it("does not show child link when moduleName is omitted", () => {
    renderWithRouter(<TeachingMainNav />, {
      initialRoute: "/teaching",
    });
    expect(screen.queryByText("Colonoscopy opt…")).toBeNull();
  });
});
