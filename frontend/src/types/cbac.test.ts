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
  getCompetencyDetails,
  SCOPED_MANAGER_IDS,
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
    // The bundle holds permissions only, so an id missing from this list
    // would be impossible to grant without anybody having retired it.
    expect(ACTIVE_COMPETENCIES).toHaveLength(
      ALL_COMPETENCIES.filter(
        (competency) => competency.retired_on === undefined,
      ).length,
    );
  });

  it("never offers a statement from a paper form to be granted", () => {
    const ids = ACTIVE_COMPETENCIES.map((competency) => competency.id);

    expect(ids).not.toContain("quill_test_give_a_course");
    expect(ids).not.toContain("quill_test_take_a_history");
  });

  it("never offers Quill's own framework's competencies to be granted", () => {
    const ids = ACTIVE_COMPETENCIES.map((competency) => competency.id);

    expect(ids).not.toContain("quill_2_test_insert_a_cannula");
    expect(ids).toContain("prescribe_non_controlled");
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

describe("The bundle", () => {
  it("holds permissions only, and no framework's competency", () => {
    // The passport reads the frameworks from GET /api/passport/catalogue.
    const ids = ALL_COMPETENCIES.map((competency) => competency.id);

    expect(ids).toContain("prescribe_non_controlled");
    expect(ids).not.toContain("quill_2_test_insert_a_cannula");
    expect(ids).not.toContain("quill_test_give_a_course");
    // A procedure is not a permission: Quill cannot stop anybody doing one.
    expect(ids).not.toContain("perform_cannulation");
  });
});

describe("The scoped managers", () => {
  // These open the admin area alongside `manage_users`, so the list must
  // match the backend's `SCOPED_MANAGER_IDS` exactly: a competency the
  // frontend left out would 404 on pages its holder may use.
  it("includes manage_teaching, manage_passport and manage_safety", () => {
    expect(SCOPED_MANAGER_IDS).toContain("manage_teaching");
    expect(SCOPED_MANAGER_IDS).toContain("manage_passport");
    expect(SCOPED_MANAGER_IDS).toContain("manage_safety");
  });

  it("leaves out manage_users, which needs no whitelist", () => {
    expect(SCOPED_MANAGER_IDS).not.toContain("manage_users");
  });

  it("is exactly the current competencies with a whitelist", () => {
    const withAList = ACTIVE_COMPETENCIES.filter(
      (c) =>
        (c.may_grant?.length ?? 0) > 0 ||
        (c.may_assign_professions?.length ?? 0) > 0,
    ).map((c) => c.id);

    expect([...SCOPED_MANAGER_IDS].sort()).toEqual(withAList.sort());
  });

  it("leaves out a retired competency", () => {
    const retired = ALL_COMPETENCIES.filter((c) => c.retired_on).map(
      (c) => c.id,
    );

    expect(SCOPED_MANAGER_IDS.filter((id) => retired.includes(id))).toEqual([]);
  });
});
