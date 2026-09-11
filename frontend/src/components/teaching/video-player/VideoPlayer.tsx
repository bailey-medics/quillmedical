/**
 * VideoPlayer Component
 *
 * Wraps react-player for consistent video playback across the learning
 * section. Two sources: `youtubeId` for public content, and `src` for a
 * hosted lecture served from our own bucket.
 *
 * `src` is a plain URL, not a signed one. Authorisation for hosted video
 * is carried by an `HttpOnly` cookie the backend set, validated at the
 * edge before any byte is served — so nothing here holds a credential,
 * and none appears in the DOM or in a copied link.
 *
 * Uses react-player v3 which wraps platform-specific custom elements
 * (youtube-video-element etc.) with a native HTML video interface.
 *
 * react-player is lazily imported because its custom-element registration
 * hangs during Storybook's static build (no real browser DOM).
 */

import { Box } from "@mantine/core";
import { lazy, Suspense, useCallback, useRef } from "react";
import classes from "./VideoPlayer.module.css";

const ReactPlayer = lazy(() => import("react-player"));

export interface VideoPlayerProps {
  /** YouTube video ID, for public content */
  youtubeId?: string;
  /**
   * Full URL of a hosted video.
   *
   * Not a signed URL: access is granted by a cookie, so this is an
   * ordinary address that happens to require one.
   */
  src?: string;
  /** Poster image URL */
  posterUrl?: string;
  /** WebVTT captions URL. Captions are a WCAG 2.1 AA requirement. */
  captionsUrl?: string;
  /** Called with current playback position in seconds */
  onProgress?: (seconds: number) => void;
  /** Resume playback from this position (seconds) */
  resumeAt?: number;
}

export default function VideoPlayer({
  youtubeId,
  src: hostedSrc,
  posterUrl,
  captionsUrl,
  onProgress,
  resumeAt,
}: VideoPlayerProps) {
  const playerRef = useRef<HTMLVideoElement>(null);
  const hasResumed = useRef(false);

  const src = youtubeId
    ? `https://www.youtube.com/watch?v=${youtubeId}`
    : hostedSrc;

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
      <Suspense fallback={null}>
        {/*
          react-player v3 passes `children` straight into the underlying
          custom element, so a WebVTT <track> works without dropping to a
          native <video> — the fallback the plan flagged if it could not.
          Captions are a WCAG 2.1 AA requirement.

          Two forms rather than one with a conditional child: an inline
          `{cond && ...}` still hands the element a children argument —
          `false`, plus any JSX comment and whitespace around it — and
          the YouTube custom element builds its own DOM, so anything
          passed in competes with it. Handing it no children at all is
          the difference between a YouTube slide playing and rendering
          blank. YouTube carries its own captions in any case.
        */}
        {!youtubeId && captionsUrl ? (
          <ReactPlayer
            ref={playerRef}
            src={src}
            width="100%"
            height="100%"
            controls
            poster={posterUrl}
            onCanPlay={handleReady}
            onTimeUpdate={handleTimeUpdate}
          >
            <track
              kind="captions"
              src={captionsUrl}
              srcLang="en"
              label="English"
              default
            />
          </ReactPlayer>
        ) : (
          <ReactPlayer
            ref={playerRef}
            src={src}
            width="100%"
            height="100%"
            controls
            poster={posterUrl}
            onCanPlay={handleReady}
            onTimeUpdate={handleTimeUpdate}
          />
        )}
      </Suspense>
    </Box>
  );
}
