/**
 * Static content for the Colorectal Polyps learning module.
 *
 * This is the single source of truth for this module's slide data.
 * In Phase 2, this will be replaced by compiled JSON fetched from the API.
 */

import type { CompiledSlide, LearningModule } from "@/features/teaching/types";

export const MODULE_ID = "colonoscopy-optical-diagnosis-test";

export const module: LearningModule = {
  module_id: MODULE_ID,
  title: "Colorectal Polyps",
  order_index: 1,
  status: "live",
  slide_count: 7,
};

export const description =
  "This module covers the morphology categories of superficial lesions, clinical implications of each, and how to communicate findings consistently using the Paris classification.";

export const slides: CompiledSlide[] = [
  {
    slideIndex: 0,
    layout: "section-title",
    title: "Colorectal Polyps",
    body: "A comprehensive overview of morphology categories, clinical implications, and standardised reporting.",
  },
  {
    slideIndex: 1,
    layout: "default",
    title: "What this module covers",
    body: "A short introduction covering morphology categories of superficial lesions, clinical implications of each, and how to communicate findings consistently.",
  },
  {
    slideIndex: 2,
    layout: "video-slide",
    title: "Recorded lecture",
    youtubeId: "2OTbDQh3MxM",
    durationSeconds: 1080,
  },
  {
    slideIndex: 3,
    layout: "image-slide",
    title: "Paris classification overview",
    imageSrc: "/storybook/paris-classification.png",
    imageAlt:
      "Paris classification diagram showing polyp morphology categories",
    imageCaption: "Figure 1: The Paris classification of superficial neoplasms",
  },
  {
    slideIndex: 4,
    layout: "text-with-figure",
    title: "Polyp morphology",
    body: "Polypoid (0-I) versus non-polypoid (0-II) is the primary axis of the Paris classification. The distinction matters because non-polypoid lesions are harder to detect and have different malignancy risks.",
    imageSrc:
      "/storybook/macroscopic-classification-of-superficial-colorectal-neoplasms.png",
    imageAlt: "Comparison of polypoid and non-polypoid lesions",
    imageCaption: "Figure 2: Polypoid vs non-polypoid morphology",
  },
  {
    slideIndex: 5,
    layout: "default",
    title: "Key teaching point",
    body: "The presence of a depressed component has significant clinical implications.",
    calloutType: "warning",
    calloutBody:
      "The presence of a depressed component (0-IIc) changes management. Any 0-IIc or mixed lesion with a depressed component warrants chromoendoscopy before attempting resection.",
  },
  {
    slideIndex: 6,
    layout: "section-title",
    title: "In summary",
  },
];
