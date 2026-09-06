import { beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
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
