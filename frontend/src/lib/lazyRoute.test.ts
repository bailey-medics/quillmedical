import { createElement } from "react";
import type { ReactElement } from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import { lazyFrom } from "./lazyRoute";

function UsersPage(): null {
  return null;
}

function SitesPage(): null {
  return null;
}

function FeaturesPage({ parentPath }: { parentPath: string }): ReactElement {
  return createElement("p", null, `features of ${parentPath}`);
}

const chunk = { UsersPage, SitesPage, FeaturesPage, SOME_CONSTANT: 3 };

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

  it("renders the page inside whatever render wraps round it", async () => {
    const load = vi.fn().mockResolvedValue(chunk);

    const { Component } = await lazyFrom<typeof chunk, "FeaturesPage">(
      load,
      "FeaturesPage",
      (Page) =>
        createElement(
          "section",
          { "aria-label": "guard" },
          createElement(Page, { parentPath: "sites" }),
        ),
    )();
    renderWithMantine(createElement(Component));

    expect(screen.getByLabelText("guard")).toHaveTextContent(
      "features of sites",
    );
  });

  it("renders nothing when the import resolves to undefined, render or not", async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn();

    const { Component } = await lazyFrom<typeof chunk, "FeaturesPage">(
      load,
      "FeaturesPage",
      render,
    )();

    expect((Component as () => unknown)()).toBeNull();
    expect(render).not.toHaveBeenCalled();
  });

  it("accepts only the chunk's component exports as a name", () => {
    const load = (): Promise<typeof chunk> => Promise.resolve(chunk);

    // @ts-expect-error not an export of the chunk
    lazyFrom(load, "UserPage");
    // @ts-expect-error an export, but not a component
    lazyFrom(load, "SOME_CONSTANT");
    // @ts-expect-error needs a prop, so it must be given a render
    lazyFrom(load, "FeaturesPage");

    expect(lazyFrom(load, "UsersPage")).toBeTypeOf("function");
  });
});
