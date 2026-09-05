import { describe, expect, it } from "vitest";
import {
  fromError,
  sanitiseComponentStack,
  sanitiseErrorCode,
  sanitiseErrorReport,
  sanitiseMessage,
  sanitiseName,
  sanitiseStack,
  sanitiseStatus,
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
  it("keeps a message that has nothing sensitive in it", () => {
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

  it("keeps the message but redacts the structured shapes in it", () => {
    const report = sanitiseErrorReport({
      name: "ApiError",
      message: "patient 943 476 5919 not found",
      release: "abc123",
      source: "window",
    });

    expect(report.name).toBe("ApiError");
    expect(report.message).not.toContain("943 476 5919");
    // The rest of the message is what makes the report worth having.
    expect(report.message).toContain("not found");
  });

  it("cannot redact a name, which is why the backend must not send one", () => {
    // Recorded rather than hidden. Names have no pattern, so nothing here can
    // catch them, and no tightening of these rules would change that. The
    // defence is that the backend does not put a name in an error response —
    // the seventeen endpoints that currently might are tracked in
    // docs/docs/plans/2026-08-31-analytics-plan.md. When that work lands and
    // this expectation is inverted, this comment goes with it.
    const report = sanitiseErrorReport({
      name: "Error",
      message: "Could not save the note for Jane Doe",
      release: "abc123",
      source: "boundary",
    });

    expect(report.message).toContain("Jane Doe");
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
    it(`removes a ${label} from a message`, () => {
      const out = sanitiseMessage(`failed near ${value} here`);

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
        errorCode: `CODE_${value}`,
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
      "failed fetching https://teaching.quill-medical.com/api/patients/42/letters",
    );

    expect(out).not.toContain("quill-medical.com");
    expect(out).not.toContain("patients");
    expect(out).toContain("[url]");
  });

  it("removes a bare app route from a message", () => {
    const out = sanitiseMessage("render failed at /patients/42/letters");

    expect(out).not.toContain("patients");
    expect(out).toContain("[path]");
  });

  it("removes a query string along with its URL", () => {
    const out = sanitiseMessage(
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
    const out = sanitiseMessage("x".repeat(1000));

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

describe("the error code field", () => {
  it("keeps a backend code, which is a fixed vocabulary", () => {
    expect(sanitiseErrorCode("USER_NOT_FOUND")).toBe("USER_NOT_FOUND");
    expect(sanitiseErrorCode("FHIR_PATIENT_FETCH_FAILED")).toBe(
      "FHIR_PATIENT_FETCH_FAILED",
    );
  });

  it("removes a value whose separators have already been stripped", () => {
    // The gap this closes: filtering to code characters turns
    // `CODE_1974-03-02` into `CODE_19740302`, which the earlier assertion
    // passed only because it looked for the original hyphenated string. The
    // date was still there. A run of digits is what distinguishes a smuggled
    // value from a real code.
    expect(sanitiseErrorCode("CODE_1974-03-02")).not.toContain("19740302");
    expect(sanitiseErrorCode("CODE 943 476 5919")).not.toContain("9434765919");
  });

  it("keeps a real code that contains a single digit", () => {
    // Digits cannot simply be dropped: real codes carry them.
    expect(sanitiseErrorCode("PRESCRIBE_SCHEDULE_2_DENIED")).toBe(
      "PRESCRIBE_SCHEDULE_2_DENIED",
    );
  });

  it("strips anything that is not code-shaped", () => {
    // Filtered by character class rather than by the redaction patterns, for
    // the same reason as the name field: word boundaries do not fire inside a
    // larger token.
    expect(sanitiseErrorCode("CODE 943 476 5919")).not.toContain("943");
    expect(sanitiseErrorCode("jane.doe@example.nhs.uk")).not.toContain("@");
    expect(sanitiseErrorCode("SW1A 1AA")).not.toContain(" ");
  });
});

describe("the status field", () => {
  it("keeps a real HTTP status", () => {
    expect(sanitiseStatus(404)).toBe(404);
    expect(sanitiseStatus(500)).toBe(500);
  });

  it("drops anything that is not a whole status code", () => {
    expect(sanitiseStatus(99)).toBeUndefined();
    expect(sanitiseStatus(600)).toBeUndefined();
    expect(sanitiseStatus(404.5)).toBeUndefined();
    expect(sanitiseStatus("404")).toBeUndefined();
    expect(sanitiseStatus(undefined)).toBeUndefined();
    expect(sanitiseStatus(null)).toBeUndefined();
  });
});

describe("reading properties off a thrown value", () => {
  it("never reads the email address api.ts attaches to some errors", () => {
    // api.ts sets `email` on errors from certain auth responses. It is a real
    // address belonging to a real person, so properties are read by name and
    // never enumerated.
    const thrown = Object.assign(new Error("registration failed"), {
      error_code: "EMAIL_ALREADY_REGISTERED",
      status: 409,
      email: "jane.doe@example.nhs.uk",
    });

    const report = sanitiseErrorReport(fromError(thrown, "abc123", "window"));

    expect(JSON.stringify(report)).not.toContain("jane.doe");
    expect(JSON.stringify(report)).not.toContain("example.nhs.uk");
  });

  it("keeps the structured fields api.ts attaches", () => {
    const thrown = Object.assign(new Error("not found"), {
      error_code: "USER_NOT_FOUND",
      status: 404,
    });

    const report = sanitiseErrorReport(fromError(thrown, "abc123", "window"));

    expect(report.errorCode).toBe("USER_NOT_FOUND");
    expect(report.status).toBe(404);
    expect(report.name).toBe("Error");
  });

  it("survives a thrown value that is not an Error at all", () => {
    const report = sanitiseErrorReport(
      fromError("just a string", "abc123", "window"),
    );

    expect(report.name).toBe("Error");
    expect(report.message).toBe("");
    expect(report.status).toBeUndefined();
  });

  it("carries the component stack through from a boundary", () => {
    const report = sanitiseErrorReport(
      fromError(new Error("boom"), "abc123", "boundary", "in Row (at Row.tsx)"),
    );

    expect(report.componentStack).toContain("in Row");
    expect(report.source).toBe("boundary");
  });
});

describe("truncation stays within the backend's limits", () => {
  it("counts the marker inside the limit rather than adding it on top", () => {
    // The backend rejects any field over its own cap. A marker added on top of
    // a client cap set equal to that one would turn a long field into a
    // dropped report, which is the failure that is hardest to notice.
    const report = sanitiseErrorReport({
      name: "TypeError",
      message: "x".repeat(5000),
      stack: "y".repeat(50000),
      componentStack: "z".repeat(50000),
      errorCode: "C".repeat(500),
      release: "r".repeat(500),
      source: "window",
    });

    expect(report.message.length).toBeLessThanOrEqual(400);
    expect(report.stack.length).toBeLessThanOrEqual(4000);
    expect(report.componentStack.length).toBeLessThanOrEqual(2000);
    expect(report.errorCode.length).toBeLessThanOrEqual(100);
    expect(report.release.length).toBeLessThanOrEqual(100);
  });
});
