/**
 * SlideLayoutVideo
 *
 * Video fills the slide area with minimal chrome. Heading above the player.
 *
 * Two sources, one layout. A YouTube slide plays immediately; a hosted
 * slide first asks the backend for access, which returns where the video
 * lives and sets the cookie the edge will check. The learner sees a
 * skeleton while that is in flight rather than an empty frame.
 */

import { Skeleton, Stack } from "@mantine/core";
import ErrorState from "@/components/error-state/ErrorState";
import Heading from "@/components/typography/Heading";
import VideoPlayer from "@/components/teaching/video-player/VideoPlayer";
import type { CompiledSlide } from "@/features/teaching/types";
import { useVideoAccess } from "@/features/teaching/use-video-access";

export interface SlideLayoutVideoProps {
  slide: CompiledSlide;
  /** Module the slide belongs to, needed to request video access. */
  moduleId?: string;
  /** Called with playback position in seconds */
  onVideoProgress?: (seconds: number) => void;
  /** Resume position in seconds */
  resumeAt?: number;
}

export default function SlideLayoutVideo({
  slide,
  moduleId,
  onVideoProgress,
  resumeAt,
}: SlideLayoutVideoProps) {
  // Only hosted video needs a grant. A YouTube slide asks for nothing,
  // and neither does a slide whose module is unknown.
  const needsAccess = Boolean(slide.videoSrc) && !slide.youtubeId;
  const { baseUrl, loading, error } = useVideoAccess(
    needsAccess && moduleId ? moduleId : null,
  );

  // The API gives a filename; the grant gives the base. Joining them
  // here is what keeps this component identical in development, where
  // the base is a local route, and in production, where it is the CDN.
  const hostedSrc =
    baseUrl && slide.videoSrc ? `${baseUrl}/${slide.videoSrc}` : undefined;

  return (
    <Stack gap="md">
      <Heading>{slide.title}</Heading>
      {needsAccess && loading && <Skeleton height={320} radius="md" />}
      {needsAccess && error && (
        <ErrorState
          variant="inline"
          title="Video unavailable"
          message={
            "This video is not available — your access may have expired. " +
            "Try reloading the page."
          }
          action={{ label: "Reload page", onClick: () => location.reload() }}
        />
      )}
      {(!needsAccess || (!loading && !error)) && (
        <VideoPlayer
          youtubeId={slide.youtubeId}
          src={hostedSrc}
          onProgress={onVideoProgress}
          resumeAt={resumeAt}
        />
      )}
    </Stack>
  );
}
