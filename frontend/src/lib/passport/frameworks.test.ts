import { describe, expect, it } from "vitest";
import { SPECIALTY_FILTER_OPTIONS, filedUnder } from "./frameworks";
import { TEST_FRAMEWORK_CATALOGUE } from "@test/frameworkCatalogue";

describe("frameworks", () => {
  it("lists every framework alphabetically by name", () => {
    const names = TEST_FRAMEWORK_CATALOGUE.frameworks.map(
      (framework) => framework.name,
    );

    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("finds a framework by id, and nothing for one Quill does not hold", () => {
    expect(TEST_FRAMEWORK_CATALOGUE.getFramework("quill_2_test")?.name).toBe(
      "Quill second test framework",
    );
    expect(
      TEST_FRAMEWORK_CATALOGUE.getFramework("not_a_framework"),
    ).toBeUndefined();
  });

  it("gives a framework's items in the order its file lists them", () => {
    const ids = TEST_FRAMEWORK_CATALOGUE.frameworkItems("quill_2_test").map(
      (item) => item.id,
    );

    expect(ids).toContain("quill_2_test_insert_a_cannula");
    expect(ids.indexOf("quill_2_test_insert_a_cannula")).toBeLessThan(
      ids.indexOf("quill_2_test_take_blood"),
    );
  });

  it("leaves a file's permissions out of its framework's items", () => {
    const ids = TEST_FRAMEWORK_CATALOGUE.frameworkItems("quill_2_test").map(
      (item) => item.id,
    );

    expect(ids).not.toContain("access_own_patient_records");
  });

  it("gives nothing for an unknown framework", () => {
    expect(TEST_FRAMEWORK_CATALOGUE.frameworkItems("not_a_framework")).toEqual(
      [],
    );
  });

  it("says which framework a competency belongs to", () => {
    expect(
      TEST_FRAMEWORK_CATALOGUE.frameworkOf("quill_2_test_insert_a_cannula")?.id,
    ).toBe("quill_2_test");
    expect(
      TEST_FRAMEWORK_CATALOGUE.frameworkOf("manage_users"),
    ).toBeUndefined();
    expect(
      TEST_FRAMEWORK_CATALOGUE.frameworkOf("not_a_competency"),
    ).toBeUndefined();
  });

  it("lists the specialties a framework may be filed under", () => {
    expect(SPECIALTY_FILTER_OPTIONS.map((s) => s.id)).toContain("oncology");
  });

  describe("filedUnder", () => {
    it("keeps everything with no filter", () => {
      expect(filedUnder({ specialties: ["oncology"] }, null)).toBe(true);
    });

    it("keeps a framework filed under the specialty", () => {
      expect(filedUnder({ specialties: ["oncology"] }, "oncology")).toBe(true);
      expect(filedUnder({ specialties: ["oncology"] }, "haematology")).toBe(
        false,
      );
    });

    it("never removes a framework filed under no specialty", () => {
      expect(filedUnder({ specialties: [] }, "haematology")).toBe(true);
    });
  });
});
