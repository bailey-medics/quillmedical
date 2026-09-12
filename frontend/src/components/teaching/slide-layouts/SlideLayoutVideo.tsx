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
  /**
   * Where the video lives, supplied instead of asking the backend.
   *
   * Only for Storybook and tests. A grant is a network call, so without
   * this seam every hosted-video story renders the denial path and the
   * player itself can never be seen — which makes restyling its
   * controls impossible. Undefined in the app, where the grant is the
   * whole authorisation boundary and must not be bypassed.
   */
  baseUrlOverride?: string;
  /**
   * Hold the loading state open, for Storybook and tests.
   *
   * The skeleton is normally visible only for as long as one network
   * call takes, which is too brief to style against and impossible to
   * catch in Storybook, where the call fails at once. Never set in the
   * app: a slide stuck loading would show a learner nothing, forever.
   */
  forceLoading?: boolean;
  /** Called with playback position in seconds */
  onVideoProgress?: (seconds: number) => void;
  /** Resume position in seconds */
  resumeAt?: number;
}

export default function SlideLayoutVideo({
  slide,
  moduleId,
  baseUrlOverride,
  forceLoading = false,
  onVideoProgress,
  resumeAt,
}: SlideLayoutVideoProps) {
  // Only hosted video needs a grant. A YouTube slide asks for nothing,
  // and neither does a slide whose module is unknown. An override
  // supplies the base directly, so nothing is requested at all.
  const needsAccess =
    Boolean(slide.videoSrc) && !slide.youtubeId && !baseUrlOverride;
  const {
    baseUrl: grantedBaseUrl,
    loading,
    error,
  } = useVideoAccess(needsAccess && moduleId ? moduleId : null);

  const baseUrl = baseUrlOverride ?? grantedBaseUrl;

  // The API gives a filename; the grant gives the base. Joining them
  // here is what keeps this component identical in development, where
  // the base is a local route, and in production, where it is the CDN.
  const hostedSrc =
    baseUrl && slide.videoSrc ? `${baseUrl}/${slide.videoSrc}` : undefined;

  return (
    <Stack gap="md">
      <Heading>{slide.title}</Heading>
      {(forceLoading || (needsAccess && loading)) && (
        <Skeleton height={320} radius="md" />
      )}
      {!forceLoading && needsAccess && error && (
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
      {!forceLoading && (!needsAccess || (!loading && !error)) && (
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
