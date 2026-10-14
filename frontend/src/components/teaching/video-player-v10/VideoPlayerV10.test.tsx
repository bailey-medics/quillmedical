/**
 * VideoPlayerV10 Component Tests
 *
 * These pin this component's own logic - which source it plays, that a
 * caption track reaches the player, and that resuming, progress and the
 * quality switch behave as they do in `VideoPlayer` - not Video.js
 * itself. The library is mocked for the same reason `react-player` is in
 * the sibling suite: booting a real player in jsdom tests the library,
 * not us.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, fireEvent } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";

/** What the YouTube mock was last given, so a test can drive it. */
const youtube = vi.hoisted(() => ({
  adapter: { currentTime: 0, play: () => Promise.resolve() },
  onCanPlay: undefined as (() => void) | undefined,
  onTimeUpdate: undefined as (() => void) | undefined,
}));

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
  // A real <video>, as the library renders one: the ref, the media
  // events and the caption track all reach it the way they do in the
  // browser, and those are the things worth asserting.
  //
  // The caption track arrives as `children`, so the rule cannot see one
  // here.
  Video: ({
    children,
    ...props
  }: React.VideoHTMLAttributes<HTMLVideoElement> & {
    ref?: React.Ref<HTMLVideoElement>;
  }) => (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video data-testid="v10-video" {...props}>
      {children}
    </video>
  ),
}));

vi.mock("@videojs/react/media/youtube-video", () => ({
  // The real component renders an iframe and hands the thing that keeps
  // time to `mediaRef`. React wires no media events to an iframe, so the
  // handlers are kept where a test can call them.
  YouTubeVideo: ({
    src,
    ref,
    mediaRef,
    onCanPlay,
    onTimeUpdate,
  }: {
    src: string;
    ref?: React.Ref<HTMLIFrameElement>;
    mediaRef?: (media: typeof youtube.adapter | null) => void;
    onCanPlay?: () => void;
    onTimeUpdate?: () => void;
  }) => {
    mediaRef?.(youtube.adapter);
    youtube.onCanPlay = onCanPlay;
    youtube.onTimeUpdate = onTimeUpdate;

    // No title here, as in the real component: the player names the
    // frame through `ref`, and a test asserts that it does.
    // eslint-disable-next-line jsx-a11y/iframe-has-title
    return <iframe ref={ref} data-testid="v10-youtube" data-src={src} />;
  },
}));

import VideoPlayerV10 from "./VideoPlayerV10";

/**
 * Give a jsdom `<video>` a position that can be read and set, and a
 * `play` that can be watched. jsdom implements neither.
 */
function makePlayable(video: HTMLElement, startAt = 0) {
  const play = vi.fn(() => Promise.resolve());
  Object.defineProperty(video, "currentTime", {
    value: startAt,
    writable: true,
  });
  Object.defineProperty(video, "play", { value: play });

  return { video: video as HTMLVideoElement, play };
}

describe("VideoPlayerV10", () => {
  beforeEach(() => {
    youtube.adapter = { currentTime: 0, play: () => Promise.resolve() };
    youtube.onCanPlay = undefined;
    youtube.onTimeUpdate = undefined;
  });

  it("plays a hosted source at the URL it was given", () => {
    const { getByTestId } = renderWithMantine(
      <VideoPlayerV10 src="/teaching/sample/clip.mp4" />,
    );

    expect(getByTestId("v10-video")).toHaveAttribute(
      "src",
      "/teaching/sample/clip.mp4",
    );
  });

  it("plays a YouTube id through the YouTube component", () => {
    // Not a <video> given a YouTube address, which loads nothing: that
    // is how the evaluation version of this component failed.
    const { getByTestId, queryByTestId } = renderWithMantine(
      <VideoPlayerV10 youtubeId="dQw4w9WgXcQ" />,
    );

    expect(getByTestId("v10-youtube")).toHaveAttribute(
      "data-src",
      "dQw4w9WgXcQ",
    );
    expect(queryByTestId("v10-video")).toBeNull();
  });

  it("prefers the YouTube id when both are supplied", () => {
    const { getByTestId, queryByTestId } = renderWithMantine(
      <VideoPlayerV10 youtubeId="abc123" src="/teaching/sample/clip.mp4" />,
    );

    expect(getByTestId("v10-youtube")).toHaveAttribute("data-src", "abc123");
    expect(queryByTestId("v10-video")).toBeNull();
  });

  it("names the YouTube frame for a screen reader", () => {
    const { getByTestId } = renderWithMantine(
      <VideoPlayerV10 youtubeId="abc123" />,
    );

    expect(getByTestId("v10-youtube")).toHaveAttribute(
      "title",
      "YouTube video player",
    );
  });

  it("renders nothing without a source", () => {
    // A slide with no video should render no player at all rather than
    // an empty frame. Asserted on the player rather than the container,
    // which carries the Mantine provider's own markup regardless.
    const { queryByTestId } = renderWithMantine(<VideoPlayerV10 />);

    expect(queryByTestId("v10-player")).toBeNull();
    expect(queryByTestId("v10-video")).toBeNull();
  });

  it("passes a poster through", () => {
    const { getByTestId } = renderWithMantine(
      <VideoPlayerV10 src="/clip.mp4" posterUrl="/poster.png" />,
    );

    expect(getByTestId("v10-video")).toHaveAttribute("poster", "/poster.png");
  });

  describe("captions", () => {
    it("renders a caption track when given one", () => {
      // Captions are a WCAG 2.1 AA requirement.
      const { getByTestId } = renderWithMantine(
        <VideoPlayerV10 src="/clip.mp4" captionsUrl="/captions.vtt" />,
      );

      const track = getByTestId("v10-video").querySelector("track");
      expect(track).toHaveAttribute("src", "/captions.vtt");
      expect(track).toHaveAttribute("kind", "captions");
    });

    it("does not switch the captions on by itself", () => {
      // As in `VideoPlayer`: the track is offered and not turned on. The
      // assertion exists to stop `default` drifting back in unnoticed,
      // which is what the evaluation version of this component had.
      const { getByTestId } = renderWithMantine(
        <VideoPlayerV10 src="/clip.mp4" captionsUrl="/captions.vtt" />,
      );

      expect(
        getByTestId("v10-video").querySelector("track"),
      ).not.toHaveAttribute("default");
    });

    it("renders no track when there are no captions", () => {
      const { getByTestId } = renderWithMantine(
        <VideoPlayerV10 src="/clip.mp4" />,
      );

      expect(getByTestId("v10-video").querySelector("track")).toBeNull();
    });

    it("adds no caption track for YouTube, which carries its own", () => {
      const { container } = renderWithMantine(
        <VideoPlayerV10 youtubeId="abc123" captionsUrl="/captions.vtt" />,
      );

      expect(container.querySelector("track")).toBeNull();
    });
  });

  describe("resume and progress", () => {
    it("starts a hosted video where the learner left off", () => {
      const { getByTestId } = renderWithMantine(
        <VideoPlayerV10 src="/clip.mp4" resumeAt={95} />,
      );
      const { video } = makePlayable(getByTestId("v10-video"));

      fireEvent.canPlay(video);

      expect(video.currentTime).toBe(95);
    });

    it("resumes once, and leaves later seeks alone", () => {
      // The browser reports it can play again after every seek. Jumping
      // back each time would trap the learner at the resume position.
      const { getByTestId } = renderWithMantine(
        <VideoPlayerV10 src="/clip.mp4" resumeAt={95} />,
      );
      const { video } = makePlayable(getByTestId("v10-video"));

      fireEvent.canPlay(video);
      video.currentTime = 300;
      fireEvent.canPlay(video);

      expect(video.currentTime).toBe(300);
    });

    it("starts a YouTube video where the learner left off", () => {
      renderWithMantine(<VideoPlayerV10 youtubeId="abc123" resumeAt={30} />);

      act(() => youtube.onCanPlay?.());

      expect(youtube.adapter.currentTime).toBe(30);
    });

    it("reports the position of a hosted video as it plays", () => {
      const onProgress = vi.fn();
      const { getByTestId } = renderWithMantine(
        <VideoPlayerV10 src="/clip.mp4" onProgress={onProgress} />,
      );
      const { video } = makePlayable(getByTestId("v10-video"), 12);

      fireEvent.timeUpdate(video);

      expect(onProgress).toHaveBeenCalledWith(12);
    });

    it("reports the position of a YouTube video as it plays", () => {
      const onProgress = vi.fn();
      renderWithMantine(
        <VideoPlayerV10 youtubeId="abc123" onProgress={onProgress} />,
      );
      youtube.adapter.currentTime = 48;

      act(() => youtube.onTimeUpdate?.());

      expect(onProgress).toHaveBeenCalledWith(48);
    });
  });

  describe("quality switch", () => {
    const SRC_720 = "https://x.test/a-720p.mp4";
    const SRC_1080 = "https://x.test/a-1080p.mp4";

    it("offers no control when there is only one rendition", () => {
      const { queryByLabelText } = renderWithMantine(
        <VideoPlayerV10 src={SRC_720} />,
      );

      expect(queryByLabelText("Video quality")).not.toBeInTheDocument();
    });

    it("offers a control when a 1080p rendition exists", () => {
      const { getByLabelText } = renderWithMantine(
        <VideoPlayerV10 src={SRC_720} src1080p={SRC_1080} />,
      );

      expect(getByLabelText("Video quality")).toBeInTheDocument();
    });

    it("gives each quality option the class that makes it 44px tall on phones", () => {
      const { getByText } = renderWithMantine(
        <VideoPlayerV10 src={SRC_720} src1080p={SRC_1080} />,
      );

      expect(getByText("1080p").closest("label")?.className).toMatch(
        /qualityLabel/,
      );
    });

    it("offers no control for YouTube, which has its own", () => {
      const { queryByLabelText } = renderWithMantine(
        <VideoPlayerV10 youtubeId="abc123" src1080p={SRC_1080} />,
      );

      expect(queryByLabelText("Video quality")).not.toBeInTheDocument();
    });

    it("starts on 720p", () => {
      // Hospital wifi is the common case, so the default is the
      // smaller file rather than the best available.
      const { getByTestId } = renderWithMantine(
        <VideoPlayerV10 src={SRC_720} src1080p={SRC_1080} />,
      );

      expect(getByTestId("v10-video")).toHaveAttribute("src", SRC_720);
    });

    it("plays the 1080p file once selected", async () => {
      const user = userEvent.setup();
      const { getByTestId, getByRole } = renderWithMantine(
        <VideoPlayerV10 src={SRC_720} src1080p={SRC_1080} />,
      );

      await user.click(getByRole("radio", { name: "1080p" }));

      expect(getByTestId("v10-video")).toHaveAttribute("src", SRC_1080);
    });

    it("keeps the learner's place when the quality changes", async () => {
      // Swapping the file reloads the video from zero. Dropping someone
      // back to the start of a lecture is worse than offering no choice.
      const user = userEvent.setup();
      const { getByTestId, getByRole } = renderWithMantine(
        <VideoPlayerV10 src={SRC_720} src1080p={SRC_1080} resumeAt={10} />,
      );
      const { video, play } = makePlayable(getByTestId("v10-video"), 421);

      await user.click(getByRole("radio", { name: "1080p" }));
      video.currentTime = 0;
      fireEvent.canPlay(video);

      expect(video.currentTime).toBe(421);
      expect(play).toHaveBeenCalled();
    });
  });
});
