/**
 * The dark-mode accessibility pass reads the a11y addon's report through
 * `readA11yReport`. A render with no report, or where axe failed, was
 * never checked, so it must not read as a clean pass.
 */

import { describe, it, expect } from "vitest";
import { readA11yReport } from "../../.storybook/a11y-report";

const violation = {
  id: "color-contrast",
  help: "Elements must meet minimum colour contrast",
  nodes: [{ target: ["button", ".label"] }],
};

describe("readA11yReport", () => {
  it("reads a clean scan as checked, with no violations", () => {
    const reading = readA11yReport([
      { type: "a11y", result: { error: false, violations: [] } },
    ]);

    expect(reading).toEqual({ kind: "checked", violations: [] });
  });

  it("reads each violation with its targets", () => {
    const reading = readA11yReport([
      { type: "a11y", result: { error: false, violations: [violation] } },
    ]);

    expect(reading).toEqual({
      kind: "checked",
      violations: [
        {
          id: "color-contrast",
          help: "Elements must meet minimum colour contrast",
          targets: ["button .label"],
        },
      ],
    });
  });

  it("reads no reporters at all as not checked", () => {
    expect(readA11yReport(undefined)).toEqual({ kind: "no-report" });
  });

  it("reads reporters without an a11y one as not checked", () => {
    expect(readA11yReport([{ type: "other", result: {} }])).toEqual({
      kind: "no-report",
    });
  });

  it("reads an a11y report with no result as not checked", () => {
    expect(readA11yReport([{ type: "a11y" }])).toEqual({ kind: "no-report" });
  });

  it("reads an axe error as a failed run", () => {
    expect(
      readA11yReport([
        { type: "a11y", result: { error: true, violations: undefined } },
      ]),
    ).toEqual({ kind: "axe-error" });
  });

  it("reads a missing violations list as a failed run", () => {
    expect(
      readA11yReport([{ type: "a11y", result: { error: false } }]),
    ).toEqual({ kind: "axe-error" });
  });

  it("reads a violation without an id as a failed run", () => {
    expect(
      readA11yReport([
        { type: "a11y", result: { error: false, violations: [{}] } },
      ]),
    ).toEqual({ kind: "axe-error" });
  });
});
