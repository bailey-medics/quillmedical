/**
 * TeachingLearningNav Component
 *
 * Slide navigation sidebar for the learning section. Renders a
 * table-of-contents view with slide titles, type icons, and
 * current position highlighting. Used in TeachingLayout's sidebar
 * area on desktop and NavigationDrawer on mobile.
 */

import { NavLink, Stack } from "@mantine/core";
import Divider from "@/components/divider/Divider";
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconPhoto,
  IconPresentation,
  IconFileText,
} from "@/components/icons/appIcons";
import { TeachingProgressBar } from "@/components/teaching/teaching-progress-bar/TeachingProgressBar";
import type { CompiledSlide, SlideLayout } from "@/features/teaching/types";
import { NAV_ICON_COLOUR, NAV_ICON_SIZE, navLinkStyles } from "../navStyles";
import type { ReactElement } from "react";

export interface TeachingLearningNavProps {
  /** Compiled slide list */
  slides: CompiledSlide[];
  /** Current slide index (0-based) */
  currentIndex: number;
  /** Called when a slide title is clicked */
  onNavigate: (slideIndex: number) => void;
  /** Called when the exit link is clicked */
  onExit: () => void;
}

const layoutIconMap: Record<SlideLayout, ReactElement> = {
  "section-title": (
    <IconPresentation size={NAV_ICON_SIZE} color={NAV_ICON_COLOUR} />
  ),
  "video-slide": (
    <IconPlayerPlay size={NAV_ICON_SIZE} color={NAV_ICON_COLOUR} />
  ),
  "image-slide": <IconPhoto size={NAV_ICON_SIZE} color={NAV_ICON_COLOUR} />,
  "text-with-figure": (
    <IconFileText size={NAV_ICON_SIZE} color={NAV_ICON_COLOUR} />
  ),
  default: <IconFileText size={NAV_ICON_SIZE} color={NAV_ICON_COLOUR} />,
};

export default function TeachingLearningNav({
  slides,
  currentIndex,
  onNavigate,
  onExit,
}: TeachingLearningNavProps) {
  return (
    <Stack gap="xs" p="sm" pb={60}>
      <TeachingProgressBar current={currentIndex + 1} total={slides.length} />

      {slides.map((slide) => (
        <NavLink
          key={slide.slideIndex}
          label={slide.title}
          leftSection={layoutIconMap[slide.layout]}
          active={slide.slideIndex === currentIndex}
          onClick={() => onNavigate(slide.slideIndex)}
          styles={navLinkStyles}
        />
      ))}

      <Divider my="xs" />

      <NavLink
        label="Exit lesson"
        leftSection={
          <IconArrowLeft size={NAV_ICON_SIZE} color={NAV_ICON_COLOUR} />
        }
        onClick={onExit}
        styles={navLinkStyles}
      />
    </Stack>
  );
}
