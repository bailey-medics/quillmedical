/**
 * SlideReader Page
 *
 * The main slide runtime. Renders the current slide, handles navigation
 * via buttons, keyboard (arrow keys), and touch gestures. Updates the
 * URL with the current slide index.
 *
 * Mounted at /teaching/learn/:moduleId/slide/:slideIndex.
 * Phase 1: Uses stub compiled JSON with YouTube videos.
 */

import { Stack, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import React, { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SlideViewer from "@/components/teaching/slide-viewer/SlideViewer";
import { TeachingProgressBar } from "@/components/teaching/teaching-progress-bar/TeachingProgressBar";
import PreviousNextButton from "@/components/button/PreviousNextButton";
import TeachingLearningNav from "@/components/navigation/teaching/TeachingLearningNav";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import { stubSlides } from "@/components/teaching/slide-layouts/stubSlides";
import type { CompiledSlide } from "@/features/teaching/types";

export default function SlideReader() {
  const { moduleId, slideIndex: slideIndexParam } = useParams<{
    moduleId: string;
    slideIndex: string;
  }>();
  const navigate = useNavigate();
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  // Phase 1: stub slides. Phase 2 will fetch from API
  const slides: CompiledSlide[] = stubSlides;

  const currentIndex = useMemo(() => {
    const parsed = Number(slideIndexParam);
    if (Number.isNaN(parsed) || parsed < 0 || parsed >= slides.length) {
      return 0;
    }
    return parsed;
  }, [slideIndexParam, slides.length]);

  const currentSlide = slides[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === slides.length - 1;

  const goToSlide = useCallback(
    (index: number) => {
      navigate(`/teaching/learn/${moduleId}/slide/${index}`, {
        replace: true,
      });
    },
    [navigate, moduleId],
  );

  const goNext = useCallback(() => {
    if (isLast) {
      navigate(`/teaching/${moduleId}`);
    } else {
      goToSlide(currentIndex + 1);
    }
  }, [isLast, currentIndex, goToSlide, navigate, moduleId]);

  const goPrevious = useCallback(() => {
    if (!isFirst) {
      goToSlide(currentIndex - 1);
    }
  }, [isFirst, currentIndex, goToSlide]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrevious();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious]);

  // Touch gesture navigation
  const [touchStart, setTouchStart] = React.useState<number | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // Disable swipe during video playback
      if (currentSlide?.layout === "video-slide") return;
      setTouchStart(e.touches[0].clientX);
    },
    [currentSlide?.layout],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart === null) return;
      const diff = touchStart - e.changedTouches[0].clientX;
      const threshold = 50;

      if (diff > threshold) {
        goNext();
      } else if (diff < -threshold) {
        goPrevious();
      }
      setTouchStart(null);
    },
    [touchStart, goNext, goPrevious],
  );

  // Video progress tracking (Phase 1: local only)
  const handleVideoProgress = useCallback(() => {
    // Phase 2: debounced POST to bookmark endpoint
  }, []);

  if (!currentSlide) {
    return null;
  }

  const sidebarNav = (
    <TeachingLearningNav
      slides={slides}
      currentIndex={currentIndex}
      onNavigate={goToSlide}
      onExit={() => navigate(`/teaching/${moduleId}`)}
    />
  );

  return (
    <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
      <Stack
        gap="lg"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isSm && (
          <TeachingProgressBar
            current={currentIndex + 1}
            total={slides.length}
          />
        )}

        <SlideViewer
          slide={currentSlide}
          onVideoProgress={handleVideoProgress}
        />

        {isSm && (
          <PreviousNextButton
            onPrevious={isFirst ? undefined : goPrevious}
            onNext={goNext}
            nextLabel={isLast ? "Finish" : "Next"}
          />
        )}
      </Stack>
    </TeachingLayout>
  );
}
