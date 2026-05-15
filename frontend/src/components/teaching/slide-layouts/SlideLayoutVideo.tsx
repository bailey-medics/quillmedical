/**
 * SlideLayoutVideo
 *
 * Video fills the slide area with minimal chrome. Heading above the player.
 */

import { Stack } from "@mantine/core";
import Heading from "@/components/typography/Heading";
import VideoPlayer from "@/components/teaching/video-player/VideoPlayer";
import type { CompiledSlide } from "@/features/teaching/types";

export interface SlideLayoutVideoProps {
  slide: CompiledSlide;
  /** Called with playback position in seconds */
  onVideoProgress?: (seconds: number) => void;
  /** Resume position in seconds */
  resumeAt?: number;
}

export default function SlideLayoutVideo({
  slide,
  onVideoProgress,
  resumeAt,
}: SlideLayoutVideoProps) {
  return (
    <Stack gap="md">
      <Heading>{slide.title}</Heading>
      <VideoPlayer
        youtubeId={slide.youtubeId}
        onProgress={onVideoProgress}
        resumeAt={resumeAt}
      />
    </Stack>
  );
}
