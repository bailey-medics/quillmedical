import { describe, expect, it } from "vitest";
import { getModules, getModuleDetail, getModuleSlides } from "./learning-data";

describe("learning-data", () => {
  describe("getModules", () => {
    it("returns all live modules sorted by order_index", async () => {
      const modules = await getModules();

      expect(modules.length).toBeGreaterThanOrEqual(2);
      expect(modules[0].module_id).toBe("colonoscopy-optical-diagnosis-test");
      expect(modules[1].module_id).toBe("barrett-oesophagus");

      // Verify sorted by order_index
      for (let i = 1; i < modules.length; i++) {
        expect(modules[i].order_index).toBeGreaterThanOrEqual(
          modules[i - 1].order_index,
        );
      }
    });

    it("returns modules with correct shape", async () => {
      const modules = await getModules();

      for (const mod of modules) {
        expect(mod).toHaveProperty("module_id");
        expect(mod).toHaveProperty("title");
        expect(mod).toHaveProperty("order_index");
        expect(mod).toHaveProperty("status");
        expect(mod).toHaveProperty("slide_count");
        expect(mod.status).toBe("live");
      }
    });
  });

  describe("getModuleDetail", () => {
    it("returns content for a valid module ID", async () => {
      const detail = await getModuleDetail(
        "colonoscopy-optical-diagnosis-test",
      );

      expect(detail).not.toBeNull();
      expect(detail!.module.module_id).toBe(
        "colonoscopy-optical-diagnosis-test",
      );
      expect(detail!.description).toBeTruthy();
      expect(detail!.slides.length).toBeGreaterThan(0);
    });

    it("returns null for an unknown module ID", async () => {
      const detail = await getModuleDetail("nonexistent-module");
      expect(detail).toBeNull();
    });

    it("slide_count matches the actual slide array length", async () => {
      const detail = await getModuleDetail(
        "colonoscopy-optical-diagnosis-test",
      );

      expect(detail).not.toBeNull();
      expect(detail!.module.slide_count).toBe(detail!.slides.length);
    });
  });

  describe("getModuleSlides", () => {
    it("returns slides for a valid module ID", async () => {
      const slides = await getModuleSlides(
        "colonoscopy-optical-diagnosis-test",
      );

      expect(slides).not.toBeNull();
      expect(slides!.length).toBe(7);
    });

    it("returns null for an unknown module ID", async () => {
      const slides = await getModuleSlides("nonexistent-module");
      expect(slides).toBeNull();
    });

    it("slides have sequential indices", async () => {
      const slides = await getModuleSlides(
        "colonoscopy-optical-diagnosis-test",
      );

      expect(slides).not.toBeNull();
      for (let i = 0; i < slides!.length; i++) {
        expect(slides![i].slideIndex).toBe(i);
      }
    });
  });
});
