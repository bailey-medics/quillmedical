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
import AssessmentHistoryPage from "./AssessmentHistoryPage";
import AllResults from "./AllResults";
import SyncStatus from "./SyncStatus";
import ManageItems from "./ManageItems";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AssessmentDashboard", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRouter(<AssessmentDashboard />);
    expect(document.querySelector(".mantine-Loader-root")).toBeTruthy();
  });

  it("shows empty state when no banks", async () => {
    (api.get as Mock).mockResolvedValue([]);
    renderWithRouter(<AssessmentDashboard />);
    await waitFor(() => {
      expect(screen.getByText("No question banks available.")).toBeTruthy();
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

  it("shows error on API failure", async () => {
    (api.get as Mock).mockRejectedValue(new Error("Network error"));
    renderWithRouter(<AssessmentDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeTruthy();
    });
  });
});

describe("AssessmentHistoryPage", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<AssessmentHistoryPage />);
    expect(document.querySelector(".mantine-Loader-root")).toBeTruthy();
  });

  it("shows empty state when no history", async () => {
    (api.get as Mock).mockResolvedValue([]);
    renderWithRouter(<AssessmentHistoryPage />);
    await waitFor(() => {
      expect(screen.getByText("No assessments yet.")).toBeTruthy();
    });
  });
});

describe("AllResults", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<AllResults />);
    expect(document.querySelector(".mantine-Loader-root")).toBeTruthy();
  });
});

describe("SyncStatus", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<SyncStatus />);
    expect(document.querySelector(".mantine-Loader-root")).toBeTruthy();
  });
});

describe("ManageItems", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<ManageItems />);
    expect(document.querySelector(".mantine-Loader-root")).toBeTruthy();
  });
});
