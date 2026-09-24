import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import TeachingMainNav from "./TeachingMainNav";

// Mock useAuth — mirrors SideNav.test.tsx pattern.
//
// `enabled_features` matters now that this sidebar shares its entries
// with the main one: the shared list gates Teaching on the feature
// flag, as the main sidebar always did. Without it the Teaching link
// is correctly absent, which is what these tests found.
const mockLogout = vi.fn();
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: {
        // `manage_teaching_content` is deliberate: it is the competency
        // that earns the Assessments and Manage items sub-links on the
        // main sidebar, so without it the test below that they are
        // absent here would pass whether the code was right or not.
        competencies: [
          "manage_users",
          "manage_teaching_content",
          "assess_clinician_passport",
          "passport_write",
        ],
        enabled_features: ["teaching", "passport"],
      },
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

  it("keeps the other features reachable from a teaching page", () => {
    // The bug this sidebar had: it carried its own hardcoded list, so
    // opening a teaching page made the Passport link disappear. A
    // holder mid-session could not get back to their own record
    // without going somewhere else first. Both sidebars now render the
    // same shared list, so a feature cannot be in one and not the
    // other.
    renderWithRouter(<TeachingMainNav />, {
      initialRoute: "/teaching",
    });

    expect(screen.getByText("Passport")).toBeTruthy();
  });

  it("does not borrow the main sidebar's teaching sub-pages", () => {
    // Sharing the feature list once went too far: the Assessments and
    // Manage items links belong to the main sidebar, and putting them
    // in the shared entry gave them to teaching pages, which had never
    // shown them. What hangs under Teaching depends on where you are.
    renderWithRouter(<TeachingMainNav />, {
      initialRoute: "/teaching",
    });

    expect(screen.queryByText("Assessments")).toBeNull();
    expect(screen.queryByText("Manage items")).toBeNull();
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

  it("offers Feedback directly above Logout", () => {
    renderWithRouter(<TeachingMainNav />, {
      initialRoute: "/teaching",
    });
    const feedback = screen.getByText("Feedback");
    expect(feedback.closest("a, button")?.nextElementSibling?.textContent).toBe(
      "Logout",
    );
  });
});
