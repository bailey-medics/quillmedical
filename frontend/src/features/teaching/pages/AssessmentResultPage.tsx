/**
 * AssessmentResultPage
 *
 * Displays pass/fail result after completing an assessment. Shows score
 * breakdown, pass criteria results, a link to the results question by
 * question, and certificate download for passed assessments.
 */

import { Skeleton, Stack } from "@mantine/core";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import TeachingMainNav from "@/components/navigation/teaching/TeachingMainNav";
import { ResultMessage, StateMessage } from "@/components/message-cards";
import { IconAlertCircle } from "@/components/icons/appIcons";
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

        // The module is asked for only to offer a retry, and somebody
        // who keeps their results after losing their way into modules
        // is refused it. That is not a failure of this page: the title
        // and the certificate come with the assessment, so the result
        // is shown without a retry.
        try {
          setBankDetail(
            await api.get<QuestionBankDetail>(
              `/teaching/question-banks/${a.question_bank_id}`,
            ),
          );
        } catch {
          setBankDetail(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load result");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Where this page sits in the menu: under its module, as "Result".
  // Shown only while the page is open. The module's own link appears once
  // its title has loaded; until then "Result" hangs under Teaching.
  // The title comes with the assessment. The module's link is offered
  // only when the module itself could be read, so a results-only person
  // is not handed a link to a page they would be refused.
  const bankTitle = assessment?.bank_title ?? bankDetail?.title;
  const sidebarNav = (
    <TeachingMainNav
      moduleName={bankDetail ? bankTitle : undefined}
      moduleHref={
        assessment && bankDetail
          ? `/teaching/${assessment.question_bank_id}`
          : undefined
      }
      trail={[{ label: "Result", href: `/teaching/assessment/${id}/result` }]}
    />
  );

  if (loading) {
    return (
      <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
        <Stack gap="lg">
          <Skeleton height={60} />
          <Skeleton height={200} />
          <Skeleton height={150} />
        </Stack>
      </TeachingLayout>
    );
  }

  if (error || !assessment) {
    return (
      <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
        <StateMessage
          icon={<IconAlertCircle />}
          title="Error loading data"
          description={error ?? "Assessment not found"}
          colour="alert"
        />
      </TeachingLayout>
    );
  }

  if (!assessment.completed_at || assessment.is_passed === null) {
    return (
      <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
        <Stack gap="lg">
          <PageHeader title="Incomplete" />
          <ResultMessage
            variant="warning"
            title="Incomplete"
            subtitle={bankTitle}
          />
        </Stack>
      </TeachingLayout>
    );
  }

  const criteria: CriterionResult[] =
    (assessment.score_breakdown?.criteria as CriterionResult[]) ?? [];
  const config: QuestionBankConfigYaml = bankDetail?.config_yaml ?? {};
  const allowRetry = config?.assessment?.allow_immediate_retry !== false;
  const bankIsLive = bankDetail?.is_live ?? false;
  // The assessment says whether its pass earns a certificate, from the
  // version that was sat. The module's own setting is the fallback for
  // a server that does not yet send it.
  const showCertificate =
    assessment.certificate_available ??
    (assessment.is_passed && config?.results?.certificate_download === true);

  return (
    <TeachingLayout sidebar={sidebarNav} drawerContent={sidebarNav}>
      <Stack gap="lg">
        <AssessmentResult
          isPassed={assessment.is_passed}
          criteria={criteria}
          bankTitle={bankTitle}
          assessmentId={assessment.id}
          questionResultsHref={`/teaching/assessment/${assessment.id}/question-results`}
          showCertificate={!!showCertificate}
          showTryAgain={
            fromExam && allowRetry && bankIsLive && !assessment.is_passed
          }
          showBackToDashboard={fromExam}
          onTryAgain={() => {
            navigate(
              `/teaching/assessment/new?bank=${assessment.question_bank_id}`,
            );
          }}
          onBackToDashboard={() => {
            navigate("/teaching");
          }}
        />
      </Stack>
    </TeachingLayout>
  );
}
