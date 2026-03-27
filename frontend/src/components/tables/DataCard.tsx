/**
 * DataCard Component
 *
 * A reusable card component for displaying a single data row in a mobile-friendly
 * card layout. Used by DataTable for its mobile view, but can also be used
 * independently for card-based layouts.
 *
 * Each column is rendered as a labelled field with a divider between fields.
 *
 * @example
 * ```tsx
 * <DataCard
 *   row={user}
 *   columns={[
 *     { header: "Name", render: (user) => user.name },
 *     { header: "Email", render: (user) => user.email },
 *   ]}
 *   onClick={(user) => navigate(`/users/${user.id}`)}
 * />
 * ```
 */

import { Card, Divider, Stack } from "@mantine/core";
import { BodyTextBlack, BodyTextBold } from "@/components/typography";
import type { Column } from "./DataTable";

export interface DataCardProps<T> {
  /** The data row to display */
  row: T;
  /** Column definitions (header labels + render functions) */
  columns: Column<T>[];
  /** Click handler — receives the row data */
  onClick: (row: T) => void;
}

/**
 * DataCard renders a single data row as a bordered card with labelled fields.
 *
 * Each column is shown as a bold header label followed by the rendered content,
 * separated by dividers. The entire card is clickable.
 */
export default function DataCard<T>({
  row,
  columns,
  onClick,
}: DataCardProps<T>) {
  return (
    <Card
      shadow="sm"
      padding="md"
      withBorder
      onClick={() => onClick(row)}
      style={{ cursor: "pointer" }}
    >
      <Stack gap="sm">
        {columns.map((column, index) => (
          <div key={index}>
            <BodyTextBold>{column.header}</BodyTextBold>
            <BodyTextBlack>{column.render(row)}</BodyTextBlack>
            {index < columns.length - 1 && <Divider mt="sm" />}
          </div>
        ))}
      </Stack>
    </Card>
  );
}
