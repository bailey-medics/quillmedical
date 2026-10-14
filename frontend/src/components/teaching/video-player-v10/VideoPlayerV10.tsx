/**
 * VideoPlayerV10 - the teaching video player, built on Video.js v10.
 *
 * It takes the same props as `VideoPlayer`, the `react-player` one, and
 * does the same jobs: a hosted lecture or a YouTube video, a poster,
 * captions, a quality switch, resuming where the learner left off and
 * reporting how far they have got. Which of the two the app renders is
 * decided in one place, `activeVideoPlayer.ts`, so falling back is a
 * one-word change.
 *
 * Why v10: `react-player` hands playback to the browser, which draws its
 * own controls in shadow DOM. Their colours, shapes and order are the
 * browser's to decide and CSS cannot reach them. v10 builds controls
 * from ordinary elements with ordinary class names, so a play button
 * styles like any other button in the app.
 *
 * `src` is a plain URL, not a signed one. Access to hosted video is
 * carried by an `HttpOnly` cookie checked at the edge, the same contract
 * `VideoPlayer` works to.
 */

import "@videojs/react/video/skin.css";
import { YouTubeVideo } from "@videojs/react/media/youtube-video";
import { Video, VideoPlayer, VideoSkin } from "@videojs/react/video";
import { Box, SegmentedControl } from "@mantine/core";
import { useCallback, useRef, useState } from "react";
import { YOUTUBE_FRAME_TITLE } from "@/components/teaching/video-player/titleFrames";
import type { VideoPlayerProps } from "@/components/teaching/video-player/VideoPlayer";
import classes from "./VideoPlayerV10.module.css";

/** Which rendition is playing. 720p is the default everywhere. */
type Quality = "720p" | "1080p";

/**
 * Whatever is playing, as far as seeking is concerned.
 *
 * A hosted video hands back its `<video>` element and YouTube hands back
 * an adapter around its iframe. Both keep time the same way, which is
 * all resuming and the quality switch need.
 */
interface PlaybackTarget {
  currentTime: number;
  play(): Promise<void>;
}

export type VideoPlayerV10Props = VideoPlayerProps;

export default function VideoPlayerV10({
  youtubeId,
  src: hostedSrc,
  src1080p,
  posterUrl,
  captionsUrl,
  onProgress,
  resumeAt,
}: VideoPlayerV10Props) {
  const target = useRef<PlaybackTarget | null>(null);
  const hasResumed = useRef(false);
  const [quality, setQuality] = useState<Quality>("720p");
  // Where the learner was when they changed quality. Swapping `src`
  // reloads the element from zero, so the position is caught before the
  // switch and restored once the new file can play.
  const pendingSeek = useRef<number | null>(null);

  // Only hosted video has renditions, and only when the job made a
  // second one. YouTube chooses its own quality.
  const canSwitch = Boolean(!youtubeId && hostedSrc && src1080p);
  const activeSrc = canSwitch && quality === "1080p" ? src1080p : hostedSrc;

  const attachTarget = useCallback((node: PlaybackTarget | null) => {
    target.current = node;
  }, []);

  // The frame is given no title of its own and the component takes
  // none as a prop, so a screen reader would announce an anonymous
  // frame (axe `frame-title`).
  const nameFrame = useCallback((frame: HTMLIFrameElement | null) => {
    frame?.setAttribute("title", YOUTUBE_FRAME_TITLE);
  }, []);

  const handleQualityChange = useCallback((value: string) => {
    if (target.current) {
      pendingSeek.current = target.current.currentTime;
    }

    setQuality(value as Quality);
  }, []);

  const handleCanPlay = useCallback(() => {
    if (!target.current) return;

    // A pending seek wins over the resume position: it means the
    // learner was already watching and changed quality mid-lecture.
    if (pendingSeek.current !== null) {
      target.current.currentTime = pendingSeek.current;
      pendingSeek.current = null;
      void target.current.play();
      return;
    }

    if (resumeAt && !hasResumed.current) {
      target.current.currentTime = resumeAt;
      hasResumed.current = true;
    }
  }, [resumeAt]);

  const handleTimeUpdate = useCallback(() => {
    if (onProgress && target.current) {
      onProgress(target.current.currentTime);
    }
  }, [onProgress]);

  if (!youtubeId && !activeSrc) return null;

  return (
    <Box>
      <Box className={classes.wrapper}>
        <VideoPlayer>
          <VideoSkin>
            {youtubeId ? (
              // YouTube plays in an iframe, so it is its own media
              // component and not a `<Video>` given a YouTube address,
              // which loads nothing. It carries its own captions and
              // draws its own thumbnail, so it gets no track and no
              // poster.
              <YouTubeVideo
                ref={nameFrame}
                mediaRef={attachTarget}
                src={youtubeId}
                onCanPlay={handleCanPlay}
                onTimeUpdate={handleTimeUpdate}
              />
            ) : (
              <Video
                ref={attachTarget}
                src={activeSrc}
                poster={posterUrl}
                playsInline
                onCanPlay={handleCanPlay}
                onTimeUpdate={handleTimeUpdate}
              >
                {/* No `default`: the track is offered through the
                    captions button and is not switched on when the
                    video loads. WCAG 2.1 AA asks that captions exist
                    and can be turned on, not that they start on. */}
                {captionsUrl ? (
                  <track
                    kind="captions"
                    src={captionsUrl}
                    srcLang="en"
                    label="English"
                  />
                ) : null}
              </Video>
            )}
          </VideoSkin>
        </VideoPlayer>
      </Box>
      {canSwitch && (
        <Box className={classes.qualityBar}>
          <SegmentedControl
            size="xs"
            classNames={{ label: classes.qualityLabel }}
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
