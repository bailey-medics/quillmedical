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

import { Box, SegmentedControl } from "@mantine/core";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import classes from "./VideoPlayer.module.css";
import { titleFrames, YOUTUBE_FRAME_TITLE } from "./titleFrames";

const ReactPlayer = lazy(() => import("react-player"));

/** Which rendition is playing. 720p is the default everywhere. */
type Quality = "720p" | "1080p";

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
  /**
   * Full URL of the 1080p rendition, where one exists.
   *
   * Only supplied when the transcode job recorded producing it, so its
   * presence is what decides whether a quality control is offered at
   * all. A source shorter than 1080p never gets one.
   */
  src1080p?: string;
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
  src1080p,
  posterUrl,
  captionsUrl,
  onProgress,
  resumeAt,
}: VideoPlayerProps) {
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const hasResumed = useRef(false);
  const [quality, setQuality] = useState<Quality>("720p");
  // Where the learner was when they changed quality. Swapping `src`
  // reloads the element from zero, so the position has to be caught
  // before the switch and restored once the new file can play —
  // dropping someone back to the start of a lecture is worse than not
  // offering the choice at all.
  const pendingSeek = useRef<number | null>(null);

  // Only hosted video has renditions, and only when the job made a
  // second one. YouTube draws its own quality menu.
  const canSwitch = Boolean(!youtubeId && hostedSrc && src1080p);
  const activeSrc = canSwitch && quality === "1080p" ? src1080p : hostedSrc;

  const src = youtubeId
    ? `https://www.youtube.com/watch?v=${youtubeId}`
    : activeSrc;

  const handleQualityChange = useCallback((value: string) => {
    if (playerRef.current) {
      pendingSeek.current = playerRef.current.currentTime;
    }
    setQuality(value as Quality);
  }, []);

  const handleReady = useCallback(() => {
    if (!playerRef.current) return;

    // A pending seek wins over the resume position: it means the
    // learner was already watching and changed quality mid-lecture.
    if (pendingSeek.current !== null) {
      playerRef.current.currentTime = pendingSeek.current;
      pendingSeek.current = null;
      void playerRef.current.play?.();
      return;
    }

    if (resumeAt && !hasResumed.current) {
      playerRef.current.currentTime = resumeAt;
      hasResumed.current = true;
    }
  }, [resumeAt]);

  // The player element's shadow root, where youtube-video-element puts
  // its iframe. Caught by a callback ref because the player is lazy and
  // arrives after the first render.
  const [frameHost, setFrameHost] = useState<ShadowRoot | null>(null);
  const attachPlayer = useCallback((node: HTMLVideoElement | null) => {
    playerRef.current = node;
    setFrameHost(node?.shadowRoot ?? null);
  }, []);
  useEffect(() => {
    if (!youtubeId || !frameHost) return;
    return titleFrames(frameHost, YOUTUBE_FRAME_TITLE);
  }, [youtubeId, frameHost]);

  const handleTimeUpdate = useCallback(() => {
    if (onProgress && playerRef.current) {
      onProgress(playerRef.current.currentTime);
    }
  }, [onProgress]);

  if (!src) return null;

  return (
    <Box>
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
              ref={attachPlayer}
              src={src}
              width="100%"
              height="100%"
              controls
              poster={posterUrl}
              onCanPlay={handleReady}
              onTimeUpdate={handleTimeUpdate}
            >
              {/* No `default`: the track is offered in the player's
                  own captions menu rather than switched on when the
                  video loads. WCAG 2.1 AA asks that captions exist and
                  can be turned on, not that they start on, and every
                  player a learner already knows behaves this way. */}
              <track
                kind="captions"
                src={captionsUrl}
                srcLang="en"
                label="English"
              />
            </ReactPlayer>
          ) : (
            <ReactPlayer
              ref={attachPlayer}
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
      {canSwitch && (
        <Box className={classes.qualityBar}>
          <SegmentedControl
            size="xs"
            value={quality}
            onChange={handleQualityChange}
            data={[
              { label: "720p", value: "720p" },
              { label: "1080p", value: "1080p" },
            ]}
            aria-label="Video quality"
          />
        </Box>
      )}
    </Box>
  );
}
