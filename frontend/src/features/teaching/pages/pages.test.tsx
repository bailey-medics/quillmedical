/**
 * Tests for teaching pages.
 *
 * Pages are tested with mock API data to verify rendering
 * of loading, error, and data states.
 */

import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";

// Mock api module
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import AssessmentDashboard from "./AssessmentDashboard";
import AllResults from "./AllResults";
import SyncStatus from "./SyncStatus";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AssessmentDashboard", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRouter(<AssessmentDashboard />);
    expect(document.querySelector(".mantine-Skeleton-root")).toBeTruthy();
  });

  it("shows empty state when no banks", async () => {
    (api.get as Mock).mockResolvedValue([]);
    renderWithRouter(<AssessmentDashboard />);
    await waitFor(() => {
      expect(
        screen.getByText("No assessments are currently open."),
      ).toBeTruthy();
    });
  });

  it("renders question bank cards", async () => {
    (api.get as Mock).mockImplementation((path: string) => {
      if (path.includes("question-banks")) {
        return Promise.resolve([
          {
            id: 1,
            question_bank_id: "test-bank",
            title: "Test Bank",
            description: "A test bank",
            is_live: true,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    renderWithRouter(<AssessmentDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeTruthy();
    });
  });

  it("hides closed banks from action cards", async () => {
    (api.get as Mock).mockImplementation((path: string) => {
      if (path.includes("question-banks")) {
        return Promise.resolve([
          {
            id: 1,
            question_bank_id: "test-bank",
            title: "Closed Bank",
            description: "A closed bank",
            is_live: false,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    renderWithRouter(<AssessmentDashboard />);
    await waitFor(() => {
      expect(
        screen.getByText("No assessments are currently open."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Closed Bank")).toBeNull();
  });

  it("shows history section with heading", async () => {
    (api.get as Mock).mockResolvedValue([]);
    renderWithRouter(<AssessmentDashboard />);
    await waitFor(() => {
      expect(screen.getByText("My history")).toBeTruthy();
    });
  });

  it("shows error on API failure", async () => {
    (api.get as Mock).mockRejectedValue(new Error("Network error"));
    renderWithRouter(<AssessmentDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeTruthy();
    });
  });
});

describe("AllResults", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<AllResults />);
    expect(document.querySelector(".mantine-Skeleton-root")).toBeTruthy();
  });
});

describe("SyncStatus", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<SyncStatus />);
    expect(document.querySelector(".mantine-Skeleton-root")).toBeTruthy();
  });
});
