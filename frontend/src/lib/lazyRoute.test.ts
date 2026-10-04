import { describe, expect, it, vi } from "vitest";
import { lazyFrom } from "./lazyRoute";

function UsersPage(): null {
  return null;
}

function SitesPage(): null {
  return null;
}

const chunk = { UsersPage, SitesPage, SOME_CONSTANT: 3 };

describe("lazyFrom", () => {
  it("resolves to the named page as the route's Component", async () => {
    const load = vi.fn().mockResolvedValue(chunk);

    await expect(lazyFrom<typeof chunk>(load, "UsersPage")()).resolves.toEqual({
      Component: UsersPage,
    });
    await expect(lazyFrom<typeof chunk>(load, "SitesPage")()).resolves.toEqual({
      Component: SitesPage,
    });
  });

  it("does not load the chunk until the route is asked for", async () => {
    const load = vi.fn().mockResolvedValue(chunk);

    const lazy = lazyFrom<typeof chunk>(load, "UsersPage");
    expect(load).not.toHaveBeenCalled();

    await lazy();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("lets a failed import reject, so the error boundary sees it", async () => {
    const failure = new Error("Failed to fetch dynamically imported module");
    const load = vi.fn().mockRejectedValue(failure);

    await expect(lazyFrom<typeof chunk>(load, "UsersPage")()).rejects.toBe(
      failure,
    );
  });

  it("renders nothing, without throwing, when the import resolves to undefined", async () => {
    // What Vite does once the preload recovery has called preventDefault()
    // on vite:preloadError and is reloading the page.
    const load = vi.fn().mockResolvedValue(undefined);

    const { Component } = await lazyFrom<typeof chunk>(load, "UsersPage")();

    expect((Component as () => unknown)()).toBeNull();
  });

  it("accepts only the chunk's component exports as a name", () => {
    const load = (): Promise<typeof chunk> => Promise.resolve(chunk);

    // @ts-expect-error not an export of the chunk
    lazyFrom(load, "UserPage");
    // @ts-expect-error an export, but not a component
    lazyFrom(load, "SOME_CONSTANT");

    expect(lazyFrom(load, "UsersPage")).toBeTypeOf("function");
  });
});
