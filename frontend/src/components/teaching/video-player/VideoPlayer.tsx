/**
 * VideoPlayer Component
 *
 * Wraps react-player for consistent video playback across the learning
 * section. V1 supports YouTube via `youtubeId`; V2 will add GCS signed
 * URLs via `signedUrl`.
 *
 * Uses react-player v3 which wraps platform-specific custom elements
 * (youtube-video-element etc.) with a native HTML video interface.
 */

import { Box } from "@mantine/core";
import { useCallback, useRef } from "react";
import ReactPlayer from "react-player";
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
  const playerRef = useRef<HTMLVideoElement>(null);
  const hasResumed = useRef(false);

  const src = youtubeId
    ? `https://www.youtube.com/watch?v=${youtubeId}`
    : signedUrl;

  const handleReady = useCallback(() => {
    if (resumeAt && !hasResumed.current && playerRef.current) {
      playerRef.current.currentTime = resumeAt;
      hasResumed.current = true;
    }
  }, [resumeAt]);

  const handleTimeUpdate = useCallback(() => {
    if (onProgress && playerRef.current) {
      onProgress(playerRef.current.currentTime);
    }
  }, [onProgress]);

  if (!src) return null;

  return (
    <Box className={classes.wrapper}>
      <ReactPlayer
        ref={playerRef}
        src={src}
        width="100%"
        height="100%"
        controls
        onCanPlay={handleReady}
        onTimeUpdate={handleTimeUpdate}
      />
    </Box>
  );
}
