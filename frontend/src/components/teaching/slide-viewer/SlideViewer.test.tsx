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

vi.mock("react-player", () => ({
  default: vi.fn(({ url }: { url: string }) => (
    <div data-testid="react-player" data-url={url} />
  )),
}));

describe("SlideViewer", () => {
  it("renders section-title layout", () => {
    renderWithMantine(<SlideViewer slide={sectionTitleSlide} />);
    expect(screen.getByText("Colorectal Polyps")).toBeInTheDocument();
  });

  it("renders video-slide layout", () => {
    renderWithMantine(<SlideViewer slide={videoSlide} />);
    expect(screen.getByText("Recorded lecture")).toBeInTheDocument();
    expect(screen.getByTestId("react-player")).toBeInTheDocument();
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
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
