/**
 * LearningNav Component
 *
 * Slide navigation sidebar for the learning section. Renders a
 * table-of-contents view with slide titles, type icons, and
 * current position highlighting. Used in MainLayout's sidebar
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
import { typographyTokens } from "@/theme";
import type { ReactElement } from "react";

export interface LearningNavProps {
  /** Compiled slide list */
  slides: CompiledSlide[];
  /** Current slide index (0-based) */
  currentIndex: number;
  /** Called when a slide title is clicked */
  onNavigate: (slideIndex: number) => void;
  /** Called when the exit link is clicked */
  onExit: () => void;
}

/** Icon size matching NavIcon "lg" (22px) */
const NAV_ICON_SIZE = 22;
/** Icon colour matching NavIcon */
const NAV_ICON_COLOUR = "var(--mantine-color-gray-6)";

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

export default function LearningNav({
  slides,
  currentIndex,
  onNavigate,
  onExit,
}: LearningNavProps) {
  return (
    <Stack gap="xs" p="sm">
      <TeachingProgressBar current={currentIndex + 1} total={slides.length} />

      {slides.map((slide) => (
        <NavLink
          key={slide.slideIndex}
          label={slide.title}
          leftSection={layoutIconMap[slide.layout]}
          active={slide.slideIndex === currentIndex}
          onClick={() => onNavigate(slide.slideIndex)}
          styles={{
            label: {
              fontSize: "var(--mantine-font-size-md)",
              fontWeight: typographyTokens.fontWeights.body,
            },
          }}
        />
      ))}

      <Divider my="xs" />

      <NavLink
        label="Exit"
        leftSection={
          <IconArrowLeft size={NAV_ICON_SIZE} color={NAV_ICON_COLOUR} />
        }
        onClick={onExit}
        styles={{
          label: {
            fontSize: "var(--mantine-font-size-md)",
            fontWeight: typographyTokens.fontWeights.body,
          },
        }}
      />
    </Stack>
  );
}
