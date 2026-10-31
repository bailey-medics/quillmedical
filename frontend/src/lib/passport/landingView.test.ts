/**
 * Tests for which view the passport home page opens in.
 */

import { describe, expect, it } from "vitest";
import { LANDING_VIEWS, landingViewOf } from "./landingView";

describe("landingViewOf", () => {
  it("reads the holder's choice", () => {
    expect(landingViewOf({ landing_view: "by_record" })).toBe("by_record");
    expect(landingViewOf({ landing_view: "by_competency" })).toBe(
      "by_competency",
    );
  });

  it("opens By competency when an older response does not say", () => {
    expect(landingViewOf({})).toBe("by_competency");
  });
});

describe("LANDING_VIEWS", () => {
  it("lists By competency first, as the default", () => {
    expect(LANDING_VIEWS).toEqual(["by_competency", "by_record"]);
  });
});
