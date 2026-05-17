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
} from "./stubSlides";

// Mock react-player to avoid actual YouTube embedding in tests
vi.mock("react-player", () => ({
  default: vi.fn(({ url }: { url: string }) => (
    <div data-testid="react-player" data-url={url} />
  )),
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
