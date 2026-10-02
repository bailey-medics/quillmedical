/**
 * Safety fixture tests.
 *
 * Cheap checks that a later edit to the demonstration data leaves every
 * card page with something to show, and leaves no incident pointing at a
 * hazard that is not there.
 */

import { describe, expect, it } from "vitest";
import {
  SAFETY_CASES,
  openHazardCount,
  riskRating,
  safetyCaseById,
  safetyDocumentById,
} from "./fixtures";
import { placeholderKeysIn, renderDocument } from "./render";

describe("safety fixtures", () => {
  it("holds five cases with unique ids", () => {
    expect(SAFETY_CASES).toHaveLength(5);
    const ids = new Set(SAFETY_CASES.map((safetyCase) => safetyCase.id));
    expect(ids.size).toBe(5);
  });

  it("shows every status at least once", () => {
    const statuses = new Set(SAFETY_CASES.map((c) => c.status));
    expect(statuses).toEqual(new Set(["draft", "in_review", "signed_off"]));
  });

  it("links every incident to a hazard on its own case", () => {
    for (const safetyCase of SAFETY_CASES) {
      const hazardIds = new Set(safetyCase.hazards.map((h) => h.id));
      for (const incident of safetyCase.incidents) {
        expect(hazardIds.has(incident.hazard_id)).toBe(true);
      }
    }
  });

  it("gives every case officers, documents, hazards, sign-off lines and placeholders", () => {
    for (const safetyCase of SAFETY_CASES) {
      expect(safetyCase.officers.length).toBeGreaterThan(0);
      expect(safetyCase.documents.length).toBeGreaterThan(0);
      expect(safetyCase.hazards.length).toBeGreaterThan(0);
      expect(safetyCase.sign_off.length).toBeGreaterThan(0);
      expect(safetyCase.placeholders.length).toBeGreaterThan(0);
    }
  });

  it("keeps every email at example.org", () => {
    for (const safetyCase of SAFETY_CASES) {
      for (const officer of safetyCase.officers) {
        expect(officer.email).toMatch(/^[a-z.]+@example\.org$/);
      }
    }
  });

  it("never lets a residual risk exceed the initial one", () => {
    for (const safetyCase of SAFETY_CASES) {
      for (const hazard of safetyCase.hazards) {
        const initial = riskRating(
          hazard.initial_likelihood,
          hazard.initial_severity,
        );
        const residual = riskRating(
          hazard.residual_likelihood,
          hazard.residual_severity,
        );
        expect(residual).toBeLessThanOrEqual(initial);
      }
    }
  });

  it("finds a case by id, and nothing for an unknown id", () => {
    expect(safetyCaseById("sc-001")?.title).toBe(
      "Electronic prescribing module",
    );
    expect(safetyCaseById("sc-999")).toBeUndefined();
  });

  it("counts only open hazards", () => {
    const first = safetyCaseById("sc-001");
    expect(first).toBeDefined();
    expect(openHazardCount(first!)).toBe(2);
  });
});

describe("safety documents", () => {
  it("gives every case four documents with unique ids and content", () => {
    for (const safetyCase of SAFETY_CASES) {
      expect(safetyCase.documents).toHaveLength(4);
      const ids = new Set(safetyCase.documents.map((d) => d.id));
      expect(ids.size).toBe(4);
      for (const document of safetyCase.documents) {
        expect(document.content.length).toBeGreaterThan(100);
      }
    }
  });

  it("renders every document with no placeholder left", () => {
    for (const safetyCase of SAFETY_CASES) {
      for (const document of safetyCase.documents) {
        const rendered = renderDocument(document, safetyCase.placeholders);
        expect(rendered).not.toMatch(/\{\{/);
        expect(rendered).toContain(safetyCase.placeholders[0].value);
      }
    }
  });

  it("leaves an unknown placeholder visible", () => {
    const document = {
      ...SAFETY_CASES[0].documents[0],
      content: "Made by {{ supplier_name }} for {{ nobody }}.",
    };
    expect(renderDocument(document, SAFETY_CASES[0].placeholders)).toBe(
      "Made by MedScribe Health Ltd for {{ nobody }}.",
    );
    expect(placeholderKeysIn(document)).toEqual(["supplier_name", "nobody"]);
  });

  it("writes the case's hazards into its hazard log", () => {
    const log = safetyDocumentById(SAFETY_CASES[0], "hazard-log");
    expect(log).toBeDefined();
    expect(log!.content).toContain("H-01");
    expect(log!.content).toContain("rating 15");
  });

  it("gives every sign-off line an id, a declaration and documents it reviews", () => {
    for (const safetyCase of SAFETY_CASES) {
      const documentIds = new Set(safetyCase.documents.map((d) => d.id));
      const ids = new Set(safetyCase.sign_off.map((item) => item.id));
      expect(ids.size).toBe(safetyCase.sign_off.length);
      for (const item of safetyCase.sign_off) {
        expect(item.attests.length).toBeGreaterThan(40);
        expect(item.reviews.length).toBeGreaterThan(0);
        for (const reviewed of item.reviews) {
          expect(documentIds.has(reviewed)).toBe(true);
        }
      }
    }
  });
});
