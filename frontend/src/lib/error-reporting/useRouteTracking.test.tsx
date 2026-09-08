import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import RouteTracking from "./RouteTracking";
import { getBreadcrumbs, resetBreadcrumbsForTests } from "./breadcrumbs";
import { getCurrentRoute, resetCurrentRouteForTests } from "./currentRoute";
import { useRouteTracking } from "./useRouteTracking";

function Tracked(): null {
  useRouteTracking();
  return null;
}

/** Renders the hook at a real matched route, as the application does. */
function renderAt(path: string, routePath: string): void {
  const router = createMemoryRouter(
    [{ path: routePath, element: <Tracked /> }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  resetCurrentRouteForTests();
});

describe("tracking the route the router matched", () => {
  it("records the pattern, not the path the user is on", () => {
    renderAt("/patients/abc123", "/patients/:id");

    expect(getCurrentRoute()).toBe("/patients/:id");
  });

  it("never records the identifier from the address", () => {
    renderAt("/patients/943-476-5919", "/patients/:id");

    expect(getCurrentRoute()).not.toContain("943");
  });

  it("records a static route unchanged", () => {
    renderAt("/admin/users", "/admin/users");

    expect(getCurrentRoute()).toBe("/admin/users");
  });
});

describe("a route that crashes while rendering", () => {
  it("has already recorded the route before the crash is reported", () => {
    // The defect this closes, found in a production report: the route was set
    // in a useEffect, and passive effects run after paint while
    // componentDidCatch runs in the commit phase. So a report from a boundary
    // went out with no route at all — missing on precisely the failure the
    // boundary exists for, and present on everything else.
    function Exploding(): never {
      throw new Error("crash during render");
    }

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createMemoryRouter(
      [
        {
          path: "/patients/:id",
          element: (
            <>
              <Tracked />
              <Exploding />
            </>
          ),
        },
      ],
      { initialEntries: ["/patients/abc123"] },
    );

    try {
      render(<RouterProvider router={router} />);
    } catch {
      // React rethrows in test environments with no boundary above; the route
      // is what matters here, and it is set during render either way.
    }

    expect(getCurrentRoute()).toBe("/patients/:id");
    consoleSpy.mockRestore();
  });

  it("records the route change as a breadcrumb during render too", () => {
    resetBreadcrumbsForTests();

    renderAt("/patients/abc123", "/patients/:id");

    const patterns = getBreadcrumbs().map((c) =>
      c.type === "route" ? c.pattern : "",
    );
    expect(patterns).toContain("/patients/:id");
  });

  it("does not record the same route twice on a re-render", () => {
    resetBreadcrumbsForTests();

    renderAt("/patients/abc123", "/patients/:id");
    renderAt("/patients/abc123", "/patients/:id");

    const routeCrumbs = getBreadcrumbs().filter((c) => c.type === "route");
    expect(routeCrumbs).toHaveLength(1);
  });
});

describe("mounted above the route trees rather than inside one", () => {
  /** The production shape: one pathless wrapper, several sibling trees. */
  function renderWrapped(path: string, routePath: string): void {
    const router = createMemoryRouter(
      [
        {
          element: <RouteTracking />,
          children: [{ path: routePath, element: null }],
        },
      ],
      { initialEntries: [path] },
    );
    render(<RouterProvider router={router} />);
  }

  it("still rebuilds the pattern from a param matched further down", () => {
    // Worth asserting rather than assuming: the wrapper is above the route
    // that captures the identifier, and `useParams` reads the deepest match
    // rather than the caller's own, so the pattern still comes back with the
    // value replaced. Measured before relying on it — reasoning about which
    // match a hook reads got this wrong once already.
    renderWrapped("/patients/943-476-5919", "/patients/:id");

    expect(getCurrentRoute()).toBe("/patients/:id");
  });

  it("records a tree that has no layout of its own", () => {
    // The shape of the defect this closes. `/teaching` is a separate
    // top-level route that never renders RootLayout, so while tracking was
    // called from RootLayout the whole teaching application reported errors
    // with no route on them.
    renderWrapped(
      "/teaching/learn/m4/slide/2",
      "/teaching/learn/:moduleId/slide/:slideIndex",
    );

    expect(getCurrentRoute()).toBe(
      "/teaching/learn/:moduleId/slide/:slideIndex",
    );
  });

  it("records a sign-in page, which sits outside the authenticated tree", () => {
    renderWrapped("/login", "/login");

    expect(getCurrentRoute()).toBe("/login");
  });
});
