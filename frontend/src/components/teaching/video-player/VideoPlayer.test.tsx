import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";

// Mock react-player to avoid actual YouTube embedding in tests
vi.mock("react-player", () => ({
  default: vi.fn(
    ({
      src,
      controls,
      children,
      ref,
    }: {
      src: string;
      controls: boolean;
      children?: React.ReactNode;
      ref?: React.Ref<HTMLVideoElement>;
    }) => (
      // Children are rendered because the real component forwards them
      // to the underlying video element – which is how the caption
      // track reaches the DOM, and therefore what these tests assert.
      //
      // `poster` is deliberately not accepted. The real component hands
      // the element a fixed list of props and `poster` is not on it. An
      // earlier mock took the prop and echoed it back, so the poster
      // test passed while no hosted lecture showed one.
      //
      // The caption track arrives as `children`, as it does in the real
      // component, so the rule cannot see one here.
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        ref={ref}
        data-testid="react-player"
        data-src={src}
        data-controls={controls}
      >
        {children}
      </video>
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

  it("does not switch the captions on by itself", async () => {
    // The track is offered in the player's menu rather than turned on
    // when the video loads, which is how every player a learner
    // already knows behaves. WCAG 2.1 AA asks that captions exist and
    // can be turned on, not that they start on – so this is a
    // preference, and the assertion exists to stop `default` drifting
    // back in unnoticed.
    const { container, findByTestId } = renderWithMantine(
      <VideoPlayer
        src="https://x.test/a.mp4"
        captionsUrl="https://x.test/a.vtt"
      />,
    );

    await findByTestId("react-player");
    expect(container.querySelector("track")).not.toHaveAttribute("default");
  });

  it("hands YouTube no children at all", async () => {
    // Not the same as "no track". react-player passes `children`
    // straight into the underlying custom element, and the YouTube one
    // builds its own DOM – so even a `false` from a conditional, or the
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

  describe("poster", () => {
    it("sets the poster on the video element itself", async () => {
      // On the element, not through a prop: react-player drops a
      // `poster` prop before it reaches the video.
      const { findByTestId } = renderWithMantine(
        <VideoPlayer
          src="https://x.test/a.mp4"
          posterUrl="https://x.test/p.jpg"
        />,
      );

      const player = await findByTestId("react-player");
      await waitFor(() =>
        expect(player).toHaveAttribute("poster", "https://x.test/p.jpg"),
      );
    });

    it("sets the poster alongside a caption track", async () => {
      // The captioned player is a separate branch of the render.
      const { findByTestId } = renderWithMantine(
        <VideoPlayer
          src="https://x.test/a.mp4"
          posterUrl="https://x.test/p.jpg"
          captionsUrl="https://x.test/a.vtt"
        />,
      );

      const player = await findByTestId("react-player");
      await waitFor(() =>
        expect(player).toHaveAttribute("poster", "https://x.test/p.jpg"),
      );
    });

    it("sets no poster when none is given", async () => {
      const { findByTestId } = renderWithMantine(
        <VideoPlayer src="https://x.test/a.mp4" />,
      );

      const player = await findByTestId("react-player");
      expect(player).not.toHaveAttribute("poster");
    });

    it("follows the poster when it changes, and clears it when removed", async () => {
      const { findByTestId, rerender } = renderWithMantine(
        <VideoPlayer
          src="https://x.test/a.mp4"
          posterUrl="https://x.test/p.jpg"
        />,
      );
      const player = await findByTestId("react-player");
      await waitFor(() => expect(player).toHaveAttribute("poster"));

      rerender(
        <VideoPlayer
          src="https://x.test/a.mp4"
          posterUrl="https://x.test/q.jpg"
        />,
      );
      await waitFor(() =>
        expect(player).toHaveAttribute("poster", "https://x.test/q.jpg"),
      );

      rerender(<VideoPlayer src="https://x.test/a.mp4" />);
      await waitFor(() => expect(player).not.toHaveAttribute("poster"));
    });

    it("leaves YouTube to draw its own thumbnail", async () => {
      const { findByTestId } = renderWithMantine(
        <VideoPlayer youtubeId="abc123" posterUrl="https://x.test/p.jpg" />,
      );

      const player = await findByTestId("react-player");
      expect(player).not.toHaveAttribute("poster");
    });
  });

  describe("quality switch", () => {
    const SRC_720 = "https://x.test/a-720p.mp4";
    const SRC_1080 = "https://x.test/a-1080p.mp4";

    it("offers no control when there is only one rendition", async () => {
      // The common case: a source too short to warrant 1080p gets no
      // second file, and must not be offered a choice it cannot make.
      const { findByTestId, queryByLabelText } = renderWithMantine(
        <VideoPlayer src={SRC_720} />,
      );

      await findByTestId("react-player");
      expect(queryByLabelText("Video quality")).not.toBeInTheDocument();
    });

    it("offers a control when a 1080p rendition exists", async () => {
      const { findByTestId, getByLabelText } = renderWithMantine(
        <VideoPlayer src={SRC_720} src1080p={SRC_1080} />,
      );

      await findByTestId("react-player");
      expect(getByLabelText("Video quality")).toBeInTheDocument();
    });

    it("gives each quality option the class that makes it 44px tall on phones", async () => {
      const { findByTestId, getByText } = renderWithMantine(
        <VideoPlayer src={SRC_720} src1080p={SRC_1080} />,
      );

      await findByTestId("react-player");
      expect(getByText("1080p").closest("label")?.className).toMatch(
        /qualityLabel/,
      );
    });

    it("offers no control for YouTube, which has its own", async () => {
      const { findByTestId, queryByLabelText } = renderWithMantine(
        <VideoPlayer youtubeId="abc123" src1080p={SRC_1080} />,
      );

      await findByTestId("react-player");
      expect(queryByLabelText("Video quality")).not.toBeInTheDocument();
    });

    it("starts on 720p", async () => {
      // Hospital wifi is the common case, so the default is the
      // smaller file rather than the best available.
      const { findByTestId } = renderWithMantine(
        <VideoPlayer src={SRC_720} src1080p={SRC_1080} />,
      );

      const player = await findByTestId("react-player");
      expect(player).toHaveAttribute("data-src", SRC_720);
    });

    it("plays the 1080p file once selected", async () => {
      const user = userEvent.setup();
      const { findByTestId, getByRole } = renderWithMantine(
        <VideoPlayer src={SRC_720} src1080p={SRC_1080} />,
      );

      await findByTestId("react-player");
      await user.click(getByRole("radio", { name: "1080p" }));

      expect(await findByTestId("react-player")).toHaveAttribute(
        "data-src",
        SRC_1080,
      );
    });
  });
});
