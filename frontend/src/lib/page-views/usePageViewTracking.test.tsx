import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { setOptedOut } from "./optOut";
import { resetPageViewStateForTests } from "./pageViews";
import { usePageViewTracking } from "./usePageViewTracking";

function Tracked(): null {
  usePageViewTracking();
  return null;
}

/** Renders the hook at a route, optionally one marked clinical. */
function renderAt(
  path: string,
  routePath: string,
  handle?: Record<string, unknown>,
): void {
  const router = createMemoryRouter(
    [{ path: routePath, element: <Tracked />, ...(handle ? { handle } : {}) }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

let beacon: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetPageViewStateForTests();
  beacon = vi.fn().mockReturnValue(true);
  vi.stubGlobal("navigator", { sendBeacon: beacon, userAgent: "test" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
  } catch {
    /* nothing stored */
  }
});

describe("counting an ordinary page", () => {
  it("sends the matched pattern, not the path", async () => {
    renderAt("/organisations/42", "/organisations/:id");

    await waitFor(() => expect(beacon).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      await (beacon.mock.calls[0]?.[1] as Blob).text(),
    ) as Record<string, unknown>;
    expect(body["page"]).toBe("/organisations/:id");
  });

  it("never sends the identifier from the address", async () => {
    renderAt("/organisations/943-476-5919", "/organisations/:id");

    await waitFor(() => expect(beacon).toHaveBeenCalled());
    const body = await (beacon.mock.calls[0]?.[1] as Blob).text();
    expect(body).not.toContain("943");
  });
});

describe("clinical routes are not counted", () => {
  it("sends nothing on a route declaring handle.clinical", async () => {
    // The guard that matters. Everything under /patients/:id is patient data,
    // and how often a particular screen of a record is opened is not a thing
    // this feature has any business knowing.
    renderAt("/patients/abc123", "/patients/:id", { clinical: true });

    await new Promise((r) => setTimeout(r, 20));
    expect(beacon).not.toHaveBeenCalled();
  });

  it("sends nothing on a nested clinical route either", async () => {
    renderAt("/patients/abc123/letters", "/patients/:id/letters", {
      clinical: true,
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(beacon).not.toHaveBeenCalled();
  });

  it("still counts a route that is not marked", async () => {
    renderAt("/settings", "/settings");

    await waitFor(() => expect(beacon).toHaveBeenCalledTimes(1));
  });
});

describe("the opt-out is honoured before sending", () => {
  it("sends nothing once the user has opted out", async () => {
    setOptedOut(true);

    renderAt("/settings", "/settings");

    await new Promise((r) => setTimeout(r, 20));
    expect(beacon).not.toHaveBeenCalled();
  });

  it("resumes when the user opts back in", async () => {
    setOptedOut(true);
    setOptedOut(false);

    renderAt("/settings", "/settings");

    await waitFor(() => expect(beacon).toHaveBeenCalledTimes(1));
  });
});
