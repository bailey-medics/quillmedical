import {
  Alert,
  Badge,
  Container,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SyncHistory } from "@/features/teaching/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SyncStatus() {
  const [syncs, setSyncs] = useState<SyncHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<SyncHistory[]>("/teaching/syncs");
        setSyncs(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load sync history",
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
        <Title order={2}>Sync status</Title>

        {syncs.length === 0 ? (
          <Text c="dimmed">No syncs have been performed yet.</Text>
        ) : (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Question bank</Table.Th>
                <Table.Th>Version</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Items created</Table.Th>
                <Table.Th>Items updated</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {syncs.map((sync) => (
                <Table.Tr key={sync.id}>
                  <Table.Td>{formatDate(sync.started_at)}</Table.Td>
                  <Table.Td>{sync.question_bank_id}</Table.Td>
                  <Table.Td>{sync.version}</Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      size="sm"
                      color={sync.status === "success" ? "green" : "red"}
                    >
                      {sync.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{sync.items_created}</Table.Td>
                  <Table.Td>{sync.items_updated}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}
