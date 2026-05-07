import {
  Badge,
  Button,
  Container,
  Group,
  Skeleton,
  Stack,
  Table,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Heading, EmptyState } from "@/components/typography";
import { StateMessage } from "@/components/message-cards";
import { IconAlertCircle } from "@/components/icons/appIcons";
import SelectField from "@/components/form/SelectField";
import type { EducatorResult, QuestionBank } from "@/features/teaching/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function exportCsv(results: EducatorResult[]) {
  const header = "ID,User,Question Bank,Version,Date,Items,Passed\n";
  const rows = results
    .map(
      (r) =>
        `${r.id},${r.user_id},${r.question_bank_id},${r.bank_version},${r.completed_at ?? ""},${r.total_items},${r.is_passed ?? ""}`,
    )
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "teaching-results.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function AllResults() {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [results, setResults] = useState<EducatorResult[]>([]);
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load question banks
  useEffect(() => {
    async function loadBanks() {
      try {
        const data = await api.get<QuestionBank[]>("/teaching/question-banks");
        setBanks(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load question banks",
        );
      } finally {
        setLoading(false);
      }
    }
    loadBanks();
  }, []);

  // Load results when bank selection changes
  useEffect(() => {
    async function loadResults() {
      try {
        const params = selectedBank
          ? `?question_bank_id=${encodeURIComponent(selectedBank)}`
          : "";
        const data = await api.get<EducatorResult[]>(
          `/teaching/results${params}`,
        );
        setResults(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results");
      }
    }
    loadResults();
  }, [selectedBank]);

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={30} width={200} />
          <Skeleton height={40} />
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
        <Group justify="space-between" align="center">
          <Heading>All results</Heading>
          {results.length > 0 && (
            <Button variant="light" onClick={() => exportCsv(results)}>
              Export CSV
            </Button>
          )}
        </Group>

        {banks.length > 0 && (
          <SelectField
            label="Filter by question bank"
            placeholder="All banks"
            clearable
            data={banks.map((b) => ({
              value: b.question_bank_id,
              label: b.title,
            }))}
            value={selectedBank}
            onChange={setSelectedBank}
          />
        )}

        {results.length === 0 ? (
          <EmptyState>No completed results found.</EmptyState>
        ) : (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>User</Table.Th>
                <Table.Th>Question bank</Table.Th>
                <Table.Th>Version</Table.Th>
                <Table.Th>Items</Table.Th>
                <Table.Th>Result</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {results.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    {r.completed_at ? formatDate(r.completed_at) : "—"}
                  </Table.Td>
                  <Table.Td>{r.user_id}</Table.Td>
                  <Table.Td>{r.question_bank_id}</Table.Td>
                  <Table.Td>{r.bank_version}</Table.Td>
                  <Table.Td>{r.total_items}</Table.Td>
                  <Table.Td>
                    {r.is_passed === null ? (
                      <Badge variant="light" color="gray" size="sm">
                        Incomplete
                      </Badge>
                    ) : r.is_passed ? (
                      <Badge
                        variant="light"
                        color="var(--success-color)"
                        size="sm"
                      >
                        Pass
                      </Badge>
                    ) : (
                      <Badge
                        variant="light"
                        color="var(--alert-color)"
                        size="sm"
                      >
                        Fail
                      </Badge>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}
