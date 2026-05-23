/**
 * Stub slide data for Storybook stories and tests.
 *
 * Inline test fixtures — no dependency on teaching content modules.
 */

import type { CompiledSlide } from "@/features/teaching/types";

/** Complete set of stub slides for a module */
export const stubSlides: CompiledSlide[] = [
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

// Named exports for individual slide layout examples (used in stories)
export const sectionTitleSlide: CompiledSlide = stubSlides[0];
export const defaultSlide: CompiledSlide = stubSlides[1];
export const videoSlide: CompiledSlide = stubSlides[2];
export const imageSlide: CompiledSlide = stubSlides[3];
export const textWithFigureSlide: CompiledSlide = stubSlides[4];
export const calloutSlide: CompiledSlide = stubSlides[5];
export const keyTakeawaysSlide: CompiledSlide = stubSlides[6];
