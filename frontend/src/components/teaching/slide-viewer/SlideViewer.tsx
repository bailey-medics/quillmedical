/**
 * SlideViewer Component
 *
 * Renders a single compiled slide by dispatching to the appropriate
 * layout component based on the slide's `layout` property.
 */

import type { CompiledSlide } from "@/features/teaching/types";
import SlideLayoutSectionTitle from "@/components/teaching/slide-layouts/SlideLayoutSectionTitle";
import SlideLayoutVideo from "@/components/teaching/slide-layouts/SlideLayoutVideo";
import SlideLayoutImage from "@/components/teaching/slide-layouts/SlideLayoutImage";
import SlideLayoutTextWithFigure from "@/components/teaching/slide-layouts/SlideLayoutTextWithFigure";
import SlideLayoutDefault from "@/components/teaching/slide-layouts/SlideLayoutDefault";

export interface SlideViewerProps {
  /** The compiled slide data to render */
  slide: CompiledSlide;
  /** Called with playback position for video slides */
  onVideoProgress?: (seconds: number) => void;
  /** Resume position for video slides (seconds) */
  videoResumeAt?: number;
}

export default function SlideViewer({
  slide,
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
          onVideoProgress={onVideoProgress}
          resumeAt={videoResumeAt}
        />
      );
    case "image-slide":
      return <SlideLayoutImage slide={slide} />;
    case "text-with-figure":
      return <SlideLayoutTextWithFigure slide={slide} />;
    default:
      return <SlideLayoutDefault slide={slide} />;
  }
}
