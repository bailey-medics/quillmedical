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

import { Box, Skeleton } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hasResumed = useRef(false);
  const [ready, setReady] = useState(false);

  const src = youtubeId
    ? `https://www.youtube.com/watch?v=${youtubeId}`
    : signedUrl;

  // Detect when the player custom element (e.g. <youtube-video>)
  // is inserted into the DOM. Its internals use shadow DOM so
  // standard video events are unreliable, but the element itself
  // is a regular DOM node we can observe.
  useEffect(() => {
    if (ready || !wrapperRef.current) return;

    const check = () =>
      wrapperRef.current && wrapperRef.current.children.length > 0;

    const observer = new MutationObserver(() => {
      if (check()) {
        setReady(true);
        observer.disconnect();
      }
    });

    observer.observe(wrapperRef.current, { childList: true, subtree: true });

    // Handle already-present elements (e.g. cached / fast re-mount)
    if (check()) observer.disconnect();

    return () => observer.disconnect();
  }, [ready]);

  const handleReady = useCallback(() => {
    setReady(true);
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
    <Box ref={wrapperRef} className={classes.wrapper}>
      {!ready && (
        <Skeleton
          radius="md"
          style={{ position: "absolute", inset: 0, zIndex: 1 }}
        />
      )}
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
