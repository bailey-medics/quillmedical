/**
 * GuidesPage tests
 *
 * The guides the reader is shown, grouped by who each is for.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import type { Guide } from "@/guides/registry";
import * as guideTier from "@lib/guides/useGuideTier";
import { Component as Page } from "./GuidesPage";

function guide(slug: string, audience: Guide["audience"]): Guide {
  return {
    slug,
    title: `Title of ${slug}`,
    summary: `Summary of ${slug}`,
    audience,
    public: false,
  };
}

function show(guides: Guide[]): void {
  vi.spyOn(guideTier, "useVisibleGuides").mockReturnValue(guides);
}

describe("GuidesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("titles the page", () => {
    show([guide("one", "delegate")]);

    renderWithRouter(<Page />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Guides" }),
    ).toBeInTheDocument();
  });

  it("shows each guide with its summary and a link to it", () => {
    show([guide("one", "delegate")]);

    renderWithRouter(<Page />);

    expect(screen.getByText("Title of one")).toBeInTheDocument();
    expect(screen.getByText("Summary of one")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read guide/ })).toHaveAttribute(
      "href",
      "/guides/one",
    );
  });

  it("leaves out the group heading when there is one group", () => {
    show([guide("one", "admin"), guide("two", "admin")]);

    renderWithRouter(<Page />);

    expect(
      screen.queryByRole("heading", { name: "For admins" }),
    ).not.toBeInTheDocument();
  });

  it("groups by audience, the highest first", () => {
    show([
      guide("joining", "delegate"),
      guide("adding", "admin"),
      guide("operating", "superadmin"),
    ]);

    renderWithRouter(<Page />);

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "For Quill operators",
      "Title of operating",
      "For admins",
      "Title of adding",
      "For everyone",
      "Title of joining",
    ]);
  });

  it("says so when there is nothing to read", () => {
    show([]);

    renderWithRouter(<Page />);

    expect(
      screen.getByText("There are no guides for you yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Read guide/ })).toBeNull();
  });
});
