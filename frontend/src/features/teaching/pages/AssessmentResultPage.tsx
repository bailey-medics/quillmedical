import { Alert, Button, Container, Group, Loader, Stack } from "@mantine/core";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { AssessmentResult } from "@/components/teaching/assessment-result/AssessmentResult";
import { CertificateDownload } from "@/components/teaching/certificate-download/CertificateDownload";
import type {
  Assessment,
  CriterionResult,
  QuestionBankDetail,
} from "@/features/teaching/types";

export default function AssessmentResultPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

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
        <Alert color="red" title="Error">
          {error ?? "Assessment not found"}
        </Alert>
      </Container>
    );
  }

  if (!assessment.completed_at || assessment.is_passed === null) {
    return (
      <Container size="lg" py="xl">
        <Alert color="yellow" title="In progress">
          This assessment has not been completed yet.
        </Alert>
      </Container>
    );
  }

  const criteria: CriterionResult[] =
    (assessment.score_breakdown?.criteria as CriterionResult[]) ?? [];
  const config = bankDetail?.config_yaml ?? {};
  const allowRetry = config?.assessment?.allow_immediate_retry !== false;
  const showCertificate =
    assessment.is_passed && config?.results?.certificate_download === true;

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <AssessmentResult
          isPassed={assessment.is_passed}
          criteria={criteria}
          bankTitle={bankDetail?.title}
        />

        <Group>
          {showCertificate && (
            <CertificateDownload assessmentId={assessment.id} />
          )}
          {allowRetry && (
            <Button
              variant="light"
              onClick={() =>
                navigate(
                  `/teaching/assessment/new?bank=${assessment.question_bank_id}`,
                )
              }
            >
              Try again
            </Button>
          )}
          <Button variant="subtle" onClick={() => navigate("/teaching")}>
            Back to dashboard
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
