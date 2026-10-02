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
} from "./fixtures";

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
