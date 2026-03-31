import { Container, Loader, Stack } from "@mantine/core";
import { ResultMessage, StateMessage } from "@/components/message-cards";
import { PageHeader } from "@/components/typography";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { AssessmentResult } from "@/components/teaching/assessment-result/AssessmentResult";
import type {
  Assessment,
  CriterionResult,
  QuestionBankConfigYaml,
  QuestionBankDetail,
} from "@/features/teaching/types";

export default function AssessmentResultPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const fromExam =
    (location.state as { fromExam?: boolean })?.fromExam === true;

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [bankDetail, setBankDetail] = useState<QuestionBankDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const a = await api.get<Assessment>(`/teaching/assessments/${id}`);
        setAssessment(a);

        const detail = await api.get<QuestionBankDetail>(
          `/teaching/question-banks/${a.question_bank_id}`,
        );
        setBankDetail(detail);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load result");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Loader />
      </Container>
    );
  }

  if (error || !assessment) {
    return (
      <Container size="lg" py="xl">
        <StateMessage type="error" message={error ?? "Assessment not found"} />
      </Container>
    );
  }

  if (!assessment.completed_at || assessment.is_passed === null) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <PageHeader title="Incomplete" />
          <ResultMessage
            variant="warning"
            title="Incomplete"
            subtitle={bankDetail?.title}
          />
        </Stack>
      </Container>
    );
  }

  const criteria: CriterionResult[] =
    (assessment.score_breakdown?.criteria as CriterionResult[]) ?? [];
  const config: QuestionBankConfigYaml = bankDetail?.config_yaml ?? {};
  const allowRetry = config?.assessment?.allow_immediate_retry !== false;
  const bankIsLive = bankDetail?.is_live ?? false;
  const showCertificate =
    assessment.is_passed && config?.results?.certificate_download === true;

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <AssessmentResult
          isPassed={assessment.is_passed}
          criteria={criteria}
          bankTitle={bankDetail?.title}
          assessmentId={assessment.id}
          showCertificate={!!showCertificate}
          showTryAgain={
            fromExam && allowRetry && bankIsLive && !assessment.is_passed
          }
          showBackToDashboard={fromExam}
          onTryAgain={() =>
            navigate(
              `/teaching/assessment/new?bank=${assessment.question_bank_id}`,
            )
          }
          onBackToDashboard={() => navigate("/teaching")}
        />
      </Stack>
    </Container>
  );
}
