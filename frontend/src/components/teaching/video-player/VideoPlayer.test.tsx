import { describe, it, expect, vi } from "vitest";
import { renderWithMantine } from "@test/test-utils";

// Mock react-player to avoid actual YouTube embedding in tests
vi.mock("react-player", () => ({
  default: vi.fn(
    ({
      src,
      controls,
      poster,
      children,
    }: {
      src: string;
      controls: boolean;
      poster?: string;
      children?: React.ReactNode;
    }) => (
      // Children are rendered because the real component forwards them
      // to the underlying video element — which is how the caption
      // track reaches the DOM, and therefore what these tests assert.
      <div
        data-testid="react-player"
        data-src={src}
        data-controls={controls}
        data-poster={poster}
      >
        {children}
      </div>
    ),
  ),
}));

import VideoPlayer from "./VideoPlayer";

describe("VideoPlayer", () => {
  it("renders YouTube player when youtubeId is provided", async () => {
    const { findByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="dQw4w9WgXcQ" />,
    );

    const player = await findByTestId("react-player");
    expect(player).toBeInTheDocument();
    expect(player).toHaveAttribute(
      "data-src",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("renders nothing when no url or youtubeId is provided", () => {
    const { queryByTestId } = renderWithMantine(<VideoPlayer />);
    expect(queryByTestId("react-player")).not.toBeInTheDocument();
  });

  it("enables controls", async () => {
    const { findByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="dQw4w9WgXcQ" />,
    );

    const player = await findByTestId("react-player");
    expect(player).toHaveAttribute("data-controls", "true");
  });

  it("accepts onProgress callback", async () => {
    const handleProgress = vi.fn();
    const { findByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="dQw4w9WgXcQ" onProgress={handleProgress} />,
    );

    expect(await findByTestId("react-player")).toBeInTheDocument();
  });

  it("plays a hosted video from src", async () => {
    const { findByTestId } = renderWithMantine(
      <VideoPlayer src="https://x.test/videos/1/mod/lecture.mp4" />,
    );

    const player = await findByTestId("react-player");
    expect(player).toHaveAttribute(
      "data-src",
      "https://x.test/videos/1/mod/lecture.mp4",
    );
  });

  it("prefers youtubeId when both sources are given", async () => {
    const { findByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="abc123" src="https://x.test/a.mp4" />,
    );

    const player = await findByTestId("react-player");
    expect(player).toHaveAttribute(
      "data-src",
      "https://www.youtube.com/watch?v=abc123",
    );
  });

  it("renders a caption track for hosted video", async () => {
    // Captions are a WCAG 2.1 AA requirement, and whether react-player
    // could carry a <track> at all decided this component's shape.
    const { container, findByTestId } = renderWithMantine(
      <VideoPlayer
        src="https://x.test/a.mp4"
        captionsUrl="https://x.test/a.vtt"
      />,
    );

    await findByTestId("react-player");
    const track = container.querySelector("track");
    expect(track).toHaveAttribute("src", "https://x.test/a.vtt");
    expect(track).toHaveAttribute("kind", "captions");
  });

  it("hands YouTube no children at all", async () => {
    // Not the same as "no track". react-player passes `children`
    // straight into the underlying custom element, and the YouTube one
    // builds its own DOM — so even a `false` from a conditional, or the
    // whitespace around a JSX comment, is enough to render a blank
    // player. This broke slide 5 in the learning centre; the assertion
    // is on emptiness rather than on the absence of a <track>.
    const { findByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="abc123" captionsUrl="https://x.test/a.vtt" />,
    );

    const player = await findByTestId("react-player");
    expect(player).toBeEmptyDOMElement();
  });

  it("adds no caption track for YouTube, which carries its own", async () => {
    const { container, findByTestId } = renderWithMantine(
      <VideoPlayer youtubeId="abc123" captionsUrl="https://x.test/a.vtt" />,
    );

    await findByTestId("react-player");
    expect(container.querySelector("track")).toBeNull();
  });

  it("passes the poster through", async () => {
    const { findByTestId } = renderWithMantine(
      <VideoPlayer
        src="https://x.test/a.mp4"
        posterUrl="https://x.test/p.jpg"
      />,
    );

    const player = await findByTestId("react-player");
    expect(player).toHaveAttribute("data-poster", "https://x.test/p.jpg");
  });
});
