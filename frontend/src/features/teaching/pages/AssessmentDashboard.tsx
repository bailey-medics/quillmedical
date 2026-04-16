import { Box, Container, SimpleGrid, Skeleton, Stack } from "@mantine/core";
import PageHeader from "@components/typography/PageHeader";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import ActionCard from "@/components/action-card/ActionCard";
import { StateMessage } from "@/components/message-cards";
import { AssessmentHistoryTable } from "@/components/teaching/assessment-history-table/AssessmentHistoryTable";
import { HeaderText, PlaceholderText } from "@/components/typography";
import type {
  AssessmentHistory,
  QuestionBank,
} from "@/features/teaching/types";

export default function AssessmentDashboard() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [history, setHistory] = useState<AssessmentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [banksData, historyData] = await Promise.all([
          api.get<QuestionBank[]>("/teaching/question-banks"),
          api.get<AssessmentHistory[]>("/teaching/assessments/history"),
        ]);
        setBanks(banksData);
        setHistory(historyData);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard",
        );
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
          <Skeleton height={36} width={200} />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Skeleton height={120} />
            <Skeleton height={120} />
          </SimpleGrid>
          <Skeleton height={24} width={150} />
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
        <StateMessage type="error" message={error} />
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Teaching" />

        {banks.filter((bank) => bank.is_live).length === 0 ? (
          <PlaceholderText>No assessments are currently open.</PlaceholderText>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {banks
              .filter((bank) => bank.is_live)
              .map((bank) => (
                <ActionCard
                  key={bank.id}
                  title={bank.title}
                  subtitle={bank.description}
                  buttonLabel="Start assessment"
                  onClick={() =>
                    navigate(
                      `/teaching/assessment/new?bank=${bank.question_bank_id}`,
                    )
                  }
                />
              ))}
          </SimpleGrid>
        )}

        <Box mt="md">
          <HeaderText>My history</HeaderText>
        </Box>
        <AssessmentHistoryTable
          assessments={history}
          onSelect={(id) => navigate(`/teaching/assessment/${id}/result`)}
        />
      </Stack>
    </Container>
  );
}
