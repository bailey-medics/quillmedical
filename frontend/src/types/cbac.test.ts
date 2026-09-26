/**
 * The catalogue helpers in `cbac.ts`.
 *
 * The distinction these pin down is the same one the backend draws in
 * `app/cbac/competencies.py`: every id stays readable so an existing
 * grant can still be named, and only the current ones may be offered
 * for a new grant.
 */

import { describe, expect, it } from "vitest";
import {
  ALL_COMPETENCIES,
  ACTIVE_COMPETENCIES,
  ASSESSABLE_COMPETENCIES,
  getCompetencyDetails,
} from "./cbac";

describe("The competency catalogue", () => {
  it("keeps a retired competency readable", () => {
    // Retiring is not deleting. Anything rendering a competency
    // somebody was granted has to keep finding it by id, or a stored
    // grant turns into a bare string on screen.
    const retired = ALL_COMPETENCIES.find(
      (competency) => competency.retired_on !== undefined,
    );

    expect(retired).toBeDefined();
    expect(getCompetencyDetails(retired!.id)?.display_name).toBe(
      retired!.display_name,
    );
  });

  it("does not offer a retired competency to grant", () => {
    // The API refuses a retired id at the write boundary, so offering
    // one gives an admin something they can select and cannot save.
    const offered = ACTIVE_COMPETENCIES.filter(
      (competency) => competency.retired_on !== undefined,
    );

    expect(offered).toEqual([]);
  });

  it("offers everything that is not retired", () => {
    // The pair must account for the whole catalogue: an id missing
    // from both would be impossible to grant without anybody having
    // retired it.
    expect(ACTIVE_COMPETENCIES).toHaveLength(
      ALL_COMPETENCIES.filter(
        (competency) => competency.retired_on === undefined,
      ).length,
    );
  });

  it("offers the competency that replaced the retired one", () => {
    // `access_clinician_passport` was retired when it split. Its
    // successors must not inherit the retirement.
    const ids = ACTIVE_COMPETENCIES.map((competency) => competency.id);

    expect(ids).toContain("assess_clinician_passport");
    expect(ids).toContain("passport_write");
    expect(ids).not.toContain("access_clinician_passport");
  });
});

describe("The competencies the passport may record", () => {
  const ids = ASSESSABLE_COMPETENCIES.map((competency) => competency.id);

  it("offers clinical skills somebody can be assessed on", () => {
    expect(ids).toContain("perform_cannulation");
    expect(ids).toContain("prescribe_sact");
  });

  it("never offers a software permission", () => {
    // Nobody watches somebody "manage users" and signs it off.
    expect(ids).not.toContain("manage_users");
    expect(ids).not.toContain("access_own_patient_records");
    expect(ids).not.toContain("passport_write");
  });

  it("is opt-in, so an entry without the flag is left out", () => {
    const unflagged = ASSESSABLE_COMPETENCIES.filter(
      (competency) => competency.assessable !== true,
    );

    expect(unflagged).toEqual([]);
  });

  it("never offers a retired competency", () => {
    const retired = ASSESSABLE_COMPETENCIES.filter(
      (competency) => competency.retired_on !== undefined,
    );

    expect(retired).toEqual([]);
  });
});
