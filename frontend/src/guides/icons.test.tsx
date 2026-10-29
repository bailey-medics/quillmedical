/**
 * Every icon a guide names is one the guide page can show.
 *
 * A guide names an icon as `:icon-user-plus:`. One that is not registered
 * is left out of the page without a word, so a misspelt or retired name
 * would quietly drop the icon from its step. This catches it instead.
 */

import { describe, expect, it } from "vitest";
import { CONTENT_SLUGS, guideBody } from "./content";
import { GUIDE_ICONS, guideIconName, iconNamesIn } from "./icons";

describe("guideIconName", () => {
  it.each([
    ["UserPlus", "user-plus"],
    ["AlertCircleFilled", "alert-circle-filled"],
    ["EPassport", "e-passport"],
    ["BadgeCc", "badge-cc"],
    ["Book", "book"],
  ])("writes %s as %s", (catalogueName, guideName) => {
    expect(guideIconName(catalogueName)).toBe(guideName);
  });
});

describe("GUIDE_ICONS", () => {
  it("holds the icon the add buttons use", () => {
    expect(GUIDE_ICONS["user-plus"]).toBeDefined();
  });
});

describe("iconNamesIn", () => {
  it("finds every icon a source names, in order", () => {
    expect(iconNamesIn("Press :icon-user-plus:, then :icon-check:.")).toEqual([
      "user-plus",
      "check",
    ]);
  });

  it("finds icons drawn as buttons too", () => {
    expect(iconNamesIn("Press :button-pencil:, then :icon-check:.")).toEqual([
      "pencil",
      "check",
    ]);
  });

  it("finds none in a source that names none", () => {
    expect(iconNamesIn("Press **Save**.")).toEqual([]);
  });
});

describe.each(CONTENT_SLUGS)("the %s guide", (slug) => {
  it("names only icons the guide page can show", () => {
    const unknown = iconNamesIn(guideBody(slug) ?? "").filter(
      (name) => !(name in GUIDE_ICONS),
    );

    expect(unknown).toEqual([]);
  });
});
