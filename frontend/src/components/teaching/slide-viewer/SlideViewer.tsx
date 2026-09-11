/**
 * SlideViewer Component
 *
 * Renders a single compiled slide by dispatching to the appropriate
 * layout component based on the slide's `layout` property.
 */

import type { CompiledSlide } from "@/features/teaching/types";
import SlideLayoutSectionTitle from "@/components/teaching/slide-layouts/SlideLayoutSectionTitle";
import SlideLayoutVideo from "@/components/teaching/slide-layouts/SlideLayoutVideo";
import SlideLayoutTextWithFigure from "@/components/teaching/slide-layouts/SlideLayoutTextWithFigure";
import SlideLayoutDefault from "@/components/teaching/slide-layouts/SlideLayoutDefault";

export interface SlideViewerProps {
  /** The compiled slide data to render */
  slide: CompiledSlide;
  /**
   * Module the slide belongs to.
   *
   * Only hosted video needs it, to request an access grant — but it is
   * threaded from the page rather than derived here, because a
   * component that guessed its own module would be wrong the moment
   * slides were ever shown outside a module route.
   */
  moduleId?: string;
  /** Called with playback position for video slides */
  onVideoProgress?: (seconds: number) => void;
  /** Resume position for video slides (seconds) */
  videoResumeAt?: number;
}

export default function SlideViewer({
  slide,
  moduleId,
  onVideoProgress,
  videoResumeAt,
}: SlideViewerProps) {
  switch (slide.layout) {
    case "section-title":
      return <SlideLayoutSectionTitle slide={slide} />;
    case "video-slide":
      return (
        <SlideLayoutVideo
          slide={slide}
          moduleId={moduleId}
          onVideoProgress={onVideoProgress}
          resumeAt={videoResumeAt}
        />
      );
    case "image-slide":
    case "text-with-figure":
      return <SlideLayoutTextWithFigure slide={slide} />;
    default:
      return <SlideLayoutDefault slide={slide} />;
  }
}
