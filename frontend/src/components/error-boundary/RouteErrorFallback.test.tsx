import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { renderWithMantine } from "@test/test-utils";
import { reportError } from "@lib/error-reporting/report";
import ErrorBoundary from "./ErrorBoundary";
import RouteErrorFallback from "./RouteErrorFallback";

vi.mock("@lib/error-reporting/report", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { post: vi.fn().mockResolvedValue({ id: 1 }) },
}));

const chunkGone = new Error("Failed to fetch dynamically imported module");

/** A tree shaped like main.tsx: a root route, a layout with a boundary. */
function renderRoutes(withErrorElement: boolean) {
  const router = createMemoryRouter(
    [
      {
        ...(withErrorElement ? { errorElement: <RouteErrorFallback /> } : {}),
        children: [
          {
            element: (
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            ),
            children: [
              { path: "/", element: <p>Dashboard</p> },
              { path: "/passport", lazy: () => Promise.reject(chunkGone) },
              { path: "/admin", lazy: async () => ({ element: <p>Admin</p> }) },
            ],
          },
        ],
      },
    ],
    { initialEntries: ["/"] },
  );
  renderWithMantine(<RouterProvider router={router} />);
  return router;
}

describe("RouteErrorFallback", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(reportError).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the app's fallback when a lazy chunk cannot be fetched", async () => {
    const router = renderRoutes(true);

    await router.navigate("/passport");

    expect(
      await screen.findByTestId("error-boundary-fallback"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reload page" }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Unexpected Application Error");
  });

  // The reason this component exists. A boundary inside a layout's element
  // does not catch a failed `lazy`: the router does, and falls back to its
  // developer screen. If this ever stops being true the errorElement is
  // redundant, and this test says so.
  it("is needed: without it the router shows its developer screen", async () => {
    const router = renderRoutes(false);

    await router.navigate("/passport");

    expect(
      await screen.findByText(/Unexpected Application Error/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary-fallback")).toBeNull();
  });

  it("reports the error as a boundary would", async () => {
    const router = renderRoutes(true);

    await router.navigate("/passport");
    await screen.findByTestId("error-boundary-fallback");

    // Waited for, not asserted straight away: the component reports from
    // an effect, which runs after the fallback is on screen. Checking at
    // once passed or failed on how the two happened to be scheduled, and
    // failed in CI on 9 October 2026.
    await waitFor(() => {
      expect(reportError).toHaveBeenCalledWith(chunkGone, "boundary");
    });
  });

  it("stays out of the way when the chunk loads", async () => {
    const router = renderRoutes(true);

    await router.navigate("/admin");

    expect(await screen.findByText("Admin")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary-fallback")).toBeNull();
    expect(reportError).not.toHaveBeenCalled();
  });
});
