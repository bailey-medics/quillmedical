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
const colorectal = { id: "colorectal", name: "Colorectal" };

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

  it("reads a decline as not asked", () => {
    expect(standingOf(antiemeticsCompetency)).toBe("not_asked");
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

  it("makes a row for each scope that is signed off or requested", () => {
    const rows = frameworkRows(sact.id, [
      lungCompetency,
      { ...breastCompetency, status: "requested" },
    ]);
    const prescribing = rows.filter((row) => row.id === lungCompetency.id);

    expect(prescribing.map((row) => [row.scope?.name, row.standing])).toEqual([
      ["Lung", "signed_off"],
      ["Breast", "requested"],
    ]);
  });

  it("gives each scope's row that scope's own logbook count", () => {
    const rows = frameworkRows(sact.id, [
      lungCompetency,
      { ...breastCompetency, logbook_entries: 20 },
    ]);
    const counts = rows
      .filter((row) => row.id === lungCompetency.id)
      .map((row) => row.logbookEntries);

    expect(counts).toEqual([12, 20]);
  });

  it("gives no row to a scope with nothing asked", () => {
    const rows = frameworkRows(sact.id, [
      lungCompetency,
      { ...breastCompetency, status: "declined" },
      {
        ...breastCompetency,
        scope: colorectal,
        status: "requested",
        sign_off: null,
      },
    ]);
    const scopes = rows
      .filter((row) => row.id === lungCompetency.id)
      .map((row) => row.scope?.name);

    expect(scopes).toEqual(["Lung"]);
  });

  it("makes one not asked row when no scope has a sign-off", () => {
    const rows = frameworkRows(sact.id, [
      { ...lungCompetency, status: "declined" },
      { ...breastCompetency, status: "requested", sign_off: null },
    ]);
    const prescribing = rows.filter((row) => row.id === lungCompetency.id);

    expect(prescribing).toHaveLength(1);
    expect(prescribing[0]).toMatchObject({
      scope: null,
      standing: "not_asked",
    });
  });

  it("takes the largest logbook count rather than adding them up", () => {
    const rows = frameworkRows(sact.id, [
      { ...lungCompetency, status: "requested", sign_off: null },
      {
        ...breastCompetency,
        status: "requested",
        sign_off: null,
        logbook_entries: 20,
      },
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
