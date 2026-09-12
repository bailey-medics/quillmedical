/**
 * RequireCompetency Component Tests
 *
 * The guard asks a CBAC competency rather than a permission rank, so
 * these cover: holding it, lacking it, the two fallbacks, and the
 * loading and unauthenticated states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import RequireCompetency from "./RequireCompetency";
import * as authContext from "./AuthContext";
import type { User } from "./AuthContext";

const holder: User = {
  id: "1",
  username: "admin.user",
  email: "admin@example.com",
  system_permissions: "staff",
  platform_role: "member",
  competencies: ["manage_users"],
};

// Deliberately an `admin` in the old column holding no competencies:
// the rank must not be what opens the door.
const rankWithoutCompetency: User = {
  id: "2",
  username: "ranked.user",
  email: "ranked@example.com",
  system_permissions: "admin",
  platform_role: "member",
  competencies: [],
};

function mockAuth(user: User | null, status = "authenticated") {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state: { status, user } as never,
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

describe("RequireCompetency", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when the user holds the competency", () => {
    mockAuth(holder);

    renderWithRouter(
      <RequireCompetency competency="manage_users">
        <div>Admin content</div>
      </RequireCompetency>,
    );

    expect(screen.getByText("Admin content")).toBeInTheDocument();
  });

  it("shows 404 when the user lacks it, whatever their rank", () => {
    mockAuth(rankWithoutCompetency);

    renderWithRouter(
      <RequireCompetency competency="manage_users">
        <div>Admin content</div>
      </RequireCompetency>,
    );

    expect(screen.getByText("404 — Page not found")).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });

  it("redirects home when asked to, instead of 404", () => {
    mockAuth(rankWithoutCompetency);

    renderWithRouter(
      <RequireCompetency competency="manage_users" fallback="redirect">
        <div>Admin content</div>
      </RequireCompetency>,
      { initialRoute: "/admin" },
    );

    expect(window.location.pathname).toBe("/");
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });

  it("shows a loader while auth is resolving", () => {
    mockAuth(null, "loading");

    renderWithRouter(
      <RequireCompetency competency="manage_users">
        <div>Admin content</div>
      </RequireCompetency>,
    );

    expect(document.querySelector(".mantine-Loader-root")).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });

  it("redirects to login when unauthenticated", () => {
    mockAuth(null, "unauthenticated");

    renderWithRouter(
      <RequireCompetency competency="manage_users">
        <div>Admin content</div>
      </RequireCompetency>,
      { initialRoute: "/admin" },
    );

    expect(window.location.pathname).toBe("/login");
  });
});
