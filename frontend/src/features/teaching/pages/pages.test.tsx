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

// Mock useAuth for TeachingLayout.
//
// `enabled_features` and `competencies` are what the sidebar's entries
// are gated on, so without them `TeachingMainNav` renders an empty list
// and a test asserting the sidebar is present could not tell a working
// sidebar from a missing one.
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: {
        username: "test-user",
        enabled_features: ["teaching", "passport"],
        competencies: ["assess_clinician_passport", "passport_write"],
      },
    },
    logout: vi.fn(),
  }),
}));

// Mock connectivity and forced-reload hooks used by TeachingLayout
vi.mock("@lib/connectivity", () => ({
  useConnectivity: () => ({
    isOnline: true,
    isReconnected: false,
    lastSyncedAt: null,
  }),
}));

vi.mock("@lib/compat-generation", () => ({
  useForcedReload: () => ({ phase: "idle" }),
}));

import { api } from "@/lib/api";
import TeachingDashboard from "./TeachingDashboard";
import LearningDashboard from "./LearningDashboard";
import SyncStatus from "./SyncStatus";
import AssessmentResultPage from "./AssessmentResultPage";
import AssessmentQuestionResultsPage from "./AssessmentQuestionResultsPage";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeachingDashboard", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRouter(<TeachingDashboard />);
    expect(document.querySelector(".mantine-Skeleton-root")).toBeTruthy();
  });

  it("shows the sidebar while the dashboard is still loading", async () => {
    // The layout was rendered with no sidebar at all until both API
    // calls returned, so arriving from a main page meant the whole left
    // column vanished for two round trips and then reappeared. The
    // sidebar needs auth, which has already resolved, not the banks.
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<TeachingDashboard />);

    expect(document.querySelector(".mantine-Skeleton-root")).toBeTruthy();
    // `findAllByText`, not `findByText`: the layout renders the nav
    // twice, once as the sidebar and once inside the mobile drawer.
    expect((await screen.findAllByText("Passport")).length).toBeGreaterThan(0);
  });

  it("shows the page title while loading rather than a skeleton of it", async () => {
    // "Teaching modules" is a constant and never waited on the fetch,
    // but a skeleton stood in for it anyway – so the title appeared to
    // flash as a grey bar was swapped for the words it was always
    // going to say. Skeletons belong where the content is unknown.
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<TeachingDashboard />);

    expect(await screen.findByText("Teaching modules")).toBeTruthy();
  });

  it("shows empty state when no banks", async () => {
    (api.get as Mock).mockResolvedValue([]);
    renderWithRouter(<TeachingDashboard />);
    await waitFor(() => {
      expect(
        screen.getByText("No assessments are currently open"),
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
    renderWithRouter(<TeachingDashboard />);
    await waitFor(() => {
      expect(screen.getAllByText("Test Bank").length).toBeGreaterThanOrEqual(1);
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
    renderWithRouter(<TeachingDashboard />);
    await waitFor(() => {
      expect(
        screen.getByText("No assessments are currently open"),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Closed Bank")).toBeNull();
  });

  it("shows history section with heading", async () => {
    (api.get as Mock).mockResolvedValue([]);
    renderWithRouter(<TeachingDashboard />);
    await waitFor(() => {
      expect(screen.getByText("My history")).toBeTruthy();
    });
  });

  it("shows error on API failure", async () => {
    (api.get as Mock).mockRejectedValue(new Error("Network error"));
    renderWithRouter(<TeachingDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeTruthy();
    });
  });
});

describe("SyncStatus", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<SyncStatus />);
    expect(document.querySelector(".mantine-Skeleton-root")).toBeTruthy();
  });
});

describe("LearningDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<LearningDashboard />);
    expect(document.querySelector(".mantine-Skeleton-root")).toBeTruthy();
  });

  it("shows an empty state when nothing is visible", async () => {
    // The right answer for a learner whose organisations have no live
    // modules – not an error, and it says nothing about what exists
    // elsewhere.
    (api.get as Mock).mockResolvedValue([]);
    renderWithRouter(<LearningDashboard />);
    await waitFor(() => {
      expect(screen.getByText("No learning modules available")).toBeTruthy();
    });
  });

  it("shows an error rather than loading for ever", async () => {
    // Without a catch the page sat on skeletons indefinitely with an
    // unhandled rejection in the console, which to a learner looks
    // exactly like a slow network.
    (api.get as Mock).mockRejectedValue(new Error("Network down"));
    renderWithRouter(<LearningDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Error loading modules")).toBeTruthy();
    });
    expect(document.querySelector(".mantine-Skeleton-root")).toBeFalsy();
  });
});

describe("AssessmentResultPage", () => {
  const assessment = {
    id: 7,
    question_bank_id: "test-bank",
    bank_version: 2,
    started_at: "2026-09-27T09:00:00Z",
    completed_at: "2026-09-27T10:00:00Z",
    time_limit_minutes: 60,
    total_items: 3,
    is_passed: false,
    score_breakdown: { criteria: [] },
  };

  function mockResult() {
    (api.get as Mock).mockImplementation((path: string) =>
      path.startsWith("/teaching/assessments/")
        ? Promise.resolve(assessment)
        : Promise.resolve({
            title: "Test Bank",
            config_yaml: {},
            is_live: true,
          }),
    );
  }

  it("shows the teaching side navigation", async () => {
    mockResult();
    renderWithRouter(<AssessmentResultPage />, {
      routePath: "/teaching/assessment/:id/result",
      initialRoute: "/teaching/assessment/7/result",
    });

    expect((await screen.findAllByText("Passport")).length).toBeGreaterThan(0);
  });

  it("shows the side navigation while loading", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<AssessmentResultPage />, {
      routePath: "/teaching/assessment/:id/result",
      initialRoute: "/teaching/assessment/7/result",
    });

    expect(screen.getAllByText("Passport").length).toBeGreaterThan(0);
  });

  it("links to the results by question", async () => {
    mockResult();
    renderWithRouter(<AssessmentResultPage />, {
      routePath: "/teaching/assessment/:id/result",
      initialRoute: "/teaching/assessment/7/result",
    });

    const link = await screen.findByRole("link", {
      name: "View results by question",
    });
    expect(link).toHaveAttribute(
      "href",
      "/teaching/assessment/7/question-results",
    );
  });
});

describe("AssessmentQuestionResultsPage", () => {
  const results = {
    assessment_id: 7,
    question_bank_id: "test-bank",
    bank_version: 2,
    bank_title: "Test Bank",
    exam_ref: "EX-0007",
    completed_at: "2026-09-27T10:00:00Z",
    is_passed: false,
    criteria: [
      {
        name: "High confidence rate",
        value: 0.78,
        threshold: 0.7,
        passed: true,
      },
      {
        name: "High confidence accuracy",
        value: 0.6667,
        threshold: 0.8,
        passed: false,
      },
    ],
    questions: [
      {
        question_number: 1,
        question_ref: "question_001",
        display_order: 3,
        answered: true,
        selected_answer: "High confidence adenoma",
        is_correct: true,
        answered_at: "2026-09-27T09:10:00Z",
      },
      {
        question_number: 2,
        question_ref: "question_002",
        display_order: 1,
        answered: true,
        selected_answer: "Low confidence serrated",
        is_correct: false,
        answered_at: "2026-09-27T09:05:00Z",
      },
    ],
  };

  function renderPage() {
    return renderWithRouter(<AssessmentQuestionResultsPage />, {
      routePath: "/teaching/assessment/:id/question-results",
      initialRoute: "/teaching/assessment/7/question-results",
    });
  }

  it("asks for this attempt's results", async () => {
    (api.get as Mock).mockResolvedValue(results);
    renderPage();

    await screen.findAllByText("Question 1");
    expect(api.get).toHaveBeenCalledWith(
      "/teaching/assessments/7/question-results",
    );
  });

  it("shows the bank version, exam reference and outcome", async () => {
    (api.get as Mock).mockResolvedValue(results);
    renderPage();

    expect(
      await screen.findByText("Question bank version: 2"),
    ).toBeInTheDocument();
    expect(screen.getByText("Exam reference: EX-0007")).toBeInTheDocument();
    expect(screen.getByText("Overall: Not passed")).toBeInTheDocument();
    // The module's name is now in the menu as well, as the link this
    // page is nested under, so the one being checked is the one on the
    // page itself.
    const onThePage = screen
      .getAllByText("Test Bank")
      .filter((element) => !element.closest(".mantine-NavLink-root"));
    expect(onThePage).toHaveLength(1);
  });

  it("is nested in the menu under its result and its module", async () => {
    (api.get as Mock).mockResolvedValue(results);
    renderPage();

    await screen.findByText("Question bank version: 2");
    // The sidebar and the drawer each draw the menu, so each link is
    // found at least once.
    const inTheMenu = (label: string) =>
      screen
        .getAllByText(label)
        .filter((element) => element.closest(".mantine-NavLink-root"));
    expect(inTheMenu("Test Bank").length).toBeGreaterThan(0);
    expect(inTheMenu("Result").length).toBeGreaterThan(0);
    expect(inTheMenu("Results by question").length).toBeGreaterThan(0);
  });

  it("says the table is in stored order, not the order the questions were seen", async () => {
    (api.get as Mock).mockResolvedValue(results);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Questions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not the order in which you saw them/),
    ).toBeInTheDocument();
  });

  it("lists each question by its number", async () => {
    (api.get as Mock).mockResolvedValue(results);
    renderPage();

    expect((await screen.findAllByText("Question 1")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Question 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pass").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fail").length).toBeGreaterThan(0);
  });

  it("shows the percentage scored on each pass criterion", async () => {
    (api.get as Mock).mockResolvedValue(results);
    renderPage();

    expect(
      await screen.findByText("High confidence rate: 78.0%"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("High confidence accuracy: 66.7%"),
    ).toBeInTheDocument();
  });

  it("shows no criteria for an attempt never scored", async () => {
    (api.get as Mock).mockResolvedValue({ ...results, criteria: [] });
    renderPage();

    await screen.findByText("Question bank version: 2");
    expect(screen.queryByText(/High confidence rate/)).not.toBeInTheDocument();
  });

  it("shows no exam reference line when there is none", async () => {
    (api.get as Mock).mockResolvedValue({ ...results, exam_ref: null });
    renderPage();

    await screen.findByText("Question bank version: 2");
    expect(screen.queryByText(/Exam reference/)).not.toBeInTheDocument();
  });

  it("shows an error when the attempt cannot be loaded", async () => {
    (api.get as Mock).mockRejectedValue(
      new Error("Assessment is not complete"),
    );
    renderPage();

    expect(
      await screen.findByText("Assessment is not complete"),
    ).toBeInTheDocument();
  });

  it("shows the teaching side navigation", async () => {
    (api.get as Mock).mockResolvedValue(results);
    renderPage();

    expect((await screen.findAllByText("Passport")).length).toBeGreaterThan(0);
  });
});
