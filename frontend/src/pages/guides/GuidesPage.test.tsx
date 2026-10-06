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

function guide(
  slug: string,
  audience: Guide["audience"],
  feature?: Guide["feature"],
): Guide {
  return {
    slug,
    title: `Title of ${slug}`,
    summary: `Summary of ${slug}`,
    audience,
    public: false,
    feature,
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
    show([guide("one", "everyone")]);

    renderWithRouter(<Page />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Guides" }),
    ).toBeInTheDocument();
  });

  it("shows each guide with its summary and a link to it", () => {
    show([guide("one", "everyone")]);

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
      guide("joining", "everyone"),
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

  describe("with guides for more than one feature", () => {
    function showTwoFeatures(): void {
      show([
        guide("joining", "everyone", "teaching"),
        guide("adding", "admin", "teaching"),
        guide("logbook", "everyone", "passport"),
      ]);
    }

    it("heads each feature, in the registry's order", () => {
      showTwoFeatures();

      renderWithRouter(<Page />);

      const headings = screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
      expect(headings).toEqual([
        "Teaching",
        "Title of adding",
        "Title of joining",
        "Passport",
        "Title of logbook",
      ]);
    });

    it("labels the audiences within a feature that has more than one", () => {
      showTwoFeatures();

      renderWithRouter(<Page />);

      expect(screen.getByText("For admins")).toBeInTheDocument();
      expect(screen.getByText("For everyone")).toBeInTheDocument();
      // A label, not a heading: the feature is the heading here.
      expect(
        screen.queryByRole("heading", { name: "For admins" }),
      ).not.toBeInTheDocument();
    });

    it("puts guides that belong to no feature first, under Quill", () => {
      show([
        guide("joining", "everyone", "teaching"),
        guide("signing-in", "everyone"),
      ]);

      renderWithRouter(<Page />);

      const headings = screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
      expect(headings.slice(0, 2)).toEqual(["Quill", "Title of signing-in"]);
    });
  });

  it("leaves the feature's name out when there is one feature", () => {
    show([guide("joining", "everyone", "teaching")]);

    renderWithRouter(<Page />);

    expect(
      screen.queryByRole("heading", { name: "Teaching" }),
    ).not.toBeInTheDocument();
  });
});
