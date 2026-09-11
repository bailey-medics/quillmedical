import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import SlideLayoutSectionTitle from "./SlideLayoutSectionTitle";
import SlideLayoutVideo from "./SlideLayoutVideo";
import SlideLayoutTextWithFigure from "./SlideLayoutTextWithFigure";
import SlideLayoutDefault from "./SlideLayoutDefault";
import {
  sectionTitleSlide,
  videoSlide,
  textWithFigureSlide,
  defaultSlide,
  calloutSlide,
  hostedVideoSlide,
} from "./stubSlides";

// Mock react-player to avoid actual YouTube embedding in tests
vi.mock("react-player", () => ({
  default: vi.fn(({ url, src }: { url: string; src?: string }) => (
    <div data-testid="react-player" data-url={url} data-src={src} />
  )),
}));

// The hosted-video path asks the backend for an access grant before it
// can build a URL, so that call is mocked per test below.
const mockPost = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

describe("SlideLayoutSectionTitle", () => {
  it("renders the title", () => {
    renderWithMantine(<SlideLayoutSectionTitle slide={sectionTitleSlide} />);
    expect(screen.getByText("Colorectal Polyps")).toBeInTheDocument();
  });

  it("renders body text when provided", () => {
    renderWithMantine(<SlideLayoutSectionTitle slide={sectionTitleSlide} />);
    expect(screen.getByText(/comprehensive overview/)).toBeInTheDocument();
  });

  it("renders without body text", () => {
    renderWithMantine(
      <SlideLayoutSectionTitle
        slide={{ ...sectionTitleSlide, body: undefined }}
      />,
    );
    expect(screen.getByText("Colorectal Polyps")).toBeInTheDocument();
  });
});

describe("SlideLayoutVideo", () => {
  it("renders the title", () => {
    renderWithMantine(<SlideLayoutVideo slide={videoSlide} />);
    expect(screen.getByText("Recorded lecture")).toBeInTheDocument();
  });

  it("renders the video player", () => {
    renderWithMantine(<SlideLayoutVideo slide={videoSlide} />);
    expect(screen.getByTestId("react-player")).toBeInTheDocument();
  });

  it("asks for no grant on a YouTube slide", () => {
    mockPost.mockClear();
    renderWithMantine(<SlideLayoutVideo slide={videoSlide} moduleId="mod-1" />);
    // Public content needs no cookie, so requesting one would be waste
    // and would put a pointless 404 in the log for modules with no video.
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("plays hosted video once a grant arrives", async () => {
    mockPost.mockClear();
    mockPost.mockResolvedValue({
      base_url: "/api/teaching/videos/mod-1",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    renderWithMantine(
      <SlideLayoutVideo slide={hostedVideoSlide} moduleId="mod-1" />,
    );

    const player = await screen.findByTestId("react-player");
    // The base comes from the grant, the filename from the slide.
    expect(player).toHaveAttribute(
      "data-src",
      "/api/teaching/videos/mod-1/patient-experience.mp4",
    );
  });

  it("shows a readable message when access is refused", async () => {
    mockPost.mockClear();
    mockPost.mockRejectedValue(new Error("403"));

    renderWithMantine(
      <SlideLayoutVideo slide={hostedVideoSlide} moduleId="mod-1" />,
    );

    // An empty frame would leave the learner with nothing to act on.
    expect(await screen.findByText("Video unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("react-player")).not.toBeInTheDocument();
  });
});

describe("SlideLayoutTextWithFigure", () => {
  it("renders the title", () => {
    renderWithMantine(
      <SlideLayoutTextWithFigure slide={textWithFigureSlide} />,
    );
    expect(screen.getByText("Polyp morphology")).toBeInTheDocument();
  });

  it("renders body text", () => {
    renderWithMantine(
      <SlideLayoutTextWithFigure slide={textWithFigureSlide} />,
    );
    expect(screen.getByText(/Polypoid \(0-I\)/)).toBeInTheDocument();
  });

  it("renders the image", () => {
    renderWithMantine(
      <SlideLayoutTextWithFigure slide={textWithFigureSlide} />,
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});

describe("SlideLayoutDefault", () => {
  it("renders the title", () => {
    renderWithMantine(<SlideLayoutDefault slide={defaultSlide} />);
    expect(screen.getByText("What this module covers")).toBeInTheDocument();
  });

  it("renders body text", () => {
    renderWithMantine(<SlideLayoutDefault slide={defaultSlide} />);
    expect(screen.getByText(/short introduction/)).toBeInTheDocument();
  });

  it("renders a callout when callout props are present", () => {
    renderWithMantine(<SlideLayoutDefault slide={calloutSlide} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/chromoendoscopy/)).toBeInTheDocument();
  });
});
