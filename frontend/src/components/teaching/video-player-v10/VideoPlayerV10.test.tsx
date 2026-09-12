/**
 * VideoPlayerV10 Component Tests
 *
 * These pin this component's own logic — which source it composes, and
 * that a caption track reaches the player — not Video.js itself. The
 * library is mocked for the same reason `react-player` is in the sibling
 * suite: booting a real player in jsdom tests the library, not us.
 */
import { describe, it, expect, vi } from "vitest";
import { renderWithMantine } from "@test/test-utils";

// The skin stylesheet is a side-effect import the component needs in the
// browser and jsdom cannot parse.
vi.mock("@videojs/react/video/skin.css", () => ({}));

vi.mock("@videojs/react/video", () => ({
  VideoPlayer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="v10-player">{children}</div>
  ),
  VideoSkin: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="v10-skin">{children}</div>
  ),
  // Children are rendered because that is how the caption track reaches
  // the DOM, which is the thing worth asserting.
  Video: ({
    src,
    poster,
    children,
  }: {
    src: string;
    poster?: string;
    children?: React.ReactNode;
  }) => (
    <div data-testid="v10-video" data-src={src} data-poster={poster}>
      {children}
    </div>
  ),
}));

import VideoPlayerV10 from "./VideoPlayerV10";

describe("VideoPlayerV10", () => {
  it("plays a hosted source at the URL it was given", async () => {
    const { findByTestId } = renderWithMantine(
      <VideoPlayerV10 src="/teaching/sample/clip.mp4" />,
    );

    const video = await findByTestId("v10-video");
    expect(video).toHaveAttribute("data-src", "/teaching/sample/clip.mp4");
  });

  it("builds a watch URL from a YouTube id", async () => {
    // Teaching slides carry both kinds through one component, so the
    // player has to accept an id as readily as a URL.
    const { findByTestId } = renderWithMantine(
      <VideoPlayerV10 youtubeId="dQw4w9WgXcQ" />,
    );

    const video = await findByTestId("v10-video");
    expect(video).toHaveAttribute(
      "data-src",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("prefers the YouTube id when both are supplied", async () => {
    const { findByTestId } = renderWithMantine(
      <VideoPlayerV10 youtubeId="abc123" src="/teaching/sample/clip.mp4" />,
    );

    const video = await findByTestId("v10-video");
    expect(video).toHaveAttribute(
      "data-src",
      "https://www.youtube.com/watch?v=abc123",
    );
  });

  it("passes a poster through", async () => {
    const { findByTestId } = renderWithMantine(
      <VideoPlayerV10 src="/clip.mp4" posterUrl="/poster.png" />,
    );

    const video = await findByTestId("v10-video");
    expect(video).toHaveAttribute("data-poster", "/poster.png");
  });

  it("renders a caption track when given one", async () => {
    // Captions are a WCAG 2.1 AA requirement, and whether v10 carries a
    // <track> as cleanly as the current player is the open question this
    // evaluation exists to answer.
    const { findByTestId } = renderWithMantine(
      <VideoPlayerV10 src="/clip.mp4" captionsUrl="/captions.vtt" />,
    );

    const video = await findByTestId("v10-video");
    const track = video.querySelector("track");
    expect(track).toHaveAttribute("src", "/captions.vtt");
    expect(track).toHaveAttribute("kind", "captions");
  });

  it("renders no track when there are no captions", async () => {
    const { findByTestId } = renderWithMantine(
      <VideoPlayerV10 src="/clip.mp4" />,
    );

    const video = await findByTestId("v10-video");
    expect(video.querySelector("track")).toBeNull();
  });

  it("renders nothing without a source", () => {
    // A slide with no video should render no player at all rather than
    // an empty frame. Asserted on the player rather than the container,
    // which carries the Mantine provider's own markup regardless.
    const { queryByTestId } = renderWithMantine(<VideoPlayerV10 />);
    expect(queryByTestId("v10-player")).toBeNull();
    expect(queryByTestId("v10-video")).toBeNull();
  });
});
