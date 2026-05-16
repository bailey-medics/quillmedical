/**
 * Stub slide data for Storybook stories.
 * Provides realistic examples of each slide layout type.
 */

import type { CompiledSlide } from "@/features/teaching/types";

export const sectionTitleSlide: CompiledSlide = {
  slideIndex: 0,
  layout: "section-title",
  title: "Colorectal Polyps",
  body: "A comprehensive overview of morphology categories, clinical implications, and standardised reporting.",
};

export const videoSlide: CompiledSlide = {
  slideIndex: 1,
  layout: "video-slide",
  title: "Recorded lecture",
  youtubeId: "2OTbDQh3MxM",
  durationSeconds: 1080,
};

export const imageSlide: CompiledSlide = {
  slideIndex: 2,
  layout: "image-slide",
  title: "Paris classification overview",
  imageSrc: "/storybook/paris-classification.png",
  imageAlt: "Paris classification diagram showing polyp morphology categories",
  imageCaption: "Figure 1: The Paris classification of superficial neoplasms",
};

export const textWithFigureSlide: CompiledSlide = {
  slideIndex: 3,
  layout: "text-with-figure",
  title: "Polyp morphology",
  body: "Polypoid (0-I) versus non-polypoid (0-II) is the primary axis of the Paris classification. The distinction matters because non-polypoid lesions are harder to detect and have different malignancy risks.",
  imageSrc:
    "/storybook/macroscopic-classification-of-superficial-colorectal-neoplasms.png",
  imageAlt: "Comparison of polypoid and non-polypoid lesions",
  imageCaption: "Figure 2: Polypoid vs non-polypoid morphology",
};

export const defaultSlide: CompiledSlide = {
  slideIndex: 4,
  layout: "default",
  title: "What this module covers",
  body: "A short introduction covering morphology categories of superficial lesions, clinical implications of each, and how to communicate findings consistently.",
};

export const calloutSlide: CompiledSlide = {
  slideIndex: 5,
  layout: "default",
  title: "Key teaching point",
  body: "The presence of a depressed component has significant clinical implications.",
  calloutType: "warning",
  calloutBody:
    "The presence of a depressed component (0-IIc) changes management. Any 0-IIc or mixed lesion with a depressed component warrants chromoendoscopy before attempting resection.",
};

export const keyTakeawaysSlide: CompiledSlide = {
  slideIndex: 6,
  layout: "section-title",
  title: "In summary",
};

/** Complete set of stub slides for a module */
export const stubSlides: CompiledSlide[] = [
  sectionTitleSlide,
  videoSlide,
  imageSlide,
  textWithFigureSlide,
  defaultSlide,
  calloutSlide,
  keyTakeawaysSlide,
];
