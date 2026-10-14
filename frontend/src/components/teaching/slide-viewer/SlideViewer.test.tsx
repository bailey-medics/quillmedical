import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import SlideViewer from "./SlideViewer";
import {
  sectionTitleSlide,
  videoSlide,
  imageSlide,
  textWithFigureSlide,
  defaultSlide,
  calloutSlide,
} from "@/components/teaching/slide-layouts/stubSlides";

// The player is stubbed through the switch that chooses it, so this
// suite is true whichever player is in use.
vi.mock("@/components/teaching/video-player/activeVideoPlayer", () => ({
  ActiveVideoPlayer: () => <div data-testid="video-player" />,
}));

describe("SlideViewer", () => {
  it("renders section-title layout", () => {
    renderWithMantine(<SlideViewer slide={sectionTitleSlide} />);
    expect(screen.getByText("Colorectal Polyps")).toBeInTheDocument();
  });

  it("renders video-slide layout", async () => {
    renderWithMantine(<SlideViewer slide={videoSlide} />);
    expect(screen.getByText("Recorded lecture")).toBeInTheDocument();
    expect(await screen.findByTestId("video-player")).toBeInTheDocument();
  });

  it("renders image-slide layout", () => {
    renderWithMantine(<SlideViewer slide={imageSlide} />);
    expect(
      screen.getByText("Paris classification overview"),
    ).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("renders text-with-figure layout", () => {
    renderWithMantine(<SlideViewer slide={textWithFigureSlide} />);
    expect(screen.getByText("Polyp morphology")).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("renders default layout", () => {
    renderWithMantine(<SlideViewer slide={defaultSlide} />);
    expect(screen.getByText("What this module covers")).toBeInTheDocument();
  });

  it("renders default layout with callout", () => {
    renderWithMantine(<SlideViewer slide={calloutSlide} />);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });
});
