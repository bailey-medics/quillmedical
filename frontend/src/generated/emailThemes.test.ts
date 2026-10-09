import { describe, expect, it } from "vitest";
import brand from "@/generated/brand.json";
import { EMAIL_THEME_NAMES } from "./emailThemes";

/**
 * `emailThemes.ts` is written from `shared/brand.yaml` and committed.
 * `brand.json` is made from the same file each time the tests start, so
 * comparing the two is what stops the committed one falling behind.
 */
describe("the generated list of email themes", () => {
  it("names every theme in the brand file, in its order", () => {
    expect([...EMAIL_THEME_NAMES]).toEqual(Object.keys(brand.email_themes));
  });
});
