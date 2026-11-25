/**
 * Tests for the module page's "Start assessment" card.
 *
 * A module may keep its assessment locked until every learning video
 * has been played. The page reads which videos are left from
 * `videos_to_play` on the module's row in `/teaching/question-banks`,
 * greys out the button while any are, and says why beneath it.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderWithRouter } from "@test/test-utils";
import type { QuestionBank } from "@/features/teaching/types";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

// The layout and its navigation carry auth concerns of their own,
// none of which this card depends on
vi.mock("@/components/layouts/TeachingLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/navigation/teaching/TeachingMainNav", () => ({
  default: () => null,
}));

import { api } from "@/lib/api";
import TeachingModuleMain from "./TeachingModuleMain";

const LOCKED = "Complete the learning section first";

function bank(overrides: Partial<QuestionBank> = {}): QuestionBank {
  return {
    id: 1,
    question_bank_id: "polyps",
    version: 1,
    title: "Polyps",
    description: "Optical diagnosis.",
    type: "uniform",
    synced_at: "2026-11-25T10:00:00Z",
    is_live: true,
    has_learning: true,
    cover_image_url: null,
    cover_image_focus: null,
    videos_to_play: [],
    ...overrides,
  };
}

function renderWith(row: QuestionBank) {
  vi.mocked(api.get).mockResolvedValue([row]);

  return renderWithRouter(<TeachingModuleMain />, {
    routePath: "/teaching/:bankId",
    initialRoute: "/teaching/polyps",
  });
}

describe("TeachingModuleMain's Start assessment card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is disabled, and says why, while a video is unplayed", async () => {
    renderWith(bank({ videos_to_play: ["video-2"] }));

    const start = await screen.findByRole("button", {
      name: "Start assessment",
    });

    expect(start).toBeDisabled();
    expect(screen.getByText(LOCKED)).toBeInTheDocument();
  });

  it("is enabled once every video is played", async () => {
    renderWith(bank());

    const start = await screen.findByRole("button", {
      name: "Start assessment",
    });

    expect(start).toBeEnabled();
    expect(screen.queryByText(LOCKED)).toBeNull();
  });

  it("is enabled when the backend says nothing about videos", async () => {
    renderWith(bank({ videos_to_play: undefined }));

    const start = await screen.findByRole("button", {
      name: "Start assessment",
    });

    expect(start).toBeEnabled();
  });

  it("locks the full-width card too, on a module with no learning pages", async () => {
    renderWith(bank({ has_learning: false, videos_to_play: ["video-1"] }));

    const start = await screen.findByRole("button", {
      name: "Start assessment",
    });

    expect(start).toBeDisabled();
    expect(screen.getByText(LOCKED)).toBeInTheDocument();
  });
});
