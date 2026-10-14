import { describe, it, expect, vi } from "vitest";

// Neither library is booted: this file is about which component is
// chosen, and both are pinned in their own suites.
vi.mock("@videojs/react/video/skin.css", () => ({}));
vi.mock("@videojs/react/video", () => ({}));
vi.mock("@videojs/react/media/youtube-video", () => ({}));
vi.mock("react-player", () => ({ default: () => null }));

import VideoPlayerV10 from "@/components/teaching/video-player-v10/VideoPlayerV10";
import VideoPlayer from "./VideoPlayer";
import {
  ActiveVideoPlayer,
  playerFor,
  VIDEO_ENGINE,
} from "./activeVideoPlayer";

describe("activeVideoPlayer", () => {
  it("gives the Video.js v10 player for videojs", () => {
    expect(playerFor("videojs")).toBe(VideoPlayerV10);
  });

  it("gives the react-player one for react-player", () => {
    expect(playerFor("react-player")).toBe(VideoPlayer);
  });

  it("renders the player VIDEO_ENGINE names", () => {
    // The switch is one constant, so the component the app renders has
    // to follow it and nothing else.
    expect(ActiveVideoPlayer).toBe(playerFor(VIDEO_ENGINE));
  });

  it("is on Video.js v10", () => {
    // Deliberately pinned: falling back to react-player is a decision,
    // and this is what makes it show up in a diff as one.
    expect(VIDEO_ENGINE).toBe("videojs");
  });
});
