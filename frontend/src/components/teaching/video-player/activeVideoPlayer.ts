/**
 * Which video player the app renders.
 *
 * There are two, taking the same props: `VideoPlayerV10`, built on
 * Video.js v10, and `VideoPlayer`, built on `react-player`. Teaching
 * content never names either. A `<Video>` or `<YouTube>` tag in a
 * module's `content.mdx` becomes a video slide, and the slide renders
 * whichever player is chosen here.
 *
 * To fall back, change `VIDEO_ENGINE` to `"react-player"`. Nothing else
 * needs to move, and no teaching repository changes.
 */

import type { ComponentType } from "react";
import VideoPlayerV10 from "@/components/teaching/video-player-v10/VideoPlayerV10";
import VideoPlayer, { type VideoPlayerProps } from "./VideoPlayer";

/** The players the app can render. */
export type VideoEngine = "videojs" | "react-player";

/** The player in use. This is the one line to change. */
export const VIDEO_ENGINE: VideoEngine = "videojs";

const PLAYERS: Record<VideoEngine, ComponentType<VideoPlayerProps>> = {
  videojs: VideoPlayerV10,
  "react-player": VideoPlayer,
};

/** The player component for one engine. */
export function playerFor(
  engine: VideoEngine,
): ComponentType<VideoPlayerProps> {
  return PLAYERS[engine];
}

/** The player the app renders, as chosen by `VIDEO_ENGINE`. */
export const ActiveVideoPlayer = playerFor(VIDEO_ENGINE);
