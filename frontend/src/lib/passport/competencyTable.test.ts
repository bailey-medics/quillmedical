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
import {
  TEST_FRAMEWORK_CATALOGUE,
  TEST_FRAMEWORK_DEFINITIONS,
} from "@test/frameworkCatalogue";
import { FrameworkCatalogue } from "./catalogue";
import type { CompetencyState } from "./types";

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
    const rows = frameworkRows(TEST_FRAMEWORK_CATALOGUE, radiotherapy.id, []);

    expect(rows).toHaveLength(8);
    expect(rows[0].name).toBe("Insert a cannula");
    expect(rows.every((row) => row.standing === "not_asked")).toBe(true);
  });

  it("leaves out competencies from other frameworks", () => {
    const rows = frameworkRows(
      TEST_FRAMEWORK_CATALOGUE,
      radiotherapy.id,
      oncologyCompetencies,
    );

    expect(rows.map((row) => row.id)).not.toContain(lungCompetency.id);
  });

  it("makes a row for each scope that is signed off or requested", () => {
    const rows = frameworkRows(TEST_FRAMEWORK_CATALOGUE, sact.id, [
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
    const rows = frameworkRows(TEST_FRAMEWORK_CATALOGUE, sact.id, [
      lungCompetency,
      { ...breastCompetency, logbook_entries: 20 },
    ]);
    const counts = rows
      .filter((row) => row.id === lungCompetency.id)
      .map((row) => row.logbookEntries);

    expect(counts).toEqual([12, 20]);
  });

  it("gives no row to a scope with nothing asked", () => {
    const rows = frameworkRows(TEST_FRAMEWORK_CATALOGUE, sact.id, [
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
    const rows = frameworkRows(TEST_FRAMEWORK_CATALOGUE, sact.id, [
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
    const rows = frameworkRows(TEST_FRAMEWORK_CATALOGUE, sact.id, [
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

describe("what a sign-off recorded, where the framework moved on", () => {
  const row = (catalogue: FrameworkCatalogue, state: CompetencyState) =>
    frameworkRows(catalogue, radiotherapy.id, [state]).find(
      (each) => each.id === state.id,
    );

  it("shows a matching name once", () => {
    expect(
      row(TEST_FRAMEWORK_CATALOGUE, referPalliativeCompetency)?.signedAs,
    ).toBeNull();
  });

  it("keeps the words a sign-off recorded where they differ", () => {
    const reworded = {
      ...referPalliativeCompetency,
      name: "Refer for palliative radiotherapy",
    };

    expect(row(TEST_FRAMEWORK_CATALOGUE, reworded)?.signedAs).toEqual({
      name: "Refer for palliative radiotherapy",
      level: null,
      version: null,
    });
  });

  it("names the version a sign-off was given under, where older", () => {
    const newer = new FrameworkCatalogue(
      TEST_FRAMEWORK_DEFINITIONS.map((framework) =>
        framework.id === radiotherapy.id
          ? { ...framework, version: 2 }
          : framework,
      ),
    );
    const signedAtOne = { ...referPalliativeCompetency, framework_version: 1 };

    expect(row(newer, signedAtOne)?.signedAs).toEqual({
      name: null,
      level: null,
      version: 1,
    });
  });

  it("says nothing of a competency not signed off", () => {
    const reworded = {
      ...referRadicalCompetency,
      name: "Different words",
    };

    expect(row(TEST_FRAMEWORK_CATALOGUE, reworded)?.signedAs).toBeNull();
  });
});

describe("a level reworded since it was signed", () => {
  it("keeps the level's words the sign-off recorded", () => {
    const [first] =
      TEST_FRAMEWORK_CATALOGUE.competency(lungCompetency.id)?.levels ?? [];
    const signed = {
      ...lungCompetency,
      status: "signed_off" as const,
      sign_off: "2026-07-02-lung",
      level: { id: first.id, name: "Old words for the level" },
    };

    const found = frameworkRows(TEST_FRAMEWORK_CATALOGUE, sact.id, [
      signed,
    ]).find((each) => each.id === signed.id);

    expect(found?.signedAs?.level).toBe("Old words for the level");
  });
});

describe("a competency that has left its framework", () => {
  const retiring = new FrameworkCatalogue(
    TEST_FRAMEWORK_DEFINITIONS.map((framework) =>
      framework.id === radiotherapy.id
        ? {
            ...framework,
            version: 2,
            competencies: framework.competencies.map((competency) =>
              competency.id === referPalliativeCompetency.id
                ? {
                    ...competency,
                    retired_on: "2026-11-01",
                    retired_in_version: 2,
                  }
                : competency,
            ),
          }
        : framework,
    ),
  );

  it("stays in the table, marked, while something is recorded against it", () => {
    const rows = frameworkRows(retiring, radiotherapy.id, [
      referPalliativeCompetency,
    ]);
    const kept = rows.find((row) => row.id === referPalliativeCompetency.id);

    expect(kept?.retired).toBe(true);
    expect(kept?.retiredInVersion).toBe(2);
    expect(rows.at(-1)?.id).toBe(referPalliativeCompetency.id);
  });

  it("is left out where nothing is recorded against it", () => {
    const rows = frameworkRows(retiring, radiotherapy.id, []);

    expect(rows.map((row) => row.id)).not.toContain(
      referPalliativeCompetency.id,
    );
  });

  it("leaves the current competencies unmarked", () => {
    const rows = frameworkRows(retiring, radiotherapy.id, []);

    expect(rows.every((row) => !row.retired)).toBe(true);
  });
});
