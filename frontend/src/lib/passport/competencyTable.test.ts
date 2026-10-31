/**
 * Tests for the rows of a framework's competency table.
 */

import { describe, expect, it } from "vitest";
import {
  antiemeticsCompetency,
  breastCompetency,
  lungCompetency,
  oncologyCompetencies,
  oncologyFrameworks,
  prescribePalliativeCompetency,
  referPalliativeCompetency,
  referRadicalCompetency,
} from "@/components/passport/fixtures";
import { frameworkRows, logbookLabel, standingOf } from "./competencyTable";

const [radiotherapy, sact] = oncologyFrameworks;

describe("standingOf", () => {
  it("reads a signed-off latest sign-off as signed off", () => {
    expect(standingOf(referPalliativeCompetency)).toBe("signed_off");
  });

  it("reads a request with a sign-off behind it as waiting", () => {
    expect(standingOf(prescribePalliativeCompetency)).toBe("requested");
  });

  it("reads evidence with no sign-off as not asked", () => {
    // The index reports this as `requested` with no `sign_off`.
    expect(standingOf(referRadicalCompetency)).toBe("not_asked");
  });

  it("reads a decline as not asked unless asked to show it", () => {
    expect(standingOf(antiemeticsCompetency)).toBe("not_asked");
    expect(standingOf(antiemeticsCompetency, true)).toBe("declined");
  });

  it("reads a superseded sign-off as not asked", () => {
    expect(
      standingOf({ ...referPalliativeCompetency, status: "superseded" }),
    ).toBe("not_asked");
  });
});

describe("frameworkRows", () => {
  it("lists every item in the framework, in the file's order", () => {
    const rows = frameworkRows(radiotherapy.id, []);

    expect(rows).toHaveLength(7);
    expect(rows[0].name).toBe(
      "Refer patients for palliative radiotherapy unsupervised",
    );
    expect(rows.every((row) => row.standing === "not_asked")).toBe(true);
  });

  it("leaves out competencies from other frameworks", () => {
    const rows = frameworkRows(radiotherapy.id, oncologyCompetencies);

    expect(rows.map((row) => row.id)).not.toContain(lungCompetency.id);
  });

  it("makes one row of a scoped competency, at its strongest scope", () => {
    const rows = frameworkRows(sact.id, [
      { ...lungCompetency, status: "declined" },
      breastCompetency,
    ]);
    const prescribing = rows.filter((row) => row.id === lungCompetency.id);

    expect(prescribing).toHaveLength(1);
    expect(prescribing[0].standing).toBe("signed_off");
  });

  it("makes a row for each scope when asked", () => {
    const rows = frameworkRows(sact.id, [lungCompetency, breastCompetency], {
      rowPerScope: true,
    });
    const scopes = rows
      .filter((row) => row.id === lungCompetency.id)
      .map((row) => row.scope?.name);

    expect(scopes).toEqual(["Lung", "Breast"]);
  });

  it("takes the largest logbook count rather than adding them up", () => {
    const rows = frameworkRows(sact.id, [
      lungCompetency,
      { ...breastCompetency, logbook_entries: 20 },
    ]);
    const prescribing = rows.find((row) => row.id === lungCompetency.id);

    expect(prescribing?.logbookEntries).toBe(20);
  });
});

describe("logbookLabel", () => {
  it("counts entries, and shows a dash for none", () => {
    expect(logbookLabel(0)).toBe("-");
    expect(logbookLabel(1)).toBe("1 entry");
    expect(logbookLabel(12)).toBe("12 entries");
  });
});
