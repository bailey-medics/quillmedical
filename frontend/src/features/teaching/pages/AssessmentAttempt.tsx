/**
 * AssessmentAttempt Page
 *
 * Active assessment exam page. Displays questions with images, options,
 * a countdown timer, and navigation. Handles answer submission, exam
 * completion, and early abandonment with navigation blocking.
 *
 * Three rules hold the page together:
 *
 * - A call that fails during the exam leaves the exam on screen, with a
 *   message above the question. Only an exam that could not be loaded
 *   at all replaces the page.
 * - Leaving, running out of time and answering the last question each
 *   finish the attempt at the server, however much of it is done.
 * - Running out of time goes straight to the result, whether it is this
 *   page's clock or the server that says so. An attempt with no time
 *   limit (none, or 0) has no clock and is never submitted by one.
 * - The address is the attempt's own from the moment it exists, so a
 *   reload comes back to the same attempt and never starts another.
 * - Starting hands back an attempt already in progress on the bank,
 *   where there is one, and not a new one. So what starting answers
 *   may be part answered: it opens at its next unanswered question,
 *   with its time running from when it was first started.
 */

import { Group, Stack } from "@mantine/core";
import LoadingSpinner from "@/components/loading-spinner";
import PageHeader from "@/components/page-header";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import ErrorState from "@/components/error-state/ErrorState";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useBlocker,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "@/lib/api";
import { QuestionView } from "@/components/teaching/question-view/QuestionView";
import { AssessmentTimer } from "@/components/teaching/assessment-timer/AssessmentTimer";
import ExamCloseButton from "@/components/teaching/exam-close-button/ExamCloseButton";
import { AssessmentIntro } from "@/components/teaching/assessment-intro/AssessmentIntro";
import { AssessmentClosing } from "@/components/teaching/assessment-closing/AssessmentClosing";
import { ConfirmModal } from "@/components/confirm-modal";
import { IconAlertTriangle } from "@tabler/icons-react";
import type {
  AnswerResult,
  Assessment,
  AssessmentWithFirstItem,
  CandidateItem,
  CompletionResult,
  QuestionBankDetail,
} from "@/features/teaching/types";

type Phase =
  "loading" | "intro" | "questions" | "submitting" | "closing" | "error";

const COULD_NOT_LOAD =
  "The exam could not be loaded. Check your connection and try again.";
const COULD_NOT_START =
  "The exam could not be started. Check your connection and try again.";
const COULD_NOT_SAVE =
  "Could not save your answer. Check your connection and try again.";
const COULD_NOT_GO_BACK =
  "Could not load the previous question. Check your connection and try again.";
const COULD_NOT_FINISH =
  "Could not submit your exam. Check your connection and try again.";

/**
 * How many questions of an attempt just started have an answer. None
 * of a new attempt. An attempt handed back in progress comes at its
 * next unanswered question, or with no question when all are answered.
 */
function answeredBefore(started: AssessmentWithFirstItem): number {
  if (started.first_item) return started.first_item.display_order - 1;

  return started.assessment.total_items;
}

/**
 * How many seconds an attempt has left when it is opened. The server
 * says, and the countdown is set by that. From a server that says
 * nothing, it is worked out from when the attempt started, by this
 * computer's clock. An untimed attempt, one with no limit or a limit of
 * 0, has none.
 */
function secondsLeftAtOpening(attempt: Assessment): number | null {
  if (typeof attempt.seconds_left === "number") return attempt.seconds_left;
  if (!attempt.time_limit_minutes || !attempt.started_at) return null;

  const gone = Math.floor(
    (Date.now() - new Date(attempt.started_at).getTime()) / 1000,
  );

  return Math.max(0, attempt.time_limit_minutes * 60 - gone);
}

/** What the countdown is set by: a figure, and when it arrived. */
interface ExamClock {
  secondsLeft: number;
  /** `performance.now()` read as the figure arrived */
  receivedAt: number;
}

/**
 * Whether an attempt just started has questions, and an answer to each:
 * one handed back in progress that was never submitted. A new attempt
 * that drew no questions is not this.
 */
function isAnsweredInFull(started: AssessmentWithFirstItem): boolean {
  return started.first_item === null && started.assessment.total_items > 0;
}

/**
 * Whether the server refused a call because the attempt is over: it is
 * finished already, or its time has run out.
 */
function isConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    err.status === 409
  );
}

// The server's own words for the two refusals that mean the attempt has
// been finished there, by the clock or otherwise
const OUT_OF_TIME = "Time limit exceeded";
const ALREADY_COMPLETED = "Assessment already completed";

/**
 * Whether the server refused a call because it has finished the attempt.
 * A conflict in other words, such as every question being answered
 * already, is not this: the attempt may still be open.
 */
function isFinishedAtServer(err: unknown): boolean {
  return (
    isConflict(err) &&
    err instanceof Error &&
    (err.message === OUT_OF_TIME || err.message === ALREADY_COMPLETED)
  );
}

export default function AssessmentAttempt() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");

  const isActive = phase === "questions" || phase === "intro";

  // Block React Router navigation during active exam
  // Allow the /new → /assessment/:id replace navigation on begin
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isActive &&
      currentLocation.pathname !== nextLocation.pathname &&
      !nextLocation.pathname.startsWith("/teaching/assessment/"),
  );

  // Block browser tab close / refresh during active exam
  useEffect(() => {
    if (!isActive) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isActive]);

  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [bankDetail, setBankDetail] = useState<QuestionBankDetail | null>(null);
  const [currentItem, setCurrentItem] = useState<CandidateItem | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [viewingPrevious, setViewingPrevious] = useState(false);
  const [furthestItem, setFurthestItem] = useState<CandidateItem | null>(null);
  // A failure during the exam, shown above the question
  const [examError, setExamError] = useState<string | null>(null);
  // What the countdown is set by. Null until an attempt is open, and for
  // an untimed one
  const [clock, setClock] = useState<ExamClock | null>(null);
  // Counts the times loading has been tried, so "Try again" runs it again
  const [loadAttempt, setLoadAttempt] = useState(0);

  // The attempt this page started itself. Its address changes from
  // /new to its own as soon as it exists, and the load below must not
  // then fetch what the page is already holding.
  const heldAttemptRef = useRef<number | null>(null);
  // Set while an exam with no intro page is being started, so that the
  // load running twice starts one attempt
  const startingRef = useRef(false);
  const finishedRef = useRef(false);
  const finishingRef = useRef<Promise<boolean> | null>(null);
  // Set once the time has run out, so that the clock firing again, and
  // the server refusing an answer at the same moment, submit once
  const endingRef = useRef(false);
  // Set once the delegate has been sent to their result, so that the
  // clock and "End exam" together send them there once
  const shownResultRef = useRef(false);

  /**
   * Set the countdown by the seconds left the server has just sent. Every
   * answer about an attempt carries them, so the countdown is put right
   * at each change of question. An answer with none leaves it as it is.
   */
  const setClockBy = useCallback((secondsLeft: number | null | undefined) => {
    if (typeof secondsLeft !== "number") return;

    setClock({ secondsLeft, receivedAt: performance.now() });
  }, []);

  /**
   * Finish the attempt at the server, once. Answers whether it is
   * finished: true as well when it already was, here or in another tab.
   */
  const finish = useCallback((assessmentId: number): Promise<boolean> => {
    if (finishedRef.current) return Promise.resolve(true);
    if (finishingRef.current) return finishingRef.current;

    setCompleting(true);
    setExamError(null);

    const finishing = api
      .post<CompletionResult>(`/teaching/assessments/${assessmentId}/complete`)
      .then(
        () => true,
        (err: unknown) => isConflict(err),
      )
      .then((done) => {
        finishedRef.current = done;
        finishingRef.current = null;
        setCompleting(false);
        if (!done) setExamError(COULD_NOT_FINISH);

        return done;
      });
    finishingRef.current = finishing;

    return finishing;
  }, []);

  // Initialise assessment - either create new or resume existing
  useEffect(() => {
    async function init() {
      if (id !== "new" && String(heldAttemptRef.current) === id) return;

      try {
        if (id === "new") {
          const bankId = searchParams.get("bank");
          if (!bankId) {
            setError("No question bank specified");
            setPhase("error");
            return;
          }

          // Fetch bank detail for intro/closing config
          const detail = await api.get<QuestionBankDetail>(
            `/teaching/question-banks/${bankId}`,
          );
          setBankDetail(detail);

          const introPage = detail.config_yaml?.assessment?.intro_page;
          if (introPage) {
            setPhase("intro");
          } else {
            // No intro - start immediately, and once
            if (startingRef.current) return;
            startingRef.current = true;

            const result = await api.post<AssessmentWithFirstItem>(
              "/teaching/assessments",
              { question_bank_id: bankId },
            );
            heldAttemptRef.current = result.assessment.id;
            setAssessment(result.assessment);
            setClockBy(secondsLeftAtOpening(result.assessment));
            setCurrentItem(result.first_item);
            setAnsweredCount(answeredBefore(result));

            // Handed back with every question answered: submit it
            if (isAnsweredInFull(result)) {
              setPhase("closing");
              void finish(result.assessment.id);
            } else {
              setPhase("questions");
            }

            // The attempt's own address, so a reload opens this attempt
            // itself and does not go through starting again
            navigate(`/teaching/assessment/${result.assessment.id}`, {
              replace: true,
            });
          }
        } else {
          // Resume existing assessment
          const existing = await api.get<Assessment>(
            `/teaching/assessments/${id}`,
          );
          setAssessment(existing);
          setClockBy(secondsLeftAtOpening(existing));

          const detail = await api.get<QuestionBankDetail>(
            `/teaching/question-banks/${existing.question_bank_id}`,
          );
          setBankDetail(detail);

          if (existing.completed_at) {
            navigate(`/teaching/assessment/${id}/result`, {
              replace: true,
              state: { fromExam: true },
            });
            return;
          }

          // Get current item
          const item = await api.get<CandidateItem | null>(
            `/teaching/assessments/${id}/current`,
          );
          if (item) {
            setClockBy(item.seconds_left);
            setCurrentItem(item);
            setAnsweredCount(item.display_order - 1);
            setPhase("questions");
          } else {
            // All answered: finish it and show closing
            setAnsweredCount(existing.total_items);
            setPhase("closing");
            void finish(existing.id);
          }
        }
      } catch {
        startingRef.current = false;
        setError(COULD_NOT_LOAD);
        setPhase("error");
      }
    }
    init();
  }, [id, searchParams, navigate, finish, loadAttempt, setClockBy]);

  const handleTryLoadingAgain = useCallback(() => {
    setError(null);
    setPhase("loading");
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  const [beginning, setBeginning] = useState(false);

  /** Scroll the main content area to the top */
  const scrollToTop = useCallback(() => {
    document.querySelector("main")?.scrollTo(0, 0);
  }, []);

  const handleBegin = useCallback(async () => {
    const bankId = searchParams.get("bank");
    if (!bankId) return;
    setBeginning(true);
    try {
      const result = await api.post<AssessmentWithFirstItem>(
        "/teaching/assessments",
        { question_bank_id: bankId },
      );
      heldAttemptRef.current = result.assessment.id;
      setAssessment(result.assessment);
      setClockBy(secondsLeftAtOpening(result.assessment));
      setCurrentItem(result.first_item);
      setAnsweredCount(answeredBefore(result));
      // Update URL to real assessment ID
      navigate(`/teaching/assessment/${result.assessment.id}`, {
        replace: true,
      });

      // Handed back with every question answered: submit it
      if (isAnsweredInFull(result)) {
        setPhase("closing");
        void finish(result.assessment.id);
      } else {
        setPhase("questions");
      }

      scrollToTop();
    } catch {
      setError(COULD_NOT_START);
      setPhase("error");
    } finally {
      setBeginning(false);
    }
  }, [searchParams, navigate, scrollToTop, finish, setClockBy]);

  /** Show the closing screen and finish the attempt behind it. */
  const closeExam = useCallback(
    (assessmentId: number) => {
      setCurrentItem(null);
      setSelectedOption(null);
      setPhase("closing");
      void finish(assessmentId);
    },
    [finish],
  );

  /** Go to the result, once, however many things ask for it. */
  const showResult = useCallback(
    (assessmentId: number) => {
      if (shownResultRef.current) return;
      shownResultRef.current = true;

      navigate(`/teaching/assessment/${assessmentId}/result`, {
        state: { fromExam: true },
      });
    },
    [navigate],
  );

  /**
   * The time has run out, by this page's clock or by the server's word:
   * submit the exam as it stands, once, and go to the result. If it
   * could not be submitted the closing screen is shown, with the
   * message and "View results" to try again.
   */
  const submitAndShowResult = useCallback(
    async (assessmentId: number) => {
      if (endingRef.current) return;
      endingRef.current = true;

      setCurrentItem(null);
      setSelectedOption(null);
      setPhase("submitting");

      const finished = await finish(assessmentId);
      if (!finished) {
        setPhase("closing");
        return;
      }

      showResult(assessmentId);
    },
    [finish, showResult],
  );

  const handleSubmitAnswer = useCallback(async () => {
    if (!assessment || !currentItem || !selectedOption) return;

    setSubmitting(true);
    setExamError(null);
    try {
      // The answer names its question, so sending it again after a
      // failure is safe: if the first was saved and only its reply was
      // lost, the server stores nothing more and replies as it would
      // have, with the question after.
      const result = await api.post<AnswerResult>(
        `/teaching/assessments/${assessment.id}/answer`,
        {
          selected_option: selectedOption,
          answer_id: currentItem.answer_id,
        },
      );
      setClockBy(result.seconds_left);
      setSelectedOption(null);
      setAnsweredCount(currentItem.display_order);

      if (result.all_answered) {
        closeExam(assessment.id);
      } else {
        setCurrentItem(result.next_item);
        scrollToTop();
      }
    } catch (err) {
      // Refused because the server has finished the attempt: out of time
      if (isFinishedAtServer(err)) {
        void submitAndShowResult(assessment.id);
        return;
      }

      // Refused for another reason that means there is no more to answer
      if (isConflict(err)) {
        closeExam(assessment.id);
        return;
      }

      setExamError(COULD_NOT_SAVE);
    } finally {
      setSubmitting(false);
    }
  }, [
    assessment,
    currentItem,
    selectedOption,
    scrollToTop,
    closeExam,
    submitAndShowResult,
    setClockBy,
  ]);

  const handlePrevious = useCallback(async () => {
    if (!assessment || !currentItem || currentItem.display_order <= 1) return;

    if (!viewingPrevious) {
      setFurthestItem(currentItem);
    }

    setExamError(null);
    try {
      const item = await api.get<CandidateItem>(
        `/teaching/assessments/${assessment.id}/item/${currentItem.display_order - 1}`,
      );
      setClockBy(item.seconds_left);
      setCurrentItem(item);
      setSelectedOption(item.selected_option ?? null);
      setViewingPrevious(true);
    } catch (err) {
      if (isFinishedAtServer(err)) {
        void submitAndShowResult(assessment.id);
        return;
      }

      setExamError(COULD_NOT_GO_BACK);
    }
  }, [
    assessment,
    currentItem,
    viewingPrevious,
    submitAndShowResult,
    setClockBy,
  ]);

  const handleNextPrevious = useCallback(async () => {
    if (!assessment || !currentItem || !selectedOption) return;

    setSubmitting(true);
    setExamError(null);
    try {
      // Save updated answer. Sending it twice is safe: it names its answer
      const changed = await api.put<CandidateItem>(
        `/teaching/assessments/${assessment.id}/answer/${currentItem.answer_id}`,
        { selected_option: selectedOption },
      );
      setClockBy(changed.seconds_left);

      const nextOrder = currentItem.display_order + 1;

      // Back to the furthest unanswered item
      if (nextOrder > answeredCount) {
        setCurrentItem(furthestItem);
        setSelectedOption(null);
        setViewingPrevious(false);
        setFurthestItem(null);
        return;
      }

      const item = await api.get<CandidateItem>(
        `/teaching/assessments/${assessment.id}/item/${nextOrder}`,
      );
      setClockBy(item.seconds_left);
      setCurrentItem(item);
      setSelectedOption(item.selected_option ?? null);
    } catch (err) {
      if (isFinishedAtServer(err)) {
        void submitAndShowResult(assessment.id);
        return;
      }

      if (isConflict(err)) {
        closeExam(assessment.id);
        return;
      }

      setExamError(COULD_NOT_SAVE);
    } finally {
      setSubmitting(false);
    }
  }, [
    assessment,
    currentItem,
    selectedOption,
    answeredCount,
    furthestItem,
    closeExam,
    submitAndShowResult,
    setClockBy,
  ]);

  const handleComplete = useCallback(async () => {
    if (!assessment) return;

    const finished = await finish(assessment.id);
    if (!finished) return;

    showResult(assessment.id);
  }, [assessment, finish, showResult]);

  const handleExpire = useCallback(() => {
    // Out of time: the exam is submitted as it stands
    if (!assessment) return;

    void submitAndShowResult(assessment.id);
  }, [assessment, submitAndShowResult]);

  // Track whether we've already called proceed - prevents ConfirmModal's
  // automatic onClose (after onAccept) from calling reset and cancelling
  // the in-flight navigation.
  const proceededRef = useRef(false);

  async function handleBlockerProceed() {
    // Leaving submits the exam as it stands. On the intro page there is
    // no attempt yet, so nothing to submit.
    if (phase === "questions" && assessment) {
      const finished = await finish(assessment.id);

      // Not submitted: keep the delegate here, where they can try again
      if (!finished) {
        blocker.reset?.();
        return;
      }
    }

    proceededRef.current = true;
    blocker.proceed?.();
  }

  function handleBlockerClose() {
    if (!proceededRef.current) {
      blocker.reset?.();
    }
    proceededRef.current = false;
  }

  const introPage = bankDetail?.config_yaml?.assessment?.intro_page;
  const closingPage = bankDetail?.config_yaml?.assessment?.closing_page;

  // A limit of 0, or none, means the attempt is untimed: it has no clock,
  // and nothing submits it but the delegate
  const isTimed =
    assessment?.time_limit_minutes != null &&
    assessment.time_limit_minutes > 0 &&
    clock !== null;

  // The timer and "End exam" sit in the ribbon while questions are showing,
  // so they stay in view however far the question scrolls. An untimed
  // attempt has "End exam" alone.
  const examControls =
    phase === "questions" && assessment ? (
      <Group gap="sm" wrap="nowrap">
        {isTimed && (
          <AssessmentTimer
            secondsLeft={clock.secondsLeft}
            receivedAt={clock.receivedAt}
            onExpire={handleExpire}
          />
        )}
        <ExamCloseButton onConfirm={handleComplete} />
      </Group>
    ) : undefined;

  return (
    <TeachingLayout ribbonRight={examControls}>
      <PageHeader title="Assessment" visuallyHidden />
      {/* Blocker modal - warns when navigating away during active exam */}
      <ConfirmModal
        opened={blocker.state === "blocked"}
        onClose={handleBlockerClose}
        onAccept={handleBlockerProceed}
        acceptLabel="Leave exam"
        submittingLabel="Submitting\u2026"
        cancelLabel="Continue exam"
        icon={<IconAlertTriangle />}
      >
        You have an active exam. Are you sure you want to leave? Your progress
        will be submitted.
      </ConfirmModal>

      {phase === "loading" && <LoadingSpinner label="Loading assessment" />}

      {phase === "submitting" && (
        <LoadingSpinner label="Submitting your exam" />
      )}

      {phase === "error" && (
        <ErrorState
          title="Error loading exam"
          message={error ?? COULD_NOT_LOAD}
          action={
            searchParams.get("bank") || id !== "new"
              ? { label: "Try again", onClick: handleTryLoadingAgain }
              : undefined
          }
        />
      )}

      {examError && (phase === "questions" || phase === "closing") && (
        <ErrorState title="Not saved" message={examError} />
      )}

      {phase === "intro" && (
        <AssessmentIntro
          title={introPage?.title ?? bankDetail?.title ?? "Assessment"}
          body={introPage?.body ?? ""}
          onBegin={handleBegin}
          onCancel={() => {
            const bankId = searchParams.get("bank");
            navigate(bankId ? `/teaching/${bankId}` : "/teaching");
          }}
          loading={beginning}
        />
      )}

      {phase === "closing" && (
        <AssessmentClosing
          title={closingPage?.title ?? "Assessment complete"}
          body={
            closingPage?.body ??
            "You have completed all questions. Click below to view your results."
          }
          onViewResults={handleComplete}
          disabled={completing}
        />
      )}

      {phase === "questions" && (
        <Stack gap="lg">
          {currentItem && (
            <QuestionView
              item={currentItem}
              selectedOption={selectedOption}
              onSelectOption={setSelectedOption}
              currentQuestion={currentItem.display_order}
              totalQuestions={assessment?.total_items}
              onPrevious={
                currentItem.display_order > 1 ? handlePrevious : undefined
              }
              onNext={viewingPrevious ? handleNextPrevious : handleSubmitAnswer}
              onSubmit={viewingPrevious ? undefined : handleSubmitAnswer}
              isLastQuestion={
                viewingPrevious
                  ? false
                  : assessment
                    ? answeredCount + 1 >= assessment.total_items
                    : false
              }
              submitting={submitting}
            />
          )}
        </Stack>
      )}
    </TeachingLayout>
  );
}
