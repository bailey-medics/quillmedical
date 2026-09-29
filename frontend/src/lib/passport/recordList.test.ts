/**
 * Record list tests: every kind flattened into one list, newest first.
 */

import { describe, expect, it } from "vitest";
import {
  certificates,
  cpdEntries,
  logbook,
  reflections,
  signOffs,
} from "@/components/passport/fixtures";
import { collectRecords, type RecordSources } from "./recordList";

function sources(overrides: Partial<RecordSources> = {}): RecordSources {
  return {
    signOffs,
    logbook: { competencies: [logbook], count: logbook.count },
    cpd: cpdEntries,
    certificates,
    reflections,
    competencyName: (id) =>
      id === "perform_bronchoscopy" ? "Perform bronchoscopy" : id,
    ...overrides,
  };
}

describe("collectRecords", () => {
  it("lists one row per record of every kind", () => {
    const records = collectRecords(sources());

    expect(records).toHaveLength(
      signOffs.length +
        logbook.entries.length +
        cpdEntries.length +
        certificates.length +
        reflections.length,
    );
  });

  it("puts the newest first, by each record's own date", () => {
    const dates = collectRecords(sources()).map((record) => record.on);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates[0]).toBe("2026-06-03");
  });

  it("links each kind to its own page", () => {
    const byKind = new Map(
      collectRecords(sources()).map((record) => [record.kind, record.href]),
    );

    expect(byKind.get("sign_off")).toMatch(/^\/passport\/sign-offs\//);
    expect(byKind.get("logbook")).toMatch(
      /^\/passport\/logbook\/perform_bronchoscopy\/2026-03-21-/,
    );
    expect(byKind.get("cpd")).toMatch(/^\/passport\/cpd\/20\d\d\//);
    expect(byKind.get("certificate")).toMatch(/^\/passport\/certificates\//);
    expect(byKind.get("reflection")).toMatch(/^\/passport\/reflections\//);
  });

  it("names a logbook entry by its competency", () => {
    const entry = collectRecords(sources()).find((r) => r.kind === "logbook");
    expect(entry?.title).toBe("Perform bronchoscopy");
  });

  it("gives a status to sign-offs alone", () => {
    for (const record of collectRecords(sources())) {
      expect(record.status !== null).toBe(record.kind === "sign_off");
    }
  });

  it("lists a procedure counting towards two competencies once", () => {
    const entry = logbook.entries[0];
    const records = collectRecords(
      sources({
        logbook: {
          competencies: [
            logbook,
            {
              competency: "perform_pleural_aspiration",
              count: 1,
              entries: [entry],
            },
          ],
          count: logbook.count + 1,
        },
      }),
    );

    expect(
      records.filter((record) => record.href.endsWith(entry.filename)),
    ).toHaveLength(1);
  });
});
