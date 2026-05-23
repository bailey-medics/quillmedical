import { beforeEach, describe, expect, it, vi } from "vitest";
import { getModules, getModuleDetail, getModuleSlides } from "./learning-data";
import type { LearningContentResponse, LearningModule } from "./types";

const mockModules: LearningModule[] = [
  {
    module_id: "module-a",
    title: "Module A",
    order: 1,
    status: "live",
    has_learning: true,
    slide_count: 3,
    renewal_months: null,
    description: "Description A",
  },
  {
    module_id: "module-b",
    title: "Module B",
    order: 2,
    status: "live",
    has_learning: true,
    slide_count: 2,
    renewal_months: 12,
    description: null,
  },
];

const mockContent: LearningContentResponse = {
  module_id: "module-a",
  title: "Module A",
  slides: [
    { slide_index: 0, layout: "section-title", title: "Intro" },
    { slide_index: 1, layout: "default", title: "Content", body: "Some text" },
    { slide_index: 2, layout: "section-title", title: "Summary" },
  ] as unknown as LearningContentResponse["slides"],
};

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from "@/lib/api";
const mockGet = vi.mocked(api.get);

describe("learning-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getModules", () => {
    it("returns modules from the API sorted by order", async () => {
      mockGet.mockResolvedValueOnce(mockModules);

      const modules = await getModules();

      expect(mockGet).toHaveBeenCalledWith("/teaching/modules");
      expect(modules).toHaveLength(2);
      expect(modules[0].module_id).toBe("module-a");
      expect(modules[1].module_id).toBe("module-b");
    });

    it("returns modules with correct shape", async () => {
      mockGet.mockResolvedValueOnce(mockModules);

      const modules = await getModules();

      for (const mod of modules) {
        expect(mod).toHaveProperty("module_id");
        expect(mod).toHaveProperty("title");
        expect(mod).toHaveProperty("order");
        expect(mod).toHaveProperty("status");
        expect(mod).toHaveProperty("slide_count");
      }
    });
  });

  describe("getModuleDetail", () => {
    it("returns content for a valid module ID", async () => {
      mockGet.mockResolvedValueOnce(mockContent);

      const detail = await getModuleDetail("module-a");

      expect(mockGet).toHaveBeenCalledWith(
        "/teaching/modules/module-a/learning",
      );
      expect(detail).not.toBeNull();
      expect(detail!.module_id).toBe("module-a");
      expect(detail!.slides.length).toBe(3);
    });

    it("returns null when API returns error", async () => {
      mockGet.mockRejectedValueOnce(new Error("Not found"));

      const detail = await getModuleDetail("nonexistent-module");
      expect(detail).toBeNull();
    });
  });

  describe("getModuleSlides", () => {
    it("returns slides for a valid module ID", async () => {
      mockGet.mockResolvedValueOnce(mockContent);

      const slides = await getModuleSlides("module-a");

      expect(slides).not.toBeNull();
      expect(slides!.length).toBe(3);
    });

    it("returns null when module not found", async () => {
      mockGet.mockRejectedValueOnce(new Error("Not found"));

      const slides = await getModuleSlides("nonexistent-module");
      expect(slides).toBeNull();
    });

    it("slides have sequential indices", async () => {
      mockGet.mockResolvedValueOnce(mockContent);

      const slides = await getModuleSlides("module-a");

      expect(slides).not.toBeNull();
      for (let i = 0; i < slides!.length; i++) {
        expect(slides![i].slideIndex).toBe(i);
      }
    });
  });
});
