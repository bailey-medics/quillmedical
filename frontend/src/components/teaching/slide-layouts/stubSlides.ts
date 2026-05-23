/**
 * Stub slide data for Storybook stories and tests.
 *
 * Re-exports from the canonical content module so there is a single
 * source of truth. Individual named exports are preserved for stories
 * that reference specific layout types.
 */

import type { CompiledSlide } from "@/features/teaching/types";
import { slides } from "@/features/teaching/content/colorectal-polyps";

/** Complete set of stub slides for a module */
export const stubSlides: CompiledSlide[] = slides;

// Named exports for individual slide layout examples (used in stories)
export const sectionTitleSlide: CompiledSlide = slides[0];
export const defaultSlide: CompiledSlide = slides[1];
export const videoSlide: CompiledSlide = slides[2];
export const imageSlide: CompiledSlide = slides[3];
export const textWithFigureSlide: CompiledSlide = slides[4];
export const calloutSlide: CompiledSlide = slides[5];
export const keyTakeawaysSlide: CompiledSlide = slides[6];
