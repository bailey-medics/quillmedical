import { Container, Skeleton, Stack } from "@mantine/core";
import { StateMessage } from "@/components/message-cards";
import { IconAlertCircle } from "@/components/icons/appIcons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { AssessmentHistoryTable } from "@/components/teaching/assessment-history-table/AssessmentHistoryTable";
import { Heading } from "@/components/typography";
import type { AssessmentHistory } from "@/features/teaching/types";

export default function AssessmentHistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<AssessmentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<AssessmentHistory[]>(
          "/teaching/assessments/history",
        );
        setHistory(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={30} width={250} />
          <Skeleton height={50} />
          <Skeleton height={50} />
          <Skeleton height={50} />
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <StateMessage
          icon={<IconAlertCircle />}
          title="Error loading data"
          description={error}
          colour="alert"
        />
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Heading>Assessment history</Heading>
        <AssessmentHistoryTable
          assessments={history}
          onSelect={(id) => navigate(`/teaching/assessment/${id}/result`)}
        />
      </Stack>
    </Container>
  );
}
