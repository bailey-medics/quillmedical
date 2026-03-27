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

import { Card, Divider, Group, Skeleton, Stack } from "@mantine/core";
import { BodyTextBlack, BodyTextBold } from "@/components/typography";
import type { Column } from "./DataTable";
import classes from "./DataCard.module.css";

export interface DataCardProps<T> {
  /** The data row to display */
  row: T;
  /** Column definitions (header labels + render functions) */
  columns: Column<T>[];
  /** Click handler — receives the row data */
  onClick: (row: T) => void;
  /** Loading state — shows skeleton placeholders */
  loading?: boolean;
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
  loading = false,
}: DataCardProps<T>) {
  if (loading) {
    return (
      <Card shadow="sm" padding="md" withBorder>
        <Stack gap="sm">
          <Skeleton height={30} mt={1} mb={1} />
          <Divider />
          <Skeleton height={30} mt={1} mb={1} />
          <Divider />
          <Skeleton height={30} mt={1} mb={1} />
        </Stack>
      </Card>
    );
  }

  return (
    <Card
      shadow="sm"
      padding="md"
      withBorder
      onClick={() => onClick(row)}
      style={{ cursor: "pointer" }}
    >
      <Stack gap="sm">
        {columns.map((column, index) => {
          const content = column.render(row);
          return (
            <div key={index} className={classes.field}>
              <Group gap="xs" wrap="nowrap" align="center">
                <span className={classes.header}>
                  <BodyTextBold>{column.header}:</BodyTextBold>
                </span>
                {typeof content === "string" || typeof content === "number" ? (
                  <BodyTextBlack>{content}</BodyTextBlack>
                ) : (
                  content
                )}
              </Group>
              {index < columns.length - 1 && <Divider mt="sm" />}
            </div>
          );
        })}
      </Stack>
    </Card>
  );
}
