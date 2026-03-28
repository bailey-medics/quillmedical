/**
 * ItemManagementTable Component
 *
 * Educator view of synced question bank items: status, metadata,
 * image thumbnails, and publish/unpublish toggle.
 */

import { Badge, Switch, Table } from "@mantine/core";
import { PlaceholderText } from "@/components/typography";
import type { QuestionBankItem } from "@/features/teaching/types";

interface ItemManagementTableProps {
  /** List of question bank items */
  items: QuestionBankItem[];
  /** Called when an item's published status is toggled */
  onTogglePublish?: (itemId: number, published: boolean) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ItemManagementTable({
  items,
  onTogglePublish,
}: ItemManagementTableProps) {
  if (items.length === 0) {
    return <PlaceholderText>No items synced yet.</PlaceholderText>;
  }

  return (
    <Table highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>ID</Table.Th>
          <Table.Th>Bank</Table.Th>
          <Table.Th>Images</Table.Th>
          <Table.Th>Created</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>Publish</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {items.map((item) => (
          <Table.Tr key={item.id}>
            <Table.Td>{item.id}</Table.Td>
            <Table.Td>{item.question_bank_id}</Table.Td>
            <Table.Td>{item.images.length}</Table.Td>
            <Table.Td>{formatDate(item.created_at)}</Table.Td>
            <Table.Td>
              <Badge
                variant="light"
                color={item.status === "published" ? "green" : "gray"}
                size="sm"
              >
                {item.status}
              </Badge>
            </Table.Td>
            <Table.Td>
              <Switch
                checked={item.status === "published"}
                onChange={(e) =>
                  onTogglePublish?.(item.id, e.currentTarget.checked)
                }
                aria-label={`Toggle publish for item ${item.id}`}
              />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
