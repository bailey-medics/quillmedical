import { describe, expect, it } from "vitest";
import {
  FRAMEWORK_OPTIONS,
  SPECIALTY_FILTER_OPTIONS,
  filedUnder,
  frameworkItems,
  frameworkOf,
  getFramework,
} from "./frameworks";

describe("frameworks", () => {
  it("lists every framework alphabetically by name", () => {
    const names = FRAMEWORK_OPTIONS.map((framework) => framework.name);

    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("finds a framework by id, and nothing for one Quill does not hold", () => {
    expect(getFramework("clinical")?.name).toBe("General clinical skills");
    expect(getFramework("not_a_framework")).toBeUndefined();
  });

  it("gives a framework's items in the order its file lists them", () => {
    const ids = frameworkItems("clinical").map((item) => item.id);

    expect(ids).toContain("perform_cannulation");
    expect(ids.indexOf("perform_venepuncture")).toBeLessThan(
      ids.indexOf("perform_cannulation"),
    );
  });

  it("leaves a file's permissions out of its framework's items", () => {
    // clinical.yaml holds permissions beside its skills.
    const ids = frameworkItems("clinical").map((item) => item.id);

    expect(ids).not.toContain("access_own_patient_records");
  });

  it("gives nothing for an unknown framework", () => {
    expect(frameworkItems("not_a_framework")).toEqual([]);
  });

  it("says which framework a competency belongs to", () => {
    expect(frameworkOf("perform_cannulation")?.id).toBe("clinical");
    expect(frameworkOf("manage_users")).toBeUndefined();
    expect(frameworkOf("not_a_competency")).toBeUndefined();
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
