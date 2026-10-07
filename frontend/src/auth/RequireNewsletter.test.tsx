/**
 * RequireNewsletter tests
 *
 * The guard lets through whoever `mayUseNewsletter` does, and shows
 * everybody else a 404 so the section is not given away.
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import * as authContext from "./AuthContext";
import type { User } from "./AuthContext";
import RequireNewsletter from "./RequireNewsletter";

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

function show() {
  renderWithRouter(
    <RequireNewsletter>
      <div>Newsletter content</div>
    </RequireNewsletter>,
  );
}

describe("RequireNewsletter", () => {
  it("lets an operator in", () => {
    mockAuth({ platform_role: "superadmin" });
    show();

    expect(screen.getByText("Newsletter content")).toBeInTheDocument();
  });

  it("shows anybody else a 404", () => {
    mockAuth({ platform_role: "standard" });
    show();

    expect(screen.queryByText("Newsletter content")).not.toBeInTheDocument();
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });

  it("refuses an administrator of a place who is not an operator", () => {
    mockAuth({ competencies: ["manage_users"] } as Partial<User>);
    show();

    expect(screen.queryByText("Newsletter content")).not.toBeInTheDocument();
  });

  it("shows neither the content nor a 404 while auth is loading", () => {
    mockAuth(null, "loading");
    show();

    expect(screen.queryByText("Newsletter content")).not.toBeInTheDocument();
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
  });

  it("refuses somebody who is signed out", () => {
    mockAuth(null, "unauthenticated");
    show();

    expect(screen.queryByText("Newsletter content")).not.toBeInTheDocument();
  });
});
