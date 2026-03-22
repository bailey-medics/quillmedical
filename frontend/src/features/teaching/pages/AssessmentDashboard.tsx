import {
  Alert,
  Container,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { QuestionBankCard } from "@/components/teaching/question-bank-card/QuestionBankCard";
import { AssessmentHistoryTable } from "@/components/teaching/assessment-history-table/AssessmentHistoryTable";
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
        <Title order={2}>Teaching</Title>
        <Text>Select a question bank to begin an assessment.</Text>

        {banks.length === 0 ? (
          <Text c="dimmed">No question banks available.</Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {banks.map((bank) => (
              <QuestionBankCard
                key={bank.id}
                title={bank.title}
                description={bank.description}
                onStart={() =>
                  navigate(
                    `/teaching/assessment/new?bank=${bank.question_bank_id}`,
                  )
                }
              />
            ))}
          </SimpleGrid>
        )}

        <Title order={3} mt="md">
          My history
        </Title>
        <AssessmentHistoryTable
          assessments={history}
          onSelect={(id) => navigate(`/teaching/assessment/${id}/result`)}
        />
      </Stack>
    </Container>
  );
}
