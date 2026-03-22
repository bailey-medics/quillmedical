import { Alert, Button, Container, Group, Loader, Stack } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { QuestionView } from "@/components/teaching/question-view/QuestionView";
import { AssessmentTimer } from "@/components/teaching/assessment-timer/AssessmentTimer";
import { AssessmentProgress } from "@/components/teaching/assessment-progress/AssessmentProgress";
import { AssessmentIntro } from "@/components/teaching/assessment-intro/AssessmentIntro";
import { AssessmentClosing } from "@/components/teaching/assessment-closing/AssessmentClosing";
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

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [bankDetail, setBankDetail] = useState<QuestionBankDetail | null>(null);
  const [currentItem, setCurrentItem] = useState<CandidateItem | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);

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
            navigate(`/teaching/assessment/${id}/result`, { replace: true });
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

  const handleBegin = useCallback(async () => {
    const bankId = searchParams.get("bank");
    if (!bankId) return;
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
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start assessment",
      );
      setPhase("error");
    }
  }, [searchParams, navigate]);

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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  }, [assessment, currentItem, selectedOption]);

  const handleComplete = useCallback(async () => {
    if (!assessment) return;
    setCompleting(true);
    try {
      await api.post<CompletionResult>(
        `/teaching/assessments/${assessment.id}/complete`,
      );
      navigate(`/teaching/assessment/${assessment.id}/result`);
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

  if (phase === "loading") {
    return (
      <Container size="lg" py="xl">
        <Loader />
      </Container>
    );
  }

  if (phase === "error") {
    return (
      <Container size="lg" py="xl">
        <Alert color="red" title="Error">
          {error}
        </Alert>
      </Container>
    );
  }

  if (phase === "intro") {
    const introPage = bankDetail?.config_yaml?.assessment?.intro_page;
    return (
      <Container size="lg" py="xl">
        <AssessmentIntro
          title={introPage?.title ?? bankDetail?.title ?? "Assessment"}
          body={introPage?.body ?? ""}
          onBegin={handleBegin}
        />
      </Container>
    );
  }

  if (phase === "closing") {
    const closingPage = bankDetail?.config_yaml?.assessment?.closing_page;
    return (
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
    );
  }

  // phase === "questions"
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        {assessment && (
          <Group justify="space-between" align="center">
            <AssessmentProgress
              current={answeredCount + 1}
              total={assessment.total_items}
            />
            <AssessmentTimer
              timeLimitMinutes={assessment.time_limit_minutes}
              startedAt={assessment.started_at}
              onExpire={handleExpire}
            />
          </Group>
        )}

        {currentItem && (
          <QuestionView
            item={currentItem}
            selectedOption={selectedOption}
            onSelectOption={setSelectedOption}
          />
        )}

        <Group justify="flex-end">
          <Button
            onClick={handleSubmitAnswer}
            disabled={!selectedOption}
            loading={submitting}
          >
            Submit answer
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
