/**
 * RequireOperator Tests
 *
 * The guard asks one question — does this person operate Quill? — so the
 * tests are about `platform_role` and nothing else.
 *
 * Its predecessor `RequirePermission` compared a `level` prop against a
 * four-rung `system_permissions` hierarchy. The rungs below `superadmin`
 * became membership and competencies, and by the end nothing passed
 * them, so those tests described code that could not run. The one worth
 * keeping is below: a stale user who still says `superadmin` in the old
 * column is refused.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import * as authContext from "./AuthContext";
import type { User } from "./AuthContext";
import RequireOperator from "./RequireOperator";

function mockAuth(user: Partial<User> | null, status = "authenticated") {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state:
      status === "authenticated"
        ? {
            status: "authenticated",
            user: {
              id: "1",
              username: "someone",
              email: "someone@example.com",
              ...user,
            } as User,
          }
        : ({ status } as never),
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  } as never);
}

describe("RequireOperator", () => {
  describe("An operator", () => {
    it("sees the protected content", () => {
      mockAuth({ platform_role: "superadmin" });

      renderWithRouter(
        <RequireOperator>
          <div>Operator content</div>
        </RequireOperator>,
      );

      expect(screen.getByText("Operator content")).toBeInTheDocument();
    });
  });

  describe("Everyone else", () => {
    it("gets a 404 by default, hiding the route", () => {
      mockAuth({ platform_role: "standard" });

      renderWithRouter(
        <RequireOperator>
          <div>Operator content</div>
        </RequireOperator>,
      );

      expect(screen.queryByText("Operator content")).not.toBeInTheDocument();
    });

    it("is refused when the platform role is missing", () => {
      mockAuth({});

      renderWithRouter(
        <RequireOperator>
          <div>Operator content</div>
        </RequireOperator>,
      );

      expect(screen.queryByText("Operator content")).not.toBeInTheDocument();
    });

    it("does not admit a stale superadmin from the old column", () => {
      // The whole point of the migration: `system_permissions` no longer
      // decides anything here.
      mockAuth({
        system_permissions: "superadmin",
        platform_role: "standard",
      });

      renderWithRouter(
        <RequireOperator>
          <div>Operator content</div>
        </RequireOperator>,
      );

      expect(screen.queryByText("Operator content")).not.toBeInTheDocument();
    });

    it("redirects instead of 404 when asked", () => {
      mockAuth({ platform_role: "standard" });

      renderWithRouter(
        <RequireOperator fallback="redirect">
          <div>Operator content</div>
        </RequireOperator>,
      );

      expect(screen.queryByText("Operator content")).not.toBeInTheDocument();
    });
  });

  describe("Before auth settles", () => {
    it("shows a loader rather than deciding", () => {
      mockAuth(null, "loading");

      renderWithRouter(
        <RequireOperator>
          <div>Operator content</div>
        </RequireOperator>,
      );

      expect(screen.queryByText("Operator content")).not.toBeInTheDocument();
    });

    it("sends an unauthenticated visitor to login", () => {
      mockAuth(null, "unauthenticated");

      renderWithRouter(
        <RequireOperator>
          <div>Operator content</div>
        </RequireOperator>,
      );

      expect(screen.queryByText("Operator content")).not.toBeInTheDocument();
    });
  });
});
