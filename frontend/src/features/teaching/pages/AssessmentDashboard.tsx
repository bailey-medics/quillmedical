import { Alert, Container, Loader, SimpleGrid, Stack } from "@mantine/core";
import PageHeader from "@components/typography/PageHeader";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import ActionCard from "@/components/action-card/ActionCard";
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
        <Loader />
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Alert color="red" title="Error">
          {error}
        </Alert>
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

        <HeaderText mt="md">My history</HeaderText>
        <AssessmentHistoryTable
          assessments={history}
          onSelect={(id) => navigate(`/teaching/assessment/${id}/result`)}
        />
      </Stack>
    </Container>
  );
}
