/**
 * VideoPlayer Component
 *
 * Wraps react-player for consistent video playback across the learning
 * section. V1 supports YouTube via `youtubeId`; V2 will add GCS signed
 * URLs via `signedUrl`.
 */

import { Box } from "@mantine/core";
import { useCallback, useRef } from "react";
import ReactPlayer from "react-player";
import type { OnProgressProps } from "react-player/base";
import classes from "./VideoPlayer.module.css";

export interface VideoPlayerProps {
  /** YouTube video ID (V1) */
  youtubeId?: string;
  /** GCS signed URL (V2 — not yet implemented) */
  signedUrl?: string;
  /** Poster image URL */
  posterUrl?: string;
  /** Called with current playback position in seconds */
  onProgress?: (seconds: number) => void;
  /** Resume playback from this position (seconds) */
  resumeAt?: number;
}

export default function VideoPlayer({
  youtubeId,
  signedUrl,
  onProgress,
  resumeAt,
}: VideoPlayerProps) {
  const playerRef = useRef<ReactPlayer>(null);
  const hasResumed = useRef(false);

  const url = youtubeId
    ? `https://www.youtube.com/watch?v=${youtubeId}`
    : signedUrl;

  const handleReady = useCallback(() => {
    if (resumeAt && !hasResumed.current && playerRef.current) {
      playerRef.current.seekTo(resumeAt, "seconds");
      hasResumed.current = true;
    }
  }, [resumeAt]);

  const handleProgress = useCallback(
    (state: OnProgressProps) => {
      onProgress?.(state.playedSeconds);
    },
    [onProgress],
  );

  if (!url) return null;

  return (
    <Box className={classes.wrapper}>
      <ReactPlayer
        ref={playerRef}
        url={url}
        width="100%"
        height="100%"
        controls
        onReady={handleReady}
        onProgress={handleProgress}
        progressInterval={5000}
        config={{
          playerVars: {
            modestbranding: 1,
            rel: 0,
          },
        }}
      />
    </Box>
  );
}
