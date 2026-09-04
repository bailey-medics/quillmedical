import { describe, expect, it } from "vitest";
import {
  sanitiseComponentStack,
  sanitiseErrorReport,
  sanitiseMessage,
  sanitiseName,
  sanitiseStack,
} from "./sanitise";

/**
 * Strings shaped like the things that must never leave the browser.
 *
 * Each is checked against every field, because a report has several and a
 * rule applied to only one of them is the kind of gap that looks fine in
 * review.
 */
const PATIENT_SHAPED: ReadonlyArray<readonly [string, string]> = [
  ["NHS number", "943 476 5919"],
  ["NHS number, no spaces", "9434765919"],
  ["NHS number, hyphenated", "943-476-5919"],
  ["date of birth, ISO", "1974-03-02"],
  ["date of birth, day first", "02/03/1974"],
  ["email address", "jane.doe@example.nhs.uk"],
  ["patient identifier", "3f2504e0-4f89-11d3-9a0c-0305e82c3301"],
  ["UK postcode", "SW1A 1AA"],
  ["record number", "1234567"],
];

describe("sanitiseErrorReport", () => {
  it("keeps the message for an engine error", () => {
    const report = sanitiseErrorReport({
      name: "TypeError",
      message: "Cannot read properties of undefined (reading 'name')",
      release: "abc123",
      source: "boundary",
    });

    expect(report.message).toBe(
      "Cannot read properties of undefined (reading 'name')",
    );
  });

  it("drops the message for an error the engine did not compose", () => {
    // api.ts copies server-supplied detail straight into Error.message, so
    // anything not from the engine is treated as untrusted prose.
    const report = sanitiseErrorReport({
      name: "Error",
      message: "Could not save the note for Jane Doe",
      release: "abc123",
      source: "boundary",
    });

    expect(report.message).toBe("");
    expect(report.name).toBe("Error");
  });

  it("still reports the error type when the message is dropped", () => {
    const report = sanitiseErrorReport({
      name: "ApiError",
      message: "patient 943 476 5919 not found",
      release: "abc123",
      source: "window",
    });

    expect(report.name).toBe("ApiError");
    expect(report.message).toBe("");
  });

  it("falls back to a usable name when none is given", () => {
    const report = sanitiseErrorReport({
      name: "",
      message: "boom",
      release: "abc123",
      source: "window",
    });

    expect(report.name).toBe("Error");
  });
});

describe("patient-shaped strings never survive", () => {
  for (const [label, value] of PATIENT_SHAPED) {
    it(`removes a ${label} from an engine error message`, () => {
      const out = sanitiseMessage("TypeError", `failed near ${value} here`);

      expect(out).not.toContain(value);
    });

    it(`removes a ${label} from a stack`, () => {
      const out = sanitiseStack(`at handler (${value})`);

      expect(out).not.toContain(value);
    });

    it(`removes a ${label} from a component stack`, () => {
      const out = sanitiseComponentStack(`in Patient (${value})`);

      expect(out).not.toContain(value);
    });

    it(`removes a ${label} from every field of a whole report`, () => {
      const report = sanitiseErrorReport({
        name: `Type${value}Error`,
        message: `TypeError near ${value}`,
        stack: `at load (${value})`,
        componentStack: `in Row (${value})`,
        release: value,
        source: "boundary",
      });

      expect(JSON.stringify(report)).not.toContain(value);
    });
  }
});

describe("the name field", () => {
  // Found by the whole-report test above: the redaction patterns are anchored
  // on word boundaries, which do not fire when a value is embedded inside a
  // larger token. A name is an identifier, so it is filtered by character
  // class instead.
  it("strips a value embedded inside the name, where word boundaries fail", () => {
    expect(sanitiseName("TypeSW1A 1AAError")).not.toContain("SW1A");
    expect(sanitiseName("Err9434765919or")).not.toContain("9434765919");
  });

  it("keeps ordinary error names intact", () => {
    expect(sanitiseName("TypeError")).toBe("TypeError");
    expect(sanitiseName("ApiError")).toBe("ApiError");
  });

  it("falls back to Error when nothing usable remains", () => {
    expect(sanitiseName("943 476 5919")).toBe("Error");
    expect(sanitiseName("")).toBe("Error");
  });
});

describe("URLs and routes", () => {
  it("removes an absolute URL from a message", () => {
    const out = sanitiseMessage(
      "TypeError",
      "failed fetching https://teaching.quill-medical.com/api/patients/42/letters",
    );

    expect(out).not.toContain("quill-medical.com");
    expect(out).not.toContain("patients");
    expect(out).toContain("[url]");
  });

  it("removes a bare app route from a message", () => {
    const out = sanitiseMessage(
      "TypeError",
      "render failed at /patients/42/letters",
    );

    expect(out).not.toContain("patients");
    expect(out).toContain("[path]");
  });

  it("removes a query string along with its URL", () => {
    const out = sanitiseMessage(
      "TypeError",
      "https://example.com/search?nhs=9434765919&name=Jane",
    );

    expect(out).not.toContain("9434765919");
    expect(out).not.toContain("Jane");
  });

  it("keeps line and column numbers, which the digit rule would otherwise eat", () => {
    // Minified bundles have five-figure line numbers, and the position is the
    // one part of a frame that says where the error actually happened.
    const out = sanitiseStack(
      "at r (https://teaching.quill-medical.com/assets/index-BK0cJ6qZ.js:12345:67)",
    );

    expect(out).toBe("at r (/assets/index-BK0cJ6qZ.js:12345:67)");
  });

  it("still redacts a long number that is not a stack position", () => {
    expect(sanitiseStack("at r (943 476 5919)")).not.toContain("5919");
  });

  it("keeps bundle paths in a stack but strips the origin", () => {
    const out = sanitiseStack(
      "at render (https://teaching.quill-medical.com/assets/index-BK0cJ6qZ.js:4:19)",
    );

    // The file is what makes the report actionable, so it stays.
    expect(out).toContain("/assets/index-BK0cJ6qZ.js");
    // The origin could carry a route, so it does not.
    expect(out).not.toContain("teaching.quill-medical.com");
  });
});

describe("size limits", () => {
  it("truncates an over-long message", () => {
    const out = sanitiseMessage("TypeError", "x".repeat(1000));

    expect(out.length).toBeLessThan(1000);
    expect(out).toContain("[truncated]");
  });

  it("truncates an over-long stack", () => {
    const out = sanitiseStack("y".repeat(10000));

    expect(out.length).toBeLessThan(10000);
    expect(out).toContain("[truncated]");
  });

  it("returns empty strings rather than undefined for missing fields", () => {
    const report = sanitiseErrorReport({
      name: "TypeError",
      message: "boom",
      release: "abc123",
      source: "window",
    });

    expect(report.stack).toBe("");
    expect(report.componentStack).toBe("");
  });
});
