/**
 * Static content for the Barrett's Oesophagus learning module.
 *
 * Minimal placeholder — real content will be authored later.
 * In Phase 2, this will be replaced by compiled JSON fetched from the API.
 */

import type { CompiledSlide, LearningModule } from "@/features/teaching/types";

export const MODULE_ID = "barrett-oesophagus";

export const module: LearningModule = {
  module_id: MODULE_ID,
  title: "Barrett's Oesophagus",
  order_index: 2,
  status: "live",
  slide_count: 3,
};

export const description =
  "An introduction to Barrett's oesophagus: definition, surveillance protocols, and endoscopic assessment.";

export const slides: CompiledSlide[] = [
  {
    slideIndex: 0,
    layout: "section-title",
    title: "Barrett's Oesophagus",
    body: "Definition, surveillance protocols, and endoscopic assessment.",
  },
  {
    slideIndex: 1,
    layout: "default",
    title: "What this module covers",
    body: "An overview of Barrett's oesophagus including the Prague classification, surveillance intervals, and when to refer for treatment.",
  },
  {
    slideIndex: 2,
    layout: "section-title",
    title: "In summary",
  },
];
