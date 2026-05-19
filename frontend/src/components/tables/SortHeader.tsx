/**
 * SortHeader Component
 *
 * A clickable column header button that displays the current sort state
 * (ascending, descending, or unsorted) with an appropriate arrow icon.
 * Used inside DataTable for sortable columns.
 */

import { Group, UnstyledButton } from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
} from "@/components/icons/appIcons";
import Icon from "@/components/icons/Icon";
import { BodyTextBold } from "@/components/typography";
import classes from "./SortHeader.module.css";

export type SortDirection = "asc" | "desc";

export interface SortHeaderProps {
  /** Column header label */
  label: string;
  /** Current sort direction, or null if this column is not the active sort */
  direction: SortDirection | null;
  /** Called when the header is clicked */
  onClick: () => void;
}

export default function SortHeader({
  label,
  direction,
  onClick,
}: SortHeaderProps) {
  const icon =
    direction === "asc" ? (
      <IconArrowUp />
    ) : direction === "desc" ? (
      <IconArrowDown />
    ) : (
      <IconArrowsSort />
    );

  return (
    <UnstyledButton
      className={classes.sortHeader}
      onClick={onClick}
      aria-label={`Sort by ${label}`}
    >
      <Group gap={4} wrap="nowrap">
        <BodyTextBold>{label}</BodyTextBold>
        <Icon icon={icon} size="sm" />
      </Group>
    </UnstyledButton>
  );
}
