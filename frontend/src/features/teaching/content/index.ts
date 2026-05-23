/**
 * Content index — exports all static learning modules keyed by moduleId.
 *
 * In Phase 2, this file is deleted and the data access layer calls the API
 * instead.
 */

import type { CompiledSlide, LearningModule } from "@/features/teaching/types";
import * as colorectalPolyps from "./colorectal-polyps";
import * as barrettOesophagus from "./barrett-oesophagus";

export interface ModuleContent {
  module: LearningModule;
  description: string;
  slides: CompiledSlide[];
}

export const MODULES: Record<string, ModuleContent> = {
  [colorectalPolyps.MODULE_ID]: {
    module: colorectalPolyps.module,
    description: colorectalPolyps.description,
    slides: colorectalPolyps.slides,
  },
  [barrettOesophagus.MODULE_ID]: {
    module: barrettOesophagus.module,
    description: barrettOesophagus.description,
    slides: barrettOesophagus.slides,
  },
};
