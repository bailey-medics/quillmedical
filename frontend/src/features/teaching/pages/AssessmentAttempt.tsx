import { Container, Loader, Modal, Stack } from "@mantine/core";
import { StateMessage } from "@/components/message-cards";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useBlocker,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "@/lib/api";
import { QuestionView } from "@/components/teaching/question-view/QuestionView";
import { AssessmentIntro } from "@/components/teaching/assessment-intro/AssessmentIntro";
import { AssessmentClosing } from "@/components/teaching/assessment-closing/AssessmentClosing";
import { ButtonPairRed } from "@/components/button";
import { IconAlertTriangle } from "@tabler/icons-react";
import Icon from "@/components/icons/Icon";
import BodyTextBold from "@/components/typography/BodyTextBold";
import type { LayoutCtx } from "@/RootLayout";
import type {
  AnswerResult,
  Assessment,
  AssessmentWithFirstItem,
  CandidateItem,
  CompletionResult,
  QuestionBankDetail,
} from "@/features/teaching/types";

type Phase = "loading" | "intro" | "questions" | "closing" | "error";

export default function AssessmentAttempt() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setExamMode } = useOutletContext<LayoutCtx>();

  // Enter exam mode on mount, exit on unmount
  useEffect(() => {
    setExamMode(true);
    return () => setExamMode(false);
  }, [setExamMode]);

  const [phase, setPhase] = useState<Phase>("loading");

  const isActive = phase === "questions" || phase === "intro";
  const isExamPhase =
    phase === "questions" || phase === "intro" || phase === "closing";

  // Also clear exam mode if we leave an exam phase without unmounting
  // (e.g. error during exam). Closing phase keeps exam mode so the
  // navbar stays hidden until the user presses "View results".
  const wasInExam = useRef(false);
  useEffect(() => {
    if (isExamPhase) {
      wasInExam.current = true;
    } else if (wasInExam.current) {
      setExamMode(false);
    }
  }, [isExamPhase, setExamMode]);

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

  // Initialise assessment — either create new or resume existing
  useEffect(() => {
    async function init() {
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
            // No intro — start immediately
            const result = await api.post<AssessmentWithFirstItem>(
              "/teaching/assessments",
              { question_bank_id: bankId },
            );
            setAssessment(result.assessment);
            setCurrentItem(result.first_item);
            setAnsweredCount(0);
            setPhase("questions");
          }
        } else {
          // Resume existing assessment
          const existing = await api.get<Assessment>(
            `/teaching/assessments/${id}`,
          );
          setAssessment(existing);

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
            setCurrentItem(item);
            setAnsweredCount(item.display_order - 1);
            setPhase("questions");
          } else {
            // All answered, show closing
            setAnsweredCount(existing.total_items);
            setPhase("closing");
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load assessment",
        );
        setPhase("error");
      }
    }
    init();
  }, [id, searchParams, navigate]);

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
      setAssessment(result.assessment);
      setCurrentItem(result.first_item);
      setAnsweredCount(0);
      // Update URL to real assessment ID
      navigate(`/teaching/assessment/${result.assessment.id}`, {
        replace: true,
      });
      setPhase("questions");
      scrollToTop();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start assessment",
      );
      setPhase("error");
    } finally {
      setBeginning(false);
    }
  }, [searchParams, navigate, scrollToTop]);

  const handleSubmitAnswer = useCallback(async () => {
    if (!assessment || !currentItem || !selectedOption) return;
    setSubmitting(true);
    try {
      const result = await api.post<AnswerResult>(
        `/teaching/assessments/${assessment.id}/answer`,
        { selected_option: selectedOption },
      );
      setSelectedOption(null);
      setAnsweredCount((prev) => prev + 1);

      if (result.all_answered) {
        setCurrentItem(null);
        setPhase("closing");
      } else {
        setCurrentItem(result.next_item);
        scrollToTop();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  }, [assessment, currentItem, selectedOption, scrollToTop]);

  const handlePrevious = useCallback(async () => {
    if (!assessment || !currentItem || currentItem.display_order <= 1) return;

    if (!viewingPrevious) {
      setFurthestItem(currentItem);
    }

    try {
      const item = await api.get<CandidateItem>(
        `/teaching/assessments/${assessment.id}/item/${currentItem.display_order - 1}`,
      );
      setCurrentItem(item);
      setSelectedOption(item.selected_option ?? null);
      setViewingPrevious(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load previous item",
      );
      setPhase("error");
    }
  }, [assessment, currentItem, viewingPrevious]);

  const handleNextPrevious = useCallback(async () => {
    if (!assessment || !currentItem || !selectedOption) return;

    setSubmitting(true);
    try {
      // Save updated answer
      await api.put<CandidateItem>(
        `/teaching/assessments/${assessment.id}/answer/${currentItem.answer_id}`,
        { selected_option: selectedOption },
      );

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
      setCurrentItem(item);
      setSelectedOption(item.selected_option ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save answer");
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  }, [assessment, currentItem, selectedOption, answeredCount, furthestItem]);

  const handleComplete = useCallback(async () => {
    if (!assessment) return;
    setCompleting(true);
    try {
      await api.post<CompletionResult>(
        `/teaching/assessments/${assessment.id}/complete`,
      );
      navigate(`/teaching/assessment/${assessment.id}/result`, {
        state: { fromExam: true },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to complete assessment",
      );
      setPhase("error");
    } finally {
      setCompleting(false);
    }
  }, [assessment, navigate]);

  const handleExpire = useCallback(() => {
    // Timer expired — go to closing phase
    setPhase("closing");
  }, []);

  const introPage = bankDetail?.config_yaml?.assessment?.intro_page;
  const closingPage = bankDetail?.config_yaml?.assessment?.closing_page;

  return (
    <>
      {/* Blocker modal — warns when navigating away during active exam */}
      <Modal
        opened={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        centered
        withCloseButton={false}
        radius="md"
        styles={{ content: { border: "1px solid rgba(0, 0, 0, 0.1)" } }}
      >
        <Stack gap="md" align="center" pt="xl">
          <Icon
            icon={<IconAlertTriangle />}
            size="xl"
            colour="var(--alert-color)"
          />
          <BodyTextBold justify="centre">
            You have an active exam. Are you sure you want to leave? Your
            progress will be submitted.
          </BodyTextBold>
          <ButtonPairRed
            cancelLabel="Continue exam"
            acceptLabel="Leave exam"
            onCancel={() => blocker.reset?.()}
            onAccept={() => blocker.proceed?.()}
          />
        </Stack>
      </Modal>

      {phase === "loading" && (
        <Container size="lg" py="xl">
          <Loader />
        </Container>
      )}

      {phase === "error" && (
        <Container size="lg" py="xl">
          <StateMessage
            type="error"
            message={error ?? "An unexpected error occurred"}
          />
        </Container>
      )}

      {phase === "intro" && (
        <Container size="lg" py="xl">
          <AssessmentIntro
            title={introPage?.title ?? bankDetail?.title ?? "Assessment"}
            body={introPage?.body ?? ""}
            onBegin={handleBegin}
            loading={beginning}
          />
        </Container>
      )}

      {phase === "closing" && (
        <Container size="lg" py="xl">
          <AssessmentClosing
            title={closingPage?.title ?? "Assessment complete"}
            body={
              closingPage?.body ??
              "You have completed all questions. Click below to view your results."
            }
            onViewResults={handleComplete}
            disabled={completing}
          />
        </Container>
      )}

      {phase === "questions" && (
        <Container size="lg" py="xl">
          <Stack gap="lg">
            {currentItem && (
              <QuestionView
                item={currentItem}
                selectedOption={selectedOption}
                onSelectOption={setSelectedOption}
                currentQuestion={currentItem.display_order}
                totalQuestions={assessment?.total_items}
                timeLimitMinutes={assessment?.time_limit_minutes}
                startedAt={assessment?.started_at}
                onExpire={handleExpire}
                onCloseExam={handleComplete}
                onPrevious={
                  currentItem.display_order > 1 ? handlePrevious : undefined
                }
                onNext={
                  viewingPrevious ? handleNextPrevious : handleSubmitAnswer
                }
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
        </Container>
      )}
    </>
  );
}
