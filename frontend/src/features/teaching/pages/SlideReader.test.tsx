/**
 * Tests for the SlideReader page's Previous, Next and Finish buttons.
 *
 * jsdom has no screen, so useMediaQuery reports a desktop width. That is
 * the case these cover: the buttons were once phone-only, leaving a
 * desktop learner the side list and the arrow keys and no Finish.
 */

import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderWithRouter } from "@test/test-utils";
import type { CompiledSlide } from "@/features/teaching/types";

vi.mock("@/features/teaching/learning-data", () => ({
  getModuleSlides: vi.fn(),
}));

// The layout and viewer carry auth, video and MDX concerns of their own,
// none of which these buttons depend on
vi.mock("@/components/layouts/TeachingLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/teaching/slide-viewer/SlideViewer", () => ({
  default: ({ slide }: { slide: CompiledSlide }) => <h1>{slide.title}</h1>,
}));

import { getModuleSlides } from "@/features/teaching/learning-data";
import SlideReader from "./SlideReader";

const slides: CompiledSlide[] = [
  { slideIndex: 0, layout: "section-title", title: "Introduction" },
  { slideIndex: 1, layout: "text-with-figure", title: "Systematic approach" },
  { slideIndex: 2, layout: "section-title", title: "Summary" },
];

function renderAt(slideIndex: number) {
  return renderWithRouter(<SlideReader />, {
    routePath: "/teaching/learn/:moduleId/slide/:slideIndex",
    initialRoute: `/teaching/learn/cxr/slide/${slideIndex}`,
  });
}

describe("SlideReader buttons on a desktop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getModuleSlides as Mock).mockResolvedValue(slides);
  });

  it("shows Next, and no Previous, on the first slide", async () => {
    renderAt(0);
    expect(
      await screen.findByRole("button", { name: "Next" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
  });

  it("moves to the next slide when Next is pressed", async () => {
    renderAt(0);
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(
      await screen.findByRole("heading", { name: "Systematic approach" }),
    ).toBeInTheDocument();
  });

  it("moves back when Previous is pressed", async () => {
    renderAt(1);
    fireEvent.click(await screen.findByRole("button", { name: "Previous" }));
    expect(
      await screen.findByRole("heading", { name: "Introduction" }),
    ).toBeInTheDocument();
  });

  it("offers Finish instead of Next on the last slide", async () => {
    renderAt(2);
    expect(
      await screen.findByRole("button", { name: "Finish" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });
});
