/**
 * AssessmentAttempt page tests
 *
 * The page a delegate sits an exam on. These begin with how an attempt
 * is started. The server hands back an attempt already in progress on
 * the bank when one is started again, so what starting answers may be
 * part answered.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
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

/** A refusal from the server, with its own words where they matter. */
function refusal(status: number, detail = `HTTP ${status}`) {
  return Object.assign(new Error(detail), { status });
}

const OUT_OF_TIME = "Time limit exceeded";
const ALREADY_COMPLETED = "Assessment already completed";

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

describe("AssessmentAttempt, starting hands back an attempt in progress", () => {
  it("opens it at its next unanswered question, as the last when it is", async () => {
    getsAnswer({ "/teaching/question-banks/colonoscopy": bankWithoutIntro });
    (api.post as Mock).mockResolvedValue({
      assessment: attempt(),
      first_item: question(3),
    });

    const router = renderExamAt("/teaching/assessment/new?bank=colonoscopy");

    expect(await screen.findByText("Question 3 text")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Submit & finish" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(router.state.location.pathname).toBe("/teaching/assessment/7");
  });

  it("opens it part answered after Begin, with more questions to come", async () => {
    getsAnswer({ "/teaching/question-banks/colonoscopy": bankWithIntro });
    (api.post as Mock).mockResolvedValue({
      assessment: attempt(),
      first_item: question(2),
    });

    renderExamAt("/teaching/assessment/new?bank=colonoscopy");
    fireEvent.click(await screen.findByRole("button", { name: "Begin" }));

    expect(await screen.findByText("Question 2 text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("goes back through its answered questions one at a time", async () => {
    // Coming forward again from question one must stop at question
    // two, which has an answer, and not jump to the one being sat
    getsAnswer({
      "/teaching/question-banks/colonoscopy": bankWithoutIntro,
      "/teaching/assessments/7/item/2": {
        ...question(2),
        selected_option: "a",
      },
      "/teaching/assessments/7/item/1": {
        ...question(1),
        selected_option: "a",
      },
    });
    (api.post as Mock).mockResolvedValue({
      assessment: attempt(),
      first_item: question(3),
    });
    (api.put as Mock).mockResolvedValue(question(1));

    renderExamAt("/teaching/assessment/new?bank=colonoscopy");
    await screen.findByText("Question 3 text");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("Question 2 text");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("Question 1 text");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Question 2 text")).toBeInTheDocument();
  });

  it("submits it when every question already has an answer", async () => {
    getsAnswer({ "/teaching/question-banks/colonoscopy": bankWithoutIntro });
    (api.post as Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url === "/teaching/assessments"
          ? { assessment: attempt(), first_item: null }
          : {},
      ),
    );

    renderExamAt("/teaching/assessment/new?bank=colonoscopy");

    expect(
      await screen.findByRole("button", { name: "View results" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/teaching/assessments/7/complete");
    });
  });

  it("shows a new attempt that drew no questions as it did before", async () => {
    getsAnswer({ "/teaching/question-banks/colonoscopy": bankWithoutIntro });
    (api.post as Mock).mockResolvedValue({
      assessment: attempt({ total_items: 0 }),
      first_item: null,
    });

    const router = renderExamAt("/teaching/assessment/new?bank=colonoscopy");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/teaching/assessment/7");
    });
    expect(screen.queryByRole("button", { name: "View results" })).toBeNull();
    expect(api.post).toHaveBeenCalledTimes(1);
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

  it("goes to the result, with no error, when an answer is refused because the time is up", async () => {
    // The server has finished the attempt behind the refusal, so the
    // page's own submit is told it is already completed
    resumeAttempt();
    (api.post as Mock)
      .mockRejectedValueOnce(refusal(409, OUT_OF_TIME))
      .mockRejectedValueOnce(refusal(409, ALREADY_COMPLETED));

    await chooseAndPressNext();

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenLastCalledWith(
      "/teaching/assessments/7/complete",
    );
    expect(
      screen.queryByText(/could not save your answer/i),
    ).not.toBeInTheDocument();
  });

  it("goes to the result when a changed answer is refused because the time is up", async () => {
    getsAnswer({
      "/teaching/assessments/7": attempt(),
      "/teaching/question-banks/colonoscopy": bankWithoutIntro,
      "/teaching/assessments/7/current": question(2),
      "/teaching/assessments/7/item/1": question(1),
    });
    (api.put as Mock).mockRejectedValue(refusal(409, OUT_OF_TIME));
    (api.post as Mock).mockRejectedValue(refusal(409, ALREADY_COMPLETED));
    renderExamAt("/teaching/assessment/7");

    fireEvent.click(await screen.findByRole("button", { name: "Previous" }));
    await screen.findByText("Question 1 text");
    await chooseAndPressNext();

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/could not save your answer/i),
    ).not.toBeInTheDocument();
  });

  it("goes to the result when an earlier question is refused because the attempt is finished", async () => {
    getsAnswer({
      "/teaching/assessments/7": attempt(),
      "/teaching/question-banks/colonoscopy": bankWithoutIntro,
      "/teaching/assessments/7/current": question(2),
      "/teaching/assessments/7/item/1": refusal(409, ALREADY_COMPLETED),
    });
    (api.post as Mock).mockRejectedValue(refusal(409, ALREADY_COMPLETED));
    renderExamAt("/teaching/assessment/7");

    fireEvent.click(await screen.findByRole("button", { name: "Previous" }));

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    expect(
      screen.queryByText(/could not load the previous question/i),
    ).not.toBeInTheDocument();
  });

  it("closes the exam when an answer is refused because every question is answered", async () => {
    // A conflict that is not the server finishing the attempt: the
    // closing screen is shown and the exam submitted behind it
    resumeAttempt();
    (api.post as Mock)
      .mockRejectedValueOnce(refusal(409, "All items already answered"))
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

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Hold the page's clock still and its ticks in hand. Only the ticking,
   * the date and the stopwatch the countdown reads are faked: the waits
   * in these tests need real timeouts.
   */
  function holdTheClock() {
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval", "Date", "performance"],
    });
  }

  /** Let one second of the page's clock pass. */
  function tick() {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }

  function startedWithSecondsLeft(seconds: number): string {
    return new Date(Date.now() - (60 * 60 - seconds) * 1000).toISOString();
  }

  /** How many times the page went to the result, by history entry. */
  function countVisitsToResult(router: ReturnType<typeof renderExamAt>) {
    const visits = new Set<string>();
    router.subscribe((state) => {
      if (state.location.pathname === "/teaching/assessment/7/result") {
        visits.add(state.location.key);
      }
    });

    return visits;
  }

  it("submits the exam once and goes to the result when the clock reaches zero", async () => {
    holdTheClock();
    (api.post as Mock).mockResolvedValue({ is_passed: false });
    const router = resumeAttempt({ started_at: startedWithSecondsLeft(2) });
    const visits = countVisitsToResult(router);

    await screen.findByText("Question 1 text");
    expect(screen.getByText("00:02")).toBeInTheDocument();
    tick();
    expect(api.post).not.toHaveBeenCalled();
    tick();
    vi.useRealTimers();

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/teaching/assessments/7/complete");
    expect(visits.size).toBe(1);
  });

  it("submits the exam and goes to the result when it is opened after its time", async () => {
    (api.post as Mock).mockResolvedValue({});
    const router = resumeAttempt({ started_at: anHourAndABitAgo });

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/teaching/assessments/7/complete");
    expect(router.state.location.pathname).toBe(
      "/teaching/assessment/7/result",
    );
  });

  it("submits once when End exam is confirmed as the clock reaches zero", async () => {
    holdTheClock();
    let answerComplete: (value: unknown) => void = () => {};
    (api.post as Mock).mockReturnValue(
      new Promise((resolve) => {
        answerComplete = resolve;
      }),
    );
    const router = resumeAttempt({ started_at: startedWithSecondsLeft(1) });
    const visits = countVisitsToResult(router);

    await screen.findByText("Question 1 text");
    fireEvent.click(screen.getByRole("button", { name: "End exam" }));
    // The confirmation has an "End exam" button of its own
    const endExam = await screen.findAllByRole("button", { name: "End exam" });
    fireEvent.click(endExam[endExam.length - 1]);
    expect(api.post).toHaveBeenCalledTimes(1);
    tick();
    vi.useRealTimers();
    await act(async () => {
      answerComplete({});
    });

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(visits.size).toBe(1);
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

  it("goes to the result when the server says the exam is already finished", async () => {
    // The server finished it first, when the time ran out
    (api.post as Mock).mockRejectedValue(refusal(409, ALREADY_COMPLETED));
    resumeAttempt({ started_at: anHourAndABitAgo });

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
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

  it("shows the timer and End exam on a timed attempt", async () => {
    resumeAttempt();

    await screen.findByText("Question 1 text");

    expect(screen.getByText(/^\d\d:\d\d$/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "End exam" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["a time limit of 0", 0],
    ["no time limit", null],
  ])(
    "shows no timer, submits nothing by itself and still offers End exam with %s",
    async (_name, limit) => {
      // Started long ago: a clock, if there were one, would have run out
      resumeAttempt({
        time_limit_minutes: limit,
        started_at: anHourAndABitAgo,
      });

      await screen.findByText("Question 1 text");
      // Long enough for a clock to have submitted the exam
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

      expect(screen.getByText("Question 1 text")).toBeInTheDocument();
      expect(screen.queryByText(/^\d\d:\d\d$/)).not.toBeInTheDocument();
      expect(screen.queryByText("Time up")).not.toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "End exam" }),
      ).toBeInTheDocument();
    },
  );

  it("submits an untimed attempt when End exam is confirmed", async () => {
    (api.post as Mock).mockResolvedValue({});
    resumeAttempt({ time_limit_minutes: 0 });

    await screen.findByText("Question 1 text");
    fireEvent.click(screen.getByRole("button", { name: "End exam" }));
    const endExam = await screen.findAllByRole("button", { name: "End exam" });
    fireEvent.click(endExam[endExam.length - 1]);

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/teaching/assessments/7/complete");
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

describe("AssessmentAttempt, the countdown", () => {
  /** A start by this computer's clock that would leave half an hour. */
  const halfAnHourAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  beforeEach(() => {
    // The countdown held still, so the time shown is the time it was set
    // to. Only its ticks and its stopwatch are faked: the waits in these
    // tests need real timeouts.
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval", "performance"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is set by the seconds the server says are left, not by this computer's clock", async () => {
    resumeAttempt({ started_at: halfAnHourAgo, seconds_left: 19 * 60 + 50 });

    await screen.findByText("Question 1 text");

    expect(screen.getByText("19:50")).toBeInTheDocument();
  });

  it("is set by the question the attempt is opened on", async () => {
    getsAnswer({
      "/teaching/assessments/7": attempt({ seconds_left: 405 }),
      "/teaching/question-banks/colonoscopy": bankWithoutIntro,
      "/teaching/assessments/7/current": { ...question(1), seconds_left: 400 },
    });
    renderExamAt("/teaching/assessment/7");

    await screen.findByText("Question 1 text");

    expect(screen.getByText("06:40")).toBeInTheDocument();
  });

  it("is set by an attempt as it is started", async () => {
    getsAnswer({ "/teaching/question-banks/colonoscopy": bankWithoutIntro });
    (api.post as Mock).mockResolvedValue({
      assessment: attempt({ seconds_left: 3600 }),
      first_item: question(1),
    });
    renderExamAt("/teaching/assessment/new?bank=colonoscopy");

    await screen.findByText("Question 1 text");

    expect(screen.getByText("60:00")).toBeInTheDocument();
  });

  it("is set afresh by the answer to each answer given", async () => {
    resumeAttempt({ seconds_left: 600 });
    (api.post as Mock).mockResolvedValue({
      answered: true,
      next_item: question(2),
      all_answered: false,
      seconds_left: 533,
    });
    await screen.findByText("Question 1 text");
    expect(screen.getByText("10:00")).toBeInTheDocument();

    await chooseAndPressNext();

    await screen.findByText("Question 2 text");
    expect(screen.getByText("08:53")).toBeInTheDocument();
  });

  it("is set afresh by a question gone back to", async () => {
    resumeAttempt({ seconds_left: 600 });
    (api.post as Mock).mockResolvedValue({
      answered: true,
      next_item: question(2),
      all_answered: false,
      seconds_left: 590,
    });
    await screen.findByText("Question 1 text");
    await chooseAndPressNext();
    await screen.findByText("Question 2 text");
    getsAnswer({
      "/teaching/assessments/7/item/1": {
        ...question(1),
        selected_option: "a",
        seconds_left: 571,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    await screen.findByText("Question 1 text");
    expect(screen.getByText("09:31")).toBeInTheDocument();
  });

  it("is left as it is by an answer that says nothing of the time", async () => {
    resumeAttempt({ seconds_left: 600 });
    (api.post as Mock).mockResolvedValue({
      answered: true,
      next_item: question(2),
      all_answered: false,
    });
    await screen.findByText("Question 1 text");

    await chooseAndPressNext();

    await screen.findByText("Question 2 text");
    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  it("is worked out from the start for a server that sends no seconds left", async () => {
    resumeAttempt({ started_at: halfAnHourAgo });

    await screen.findByText("Question 1 text");

    expect(screen.getByText(/^(30:00|29:5\d)$/)).toBeInTheDocument();
  });
});
