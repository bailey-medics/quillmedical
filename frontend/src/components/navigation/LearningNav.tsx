/**
 * LearningNav Component
 *
 * Slide navigation sidebar for the learning section. Renders a
 * table-of-contents view with slide titles, type icons, and
 * current position highlighting. Used in MainLayout's sidebar
 * area on desktop and NavigationDrawer on mobile.
 */

import { NavLink, Stack } from "@mantine/core";
import Icon from "@/components/icons";
import {
  IconPlayerPlay,
  IconPhoto,
  IconPresentation,
  IconFileText,
  IconCircleCheck,
} from "@/components/icons/appIcons";
import SlideProgress from "@/components/teaching/slide-progress/SlideProgress";
import type { CompiledSlide, SlideLayout } from "@/features/teaching/types";
import { typographyTokens } from "@/theme";
import type { ReactElement } from "react";

export interface LearningNavProps {
  /** Compiled slide list */
  slides: CompiledSlide[];
  /** Current slide index (0-based) */
  currentIndex: number;
  /** Set of visited slide indices */
  visited: Set<number>;
  /** Called when a slide title is clicked */
  onNavigate: (slideIndex: number) => void;
}

const layoutIconMap: Record<SlideLayout, ReactElement> = {
  "section-title": <IconPresentation />,
  "video-slide": <IconPlayerPlay />,
  "image-slide": <IconPhoto />,
  "text-with-figure": <IconFileText />,
  default: <IconFileText />,
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function LearningNav({
  slides,
  currentIndex,
  visited,
  onNavigate,
}: LearningNavProps) {
  return (
    <Stack gap="xs" p="sm">
      <SlideProgress current={currentIndex + 1} total={slides.length} />

      {slides.map((slide) => (
        <NavLink
          key={slide.slideIndex}
          label={slide.title}
          leftSection={<Icon icon={layoutIconMap[slide.layout]} size="sm" />}
          rightSection={
            visited.has(slide.slideIndex) ? (
              <Icon
                icon={<IconCircleCheck />}
                size="sm"
                colour="var(--success-color)"
              />
            ) : slide.durationSeconds ? (
              formatDuration(slide.durationSeconds)
            ) : undefined
          }
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
    </Stack>
  );
}
