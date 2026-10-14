/**
 * GuestOnly Component Tests
 *
 * The guard around the sign-in and registration pages: what it shows
 * while it is still finding out who is signed in, to a guest, and to
 * somebody already signed in.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import * as authContext from "./AuthContext";
import GuestOnly from "./GuestOnly";

type AuthState = ReturnType<typeof authContext.useAuth>["state"];

function mockAuth(state: AuthState) {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state,
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

function renderGuestOnly() {
  return renderWithMantine(
    <GuestOnly>
      <div>Sign in form</div>
    </GuestOnly>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GuestOnly", () => {
  // This was a blank page, and the longest blank in opening Quill.
  it("shows the spinner while it finds out who is signed in", () => {
    mockAuth({ status: "loading", user: null });
    renderGuestOnly();

    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByText("Sign in form")).not.toBeInTheDocument();
  });

  it("shows the page to a guest", () => {
    mockAuth({ status: "unauthenticated", user: null });
    renderGuestOnly();

    expect(screen.getByText("Sign in form")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("sends somebody already signed in to the home page", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    mockAuth({ status: "authenticated", user: {} } as AuthState);
    renderGuestOnly();

    expect(assign).toHaveBeenCalledWith("/");
    expect(screen.queryByText("Sign in form")).not.toBeInTheDocument();
  });
});
