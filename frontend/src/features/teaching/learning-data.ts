/**
 * Data access layer for learning modules.
 *
 * Phase 1: reads from static content files.
 * Phase 2: swap to api.get() calls — function signatures stay the same.
 */

import type { CompiledSlide, LearningModule } from "@/features/teaching/types";
import { MODULES, type ModuleContent } from "./content";

/**
 * Returns all live learning modules, sorted by order_index.
 */
export async function getModules(): Promise<LearningModule[]> {
  return Object.values(MODULES)
    .map((m) => m.module)
    .filter((m) => m.status === "live")
    .sort((a, b) => a.order_index - b.order_index);
}

/**
 * Returns full detail for a single module, or null if not found.
 */
export async function getModuleDetail(
  moduleId: string,
): Promise<ModuleContent | null> {
  return MODULES[moduleId] ?? null;
}

/**
 * Returns compiled slides for a module, or null if not found.
 */
export async function getModuleSlides(
  moduleId: string,
): Promise<CompiledSlide[] | null> {
  const content = MODULES[moduleId];
  return content?.slides ?? null;
}
