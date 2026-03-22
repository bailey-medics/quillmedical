import {
  Alert,
  Button,
  Container,
  Group,
  Loader,
  Select,
  Stack,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ItemManagementTable } from "@/components/teaching/item-management-table/ItemManagementTable";
import type { QuestionBank, QuestionBankItem } from "@/features/teaching/types";

export default function ManageItems() {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load question banks
  useEffect(() => {
    async function loadBanks() {
      try {
        const data = await api.get<QuestionBank[]>("/teaching/question-banks");
        setBanks(data);
        if (data.length > 0) {
          setSelectedBank(data[0].question_bank_id);
        }
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

  // Load items when bank selection changes
  useEffect(() => {
    if (!selectedBank) return;
    async function loadItems() {
      try {
        const data = await api.get<QuestionBankItem[]>(
          `/teaching/items?question_bank_id=${encodeURIComponent(selectedBank!)}`,
        );
        setItems(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load items");
      }
    }
    loadItems();
  }, [selectedBank]);

  function handleTogglePublish(itemId: number, published: boolean) {
    // Optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, status: published ? "published" : "draft" }
          : item,
      ),
    );
    // TODO: API call to update item status when endpoint is available
  }

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
        <Group justify="space-between" align="center">
          <Title order={2}>Manage items</Title>
          <Button
            variant="light"
            onClick={() => window.location.assign("/teaching/sync")}
          >
            View sync status
          </Button>
        </Group>

        {banks.length > 0 && (
          <Select
            label="Question bank"
            data={banks.map((b) => ({
              value: b.question_bank_id,
              label: b.title,
            }))}
            value={selectedBank}
            onChange={setSelectedBank}
          />
        )}

        <ItemManagementTable
          items={items}
          onTogglePublish={handleTogglePublish}
        />
      </Stack>
    </Container>
  );
}
