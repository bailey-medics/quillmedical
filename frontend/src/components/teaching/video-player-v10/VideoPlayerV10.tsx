/**
 * VideoPlayerV10 — an evaluation of Video.js v10, not a production player.
 *
 * `VideoPlayer` remains what the app uses. This exists so the v10 controls
 * can be seen and styled in Storybook beside them, because the question
 * that matters — whether its controls are genuinely ours to restyle —
 * cannot be answered from documentation.
 *
 * **Nothing in the application imports this.** The dependency is a release
 * candidate with breaking changes still landing, so it is deliberately
 * kept out of every render path a learner reaches. Stories only.
 *
 * Why it is being evaluated at all: `react-player` hands playback to the
 * browser, which draws its own controls in shadow DOM. Their colours,
 * shapes and order are the browser's to decide and CSS cannot reach them.
 * v10 builds controls from ordinary elements with ordinary class names,
 * so a play button styles like any other button in the app.
 *
 * See the Video.js v10 entry in `docs/docs/plans/todo.md`.
 */

import "@videojs/react/video/skin.css";
import { Video, VideoPlayer, VideoSkin } from "@videojs/react/video";
import { Box } from "@mantine/core";
import classes from "./VideoPlayerV10.module.css";

export interface VideoPlayerV10Props {
  /**
   * Full URL of a hosted video.
   *
   * Not a signed URL: access is carried by an `HttpOnly` cookie checked
   * at the edge, so this is an ordinary address that happens to require
   * one — the same contract `VideoPlayer` works to.
   */
  src?: string;
  /** YouTube video ID. v10 reads YouTube through `@videojs/youtube-video`. */
  youtubeId?: string;
  /** Poster image, shown before playback begins. */
  posterUrl?: string;
  /**
   * WebVTT captions URL. A WCAG 2.1 AA requirement, and the open
   * question in this evaluation: whether v10 carries a `<track>` as
   * cleanly as the arrangement `VideoPlayer` arrived at.
   */
  captionsUrl?: string;
}

export default function VideoPlayerV10({
  src,
  youtubeId,
  posterUrl,
  captionsUrl,
}: VideoPlayerV10Props) {
  const source = youtubeId
    ? `https://www.youtube.com/watch?v=${youtubeId}`
    : src;

  if (!source) return null;

  return (
    <Box className={classes.wrapper}>
      <VideoPlayer>
        <VideoSkin>
          <Video src={source} poster={posterUrl} playsInline>
            {captionsUrl ? (
              <track
                kind="captions"
                src={captionsUrl}
                srcLang="en"
                label="English"
                default
              />
            ) : null}
          </Video>
        </VideoSkin>
      </VideoPlayer>
    </Box>
  );
}
