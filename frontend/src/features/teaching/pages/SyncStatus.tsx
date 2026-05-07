import { Badge, Container, Skeleton, Stack, Table } from "@mantine/core";
import { StateMessage } from "@/components/message-cards";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Heading, EmptyState } from "@/components/typography";
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
        <Stack gap="lg">
          <Skeleton height={30} width={200} />
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
        <Heading>Sync status</Heading>

        {syncs.length === 0 ? (
          <EmptyState>No syncs have been performed yet.</EmptyState>
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
                      color={
                        sync.status === "success"
                          ? "var(--success-color)"
                          : "var(--alert-color)"
                      }
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
