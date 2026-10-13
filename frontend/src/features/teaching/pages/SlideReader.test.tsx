/**
 * Tests for the SlideReader page's Previous, Next and Finish buttons.
 *
 * jsdom has no screen, so useMediaQuery reports a desktop width. That is
 * the case these cover: the buttons were once phone-only, leaving a
 * desktop learner the side list and the arrow keys and no Finish.
 */

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  type Mock,
  afterEach,
} from "vitest";
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

vi.mock("@/components/navigation/teaching/TeachingMainNav", () => ({
  default: () => null,
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

describe("SlideReader with no slide to show", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the 404 page when the module is not there for this person", async () => {
    (getModuleSlides as Mock).mockResolvedValue(null);
    renderAt(0);
    expect(await screen.findByText("404 - Page not found")).toBeInTheDocument();
    expect(screen.queryByText("This lesson could not be loaded")).toBeNull();
  });

  it("shows the 404 page when the module has no slides", async () => {
    (getModuleSlides as Mock).mockResolvedValue([]);
    renderAt(0);
    expect(await screen.findByText("404 - Page not found")).toBeInTheDocument();
  });

  it("says the lesson could not be loaded when the fetch fails", async () => {
    (getModuleSlides as Mock).mockRejectedValue(new Error("network"));
    renderAt(0);
    expect(
      await screen.findByText("This lesson could not be loaded"),
    ).toBeInTheDocument();
    expect(screen.queryByText("404 - Page not found")).toBeNull();
  });
});

describe("SlideReader arrow keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getModuleSlides as Mock).mockResolvedValue(slides);
  });

  afterEach(() => {
    document.querySelectorAll("[data-added-by-test]").forEach((el) => {
      el.remove();
    });
  });

  /** Something on the page that a key can be pressed in. */
  function onThePage(tag: string): HTMLElement {
    const element = document.createElement(tag);
    element.setAttribute("data-added-by-test", "");
    document.body.appendChild(element);

    return element;
  }

  it("moves to the next slide on the right arrow", async () => {
    renderAt(0);
    await screen.findByRole("heading", { name: "Introduction" });

    fireEvent.keyDown(document.body, { key: "ArrowRight" });

    expect(
      await screen.findByRole("heading", { name: "Systematic approach" }),
    ).toBeInTheDocument();
  });

  it("moves back on the left arrow", async () => {
    renderAt(1);
    await screen.findByRole("heading", { name: "Systematic approach" });

    fireEvent.keyDown(document.body, { key: "ArrowLeft" });

    expect(
      await screen.findByRole("heading", { name: "Introduction" }),
    ).toBeInTheDocument();
  });

  it.each(["video", "input", "textarea"])(
    "leaves the slide alone when the arrow is pressed in a %s",
    async (tag) => {
      // In a video the right arrow skips forward. It once changed the
      // slide as well, and took the delegate away from the video.
      renderAt(0);
      await screen.findByRole("heading", { name: "Introduction" });
      const within = onThePage(tag);

      const notPrevented = fireEvent.keyDown(within, { key: "ArrowRight" });

      expect(
        screen.getByRole("heading", { name: "Introduction" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Systematic approach" }),
      ).toBeNull();
      // And the key is left for the video to act on.
      expect(notPrevented).toBe(true);
    },
  );
});
