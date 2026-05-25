/**
 * RequireAuth Component Tests
 *
 * Tests for the authentication route guard:
 * - Shows loading spinner while auth is being checked
 * - Renders children when authenticated
 * - Redirects to /login when unauthenticated (session expiry)
 * - Preserves intended destination in location state on session expiry
 * - Does NOT preserve destination after explicit logout (PHI safety)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { theme, cssVariablesResolver } from "@/theme";
import RequireAuth from "./RequireAuth";
import * as authContext from "./AuthContext";

// eslint-disable-next-line no-restricted-imports
import { MantineProvider } from "@mantine/core";

/**
 * Helper that renders RequireAuth inside a data router with a /login route
 * that captures location state via a callback. This lets us verify redirect
 * behaviour including the `from` state passed to Navigate.
 */
function renderWithLoginCapture(
  authState: ReturnType<typeof authContext.useAuth>["state"],
  initialRoute: string,
) {
  const onState = vi.fn();

  function LoginCapture() {
    const location = useLocation();
    onState(location.state);
    return <div>Login Page</div>;
  }

  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state: authState,
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });

  const router = createMemoryRouter(
    [
      {
        path: "/*",
        element: (
          <RequireAuth>
            <div>Protected Content</div>
          </RequireAuth>
        ),
      },
      {
        path: "/login",
        element: <LoginCapture />,
      },
    ],
    { initialEntries: [initialRoute] },
  );

  render(
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      env="test"
    >
      <RouterProvider router={router} />
    </MantineProvider>,
  );

  return { onState };
}

describe("RequireAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading spinner while auth state is loading", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      state: { status: "loading", user: null },
      login: vi.fn(),
      logout: vi.fn(),
      reload: vi.fn(),
    });

    renderWithRouter(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>,
    );

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(document.querySelector(".mantine-Loader-root")).toBeInTheDocument();
  });

  it("renders children when authenticated", () => {
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
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>,
    );

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects to /login when unauthenticated (session expiry)", () => {
    renderWithLoginCapture(
      { status: "unauthenticated", user: null, loggedOut: false },
      "/dashboard",
    );

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("preserves intended destination in location state on session expiry", () => {
    const { onState } = renderWithLoginCapture(
      { status: "unauthenticated", user: null, loggedOut: false },
      "/patients/123",
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(onState).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.objectContaining({ pathname: "/patients/123" }),
      }),
    );
  });

  it("does NOT preserve destination after explicit logout (PHI safety)", () => {
    const { onState } = renderWithLoginCapture(
      { status: "unauthenticated", user: null, loggedOut: true },
      "/patients/sensitive-data",
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    // State must be null — no `from` path leaked to next user
    expect(onState).toHaveBeenCalledWith(null);
  });
});
