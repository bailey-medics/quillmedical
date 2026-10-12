/**
 * AssessmentAttempt page tests
 *
 * The page a delegate sits an exam on. These begin with how an attempt
 * is started, since starting one twice costs the delegate their first.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { PageMessageProvider } from "@/components/page-message";
import { renderWithMantine, renderWithRouter } from "@test/test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: {
        username: "test-user",
        enabled_features: ["teaching"],
        competencies: ["take_teaching_modules"],
      },
    },
    logout: vi.fn(),
  }),
}));

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
import AssessmentAttempt from "./AssessmentAttempt";

const bankWithIntro = {
  id: "colonoscopy",
  title: "Colonoscopy",
  config_yaml: {
    assessment: {
      intro_page: { title: "Before you begin", body: "Read this first." },
    },
  },
};

function renderNewAttempt() {
  return renderWithRouter(<AssessmentAttempt />, {
    routePath: "/teaching/assessment/:id",
    initialRoute: "/teaching/assessment/new?bank=colonoscopy",
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  // jsdom has no scrollTo, and the page scrolls to the top of each question
  Element.prototype.scrollTo = vi.fn();
});

describe("AssessmentAttempt, starting an exam", () => {
  it("shows the intro page and starts nothing until Begin is pressed", async () => {
    (api.get as Mock).mockResolvedValue(bankWithIntro);

    renderNewAttempt();

    expect(
      await screen.findByRole("button", { name: "Begin" }),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("starts one attempt when Begin is pressed", async () => {
    (api.get as Mock).mockResolvedValue(bankWithIntro);
    (api.post as Mock).mockReturnValue(new Promise(() => {}));

    renderNewAttempt();
    fireEvent.click(await screen.findByRole("button", { name: "Begin" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/teaching/assessments", {
        question_bank_id: "colonoscopy",
      });
    });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("starts one attempt when Begin is pressed twice in a row", async () => {
    // A double click, or a touchscreen reporting one tap as two. React
    // redraws straight after a click, before the next one is handled,
    // so the button is already disabled when the second press arrives.
    // That was checked on 11 October 2026 by adding a second guard in
    // the page itself and finding this test passes with or without it;
    // the guard was taken out again as doing nothing.
    (api.get as Mock).mockResolvedValue(bankWithIntro);
    (api.post as Mock).mockReturnValue(new Promise(() => {}));

    renderNewAttempt();
    const begin = await screen.findByRole("button", { name: "Begin" });
    fireEvent.click(begin);
    fireEvent.click(begin);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalled();
    });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("disables Begin and says it is loading once pressed", async () => {
    (api.get as Mock).mockResolvedValue(bankWithIntro);
    (api.post as Mock).mockReturnValue(new Promise(() => {}));

    renderNewAttempt();
    fireEvent.click(await screen.findByRole("button", { name: "Begin" }));

    const loading = await screen.findByRole("button", {
      name: /loading exam/i,
    });
    expect(loading).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Begin" }),
    ).not.toBeInTheDocument();
  });

  it("shows the error when the exam cannot be started", async () => {
    (api.get as Mock).mockResolvedValue(bankWithIntro);
    (api.post as Mock).mockRejectedValueOnce(new Error("Network down"));

    renderNewAttempt();
    fireEvent.click(await screen.findByRole("button", { name: "Begin" }));

    expect(
      await screen.findByText(/the exam could not be started/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Network down")).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("goes back to the intro page on Try again", async () => {
    (api.get as Mock).mockResolvedValue(bankWithIntro);
    (api.post as Mock).mockRejectedValueOnce(new Error("Network down"));

    renderNewAttempt();
    fireEvent.click(await screen.findByRole("button", { name: "Begin" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("button", { name: "Begin" }),
    ).toBeInTheDocument();
  });
});

const bankWithoutIntro = {
  id: "colonoscopy",
  title: "Colonoscopy",
  config_yaml: { assessment: {} },
};

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    question_bank_id: "colonoscopy",
    bank_version: 1,
    started_at: new Date().toISOString(),
    completed_at: null,
    time_limit_minutes: 60,
    total_items: 3,
    is_passed: null,
    score_breakdown: null,
    ...overrides,
  };
}

function question(order: number) {
  return {
    answer_id: 100 + order,
    display_order: order,
    question_type: "single",
    images: [],
    text: `Question ${order} text`,
    options: [
      { id: "a", label: "Adenoma" },
      { id: "b", label: "Hyperplastic" },
    ],
    selected_option: null,
  };
}

/**
 * Answer each GET by its address. A value that is an Error is thrown,
 * so one address can fail while the rest answer.
 */
function getsAnswer(answers: Record<string, unknown>) {
  (api.get as Mock).mockImplementation((url: string) => {
    if (!(url in answers)) {
      return Promise.reject(new Error(`No answer set for ${url}`));
    }

    const answer = answers[url];

    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer);
  });
}

function refusal(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

/** The exam beside another page, so that leaving it can be tried. */
function renderExamAt(initialRoute: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/teaching/assessment/:id",
        element: (
          <PageMessageProvider>
            <AssessmentAttempt />
          </PageMessageProvider>
        ),
      },
      { path: "/teaching/assessment/:id/result", element: <p>Result page</p> },
      { path: "/teaching", element: <p>Teaching home</p> },
    ],
    { initialEntries: [initialRoute] },
  );
  renderWithMantine(<RouterProvider router={router} />);

  return router;
}

/** An attempt under way, opened at its own address on question one. */
function resumeAttempt(overrides: Record<string, unknown> = {}) {
  getsAnswer({
    "/teaching/assessments/7": attempt(overrides),
    "/teaching/question-banks/colonoscopy": bankWithoutIntro,
    "/teaching/assessments/7/current": question(1),
  });

  return renderExamAt("/teaching/assessment/7");
}

async function chooseAndPressNext() {
  fireEvent.click(await screen.findByRole("radio", { name: "Adenoma" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

describe("AssessmentAttempt, an exam with no intro page", () => {
  it("moves to the attempt's own address as soon as it exists", async () => {
    getsAnswer({ "/teaching/question-banks/colonoscopy": bankWithoutIntro });
    (api.post as Mock).mockResolvedValue({
      assessment: attempt(),
      first_item: question(1),
    });

    const router = renderExamAt("/teaching/assessment/new?bank=colonoscopy");

    expect(await screen.findByText("Question 1 text")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/teaching/assessment/7");
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("does not load again the attempt it has just started", async () => {
    getsAnswer({ "/teaching/question-banks/colonoscopy": bankWithoutIntro });
    (api.post as Mock).mockResolvedValue({
      assessment: attempt(),
      first_item: question(1),
    });

    const router = renderExamAt("/teaching/assessment/new?bank=colonoscopy");
    await screen.findByText("Question 1 text");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/teaching/assessment/7");
    });
    // Long enough for the page to have acted on its new address
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(screen.getByText("Question 1 text")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.get).not.toHaveBeenCalledWith("/teaching/assessments/7");
    expect(api.get).not.toHaveBeenCalledWith("/teaching/assessments/7/current");
  });
});

describe("AssessmentAttempt, an attempt already under way", () => {
  it("picks it up at the question the delegate had reached", async () => {
    // Starting an exam with one still open hands that one back: a
    // reload of /new, or a second tab, gets the same paper.
    getsAnswer({ "/teaching/question-banks/colonoscopy": bankWithoutIntro });
    (api.post as Mock).mockResolvedValue({
      assessment: attempt(),
      first_item: question(2),
    });

    renderExamAt("/teaching/assessment/new?bank=colonoscopy");

    expect(await screen.findByText("Question 2 text")).toBeInTheDocument();
    expect(screen.queryByText("Question 1 text")).not.toBeInTheDocument();
  });

  it("finishes one that was answered in full and never submitted", async () => {
    getsAnswer({ "/teaching/question-banks/colonoscopy": bankWithoutIntro });
    (api.post as Mock)
      .mockResolvedValueOnce({ assessment: attempt(), first_item: null })
      .mockResolvedValueOnce({});

    renderExamAt("/teaching/assessment/new?bank=colonoscopy");

    expect(
      await screen.findByRole("button", { name: "View results" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith(
        "/teaching/assessments/7/complete",
      );
    });
  });
});

describe("AssessmentAttempt, a call that fails during the exam", () => {
  it("keeps the question and the chosen answer when an answer is not saved", async () => {
    resumeAttempt();
    (api.post as Mock).mockRejectedValueOnce(new Error("Network down"));

    await chooseAndPressNext();

    expect(
      await screen.findByText(/could not save your answer/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Question 1 text")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Adenoma" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.queryByText("Network down")).not.toBeInTheDocument();
  });

  it("still warns before leaving after a failure", async () => {
    const router = resumeAttempt();
    (api.post as Mock).mockRejectedValueOnce(new Error("Network down"));

    await chooseAndPressNext();
    await screen.findByText(/could not save your answer/i);
    void router.navigate("/teaching");

    expect(
      await screen.findByRole("button", { name: "Leave exam" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/teaching/assessment/7");
  });

  it("sends the answer again when the server is still on that question", async () => {
    resumeAttempt();
    (api.post as Mock)
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce({ all_answered: false, next_item: question(2) });

    await chooseAndPressNext();
    await screen.findByText(/could not save your answer/i);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Question 2 text")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText(/could not save your answer/i),
    ).not.toBeInTheDocument();
  });

  it("names the question in every answer, so one sent twice is stored once", async () => {
    // The answer landed and only the reply was lost. The server keeps
    // the first and answers the second as it would have the first, so
    // the page only has to send the same thing again.
    resumeAttempt();
    (api.post as Mock)
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce({ all_answered: false, next_item: question(2) });

    await chooseAndPressNext();
    await screen.findByText(/could not save your answer/i);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Question 2 text")).toBeInTheDocument();
    expect((api.post as Mock).mock.calls).toEqual([
      [
        "/teaching/assessments/7/answer",
        { selected_option: "a", answer_id: 101 },
      ],
      [
        "/teaching/assessments/7/answer",
        { selected_option: "a", answer_id: 101 },
      ],
    ]);
    expect(screen.getByRole("radio", { name: "Adenoma" })).not.toBeChecked();
  });

  it("keeps the message and the question when the answer fails again", async () => {
    resumeAttempt();
    (api.post as Mock).mockRejectedValue(new Error("Network down"));

    await chooseAndPressNext();
    await screen.findByText(/could not save your answer/i);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByText(/could not save your answer/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Question 1 text")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Adenoma" })).toBeChecked();
  });

  it("closes the exam when an answer is refused because the time is up", async () => {
    resumeAttempt();
    (api.post as Mock)
      .mockRejectedValueOnce(refusal(409))
      .mockResolvedValueOnce({});

    await chooseAndPressNext();

    expect(
      await screen.findByRole("button", { name: "View results" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/teaching/assessments/7/complete");
    });
  });

  it("offers Try again when the exam cannot be loaded, and loads it", async () => {
    getsAnswer({ "/teaching/assessments/7": new Error("Network down") });
    renderExamAt("/teaching/assessment/7");

    const tryAgain = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByText(/the exam could not be loaded/i)).toBeVisible();
    getsAnswer({
      "/teaching/assessments/7": attempt(),
      "/teaching/question-banks/colonoscopy": bankWithoutIntro,
      "/teaching/assessments/7/current": question(1),
    });
    fireEvent.click(tryAgain);

    expect(await screen.findByText("Question 1 text")).toBeInTheDocument();
  });
});

describe("AssessmentAttempt, finishing the exam", () => {
  const anHourAndABitAgo = new Date(Date.now() - 61 * 60 * 1000).toISOString();

  it("submits the exam when the time runs out", async () => {
    (api.post as Mock).mockResolvedValue({});
    resumeAttempt({ started_at: anHourAndABitAgo });

    expect(
      await screen.findByRole("button", { name: "View results" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/teaching/assessments/7/complete");
    });
  });

  it("does not submit a second time on View results", async () => {
    (api.post as Mock).mockResolvedValue({});
    const router = resumeAttempt({ started_at: anHourAndABitAgo });

    const viewResults = await screen.findByRole("button", {
      name: "View results",
    });
    await waitFor(() => expect(viewResults).toBeEnabled());
    fireEvent.click(viewResults);

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe(
      "/teaching/assessment/7/result",
    );
  });

  it("says so when the time runs out and the exam is not submitted, and tries again on View results", async () => {
    (api.post as Mock)
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce({});
    resumeAttempt({ started_at: anHourAndABitAgo });

    expect(
      await screen.findByText(/could not submit your exam/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View results" }));

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("counts an exam the server says is already finished as submitted", async () => {
    (api.post as Mock).mockRejectedValue(refusal(409));
    resumeAttempt({ started_at: anHourAndABitAgo });

    const viewResults = await screen.findByRole("button", {
      name: "View results",
    });
    await waitFor(() => expect(viewResults).toBeEnabled());
    fireEvent.click(viewResults);

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    expect(
      screen.queryByText(/could not submit your exam/i),
    ).not.toBeInTheDocument();
  });

  it("submits the exam after the last answer", async () => {
    resumeAttempt({ total_items: 1 });
    (api.post as Mock)
      .mockResolvedValueOnce({ all_answered: true, next_item: null })
      .mockResolvedValueOnce({});

    fireEvent.click(await screen.findByRole("radio", { name: "Adenoma" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit & finish" }));

    expect(
      await screen.findByRole("button", { name: "View results" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith(
        "/teaching/assessments/7/complete",
      );
    });
  });

  it("submits the exam when the delegate agrees to leave, then leaves", async () => {
    (api.post as Mock).mockResolvedValue({});
    const router = resumeAttempt();

    await screen.findByText("Question 1 text");
    void router.navigate("/teaching");
    fireEvent.click(await screen.findByRole("button", { name: "Leave exam" }));

    expect(await screen.findByText("Teaching home")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/teaching/assessments/7/complete");
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("keeps the delegate on the exam when leaving could not submit it", async () => {
    (api.post as Mock).mockRejectedValue(new Error("Network down"));
    const router = resumeAttempt();

    await screen.findByText("Question 1 text");
    void router.navigate("/teaching");
    fireEvent.click(await screen.findByRole("button", { name: "Leave exam" }));

    expect(
      await screen.findByText(/could not submit your exam/i),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/teaching/assessment/7");
    expect(screen.getByText("Question 1 text")).toBeInTheDocument();
    expect(screen.queryByText("Teaching home")).not.toBeInTheDocument();
  });

  it("submits nothing when the delegate leaves from the intro page", async () => {
    (api.get as Mock).mockResolvedValue(bankWithIntro);
    const router = renderExamAt("/teaching/assessment/new?bank=colonoscopy");

    await screen.findByRole("button", { name: "Begin" });
    void router.navigate("/teaching");
    fireEvent.click(await screen.findByRole("button", { name: "Leave exam" }));

    expect(await screen.findByText("Teaching home")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
