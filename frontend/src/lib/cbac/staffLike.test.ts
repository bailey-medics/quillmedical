/**
 * The definition the staff picker leans on.
 *
 * Deliberately the complement of the two patient-side competencies
 * rather than a list of staff ones — see `staffLike.ts`. The test for
 * an unknown competency is the point of that choice: a clinical
 * competency added to the catalogue tomorrow counts as staff-like
 * here without anybody remembering to update this file.
 */

import { describe, it, expect } from "vitest";
import {
  holdsStaffLikeCompetency,
  PATIENT_SIDE_COMPETENCIES,
} from "./staffLike";

describe("holdsStaffLikeCompetency", () => {
  describe("The patient side", () => {
    it("says no to a patient, who holds only their own record", () => {
      expect(holdsStaffLikeCompetency(["access_own_patient_records"])).toBe(
        false,
      );
    });

    it("says no to an advocate reading somebody else's record", () => {
      // Being an advocate for a relative is not a job at the trust.
      expect(holdsStaffLikeCompetency(["access_granted_patient_records"])).toBe(
        false,
      );
    });

    it("says no to both together", () => {
      expect(holdsStaffLikeCompetency([...PATIENT_SIDE_COMPETENCIES])).toBe(
        false,
      );
    });

    it("says no to somebody holding nothing at all", () => {
      // The same answer and the same prompt: they hold nothing staff-like.
      expect(holdsStaffLikeCompetency([])).toBe(false);
    });
  });

  describe("The staff side", () => {
    it("says yes to a clinical competency", () => {
      expect(holdsStaffLikeCompetency(["access_patient_records"])).toBe(true);
    });

    it("says yes to an administrative one", () => {
      // Staff-like is not the same as clinical — a receptionist counts.
      expect(holdsStaffLikeCompetency(["manage_users"])).toBe(true);
    });

    it("says yes to a competency this file has never heard of", () => {
      // Why the definition is a complement: anything new to the
      // catalogue counts as staff-like without an edit here, so the
      // failure mode is a needless prompt, never a silent omission.
      expect(holdsStaffLikeCompetency(["operate_the_tricorder"])).toBe(true);
    });
  });

  describe("A patient who is also staff", () => {
    it("says yes, because one staff-like competency is enough", () => {
      // The clinician treated at their own trust. They keep the
      // competency for their own record, and are plainly staff.
      expect(
        holdsStaffLikeCompetency([
          "access_own_patient_records",
          "access_patient_records",
        ]),
      ).toBe(true);
    });
  });
});
