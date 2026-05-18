/**
 * DataTable Component
 *
 * A reusable, generic table component for admin pages with responsive layouts.
 * On mobile: displays data in card format with all information visible.
 * On desktop: displays traditional table with striped rows and hover effects.
 * Supports custom column definitions with render functions for flexible content display.
 *
 * @example
 * ```tsx
 * <DataTable
 *   data={users}
 *   columns={[
 *     { header: "Name", render: (user) => user.name },
 *     { header: "Email", render: (user) => user.email }
 *   ]}
 *   onRowClick={(user) => navigate(`/users/${user.id}`)}
 *   getRowKey={(user) => user.id}
 *   loading={loading}
 *   error={error}
 * />
 * ```
 */

import { useState } from "react";
import {
  Table,
  Skeleton,
  Stack,
  Center,
  Pagination,
  Group,
  useMantineTheme,
  useComputedColorScheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  BodyText,
  BodyTextInline,
  BodyTextBold,
} from "@/components/typography";
import { StateMessage } from "@/components/message-cards";
import { IconAlertCircle } from "@/components/icons/appIcons";
import DataCard from "./DataCard";
import classes from "./DataTable.module.css";

/**
 * Column definition for DataTable
 */
export interface Column<T> {
  /** Column header text */
  header: string;
  /**
   * Render function for cell content.
   *
   * Return plain text (string/number) or a simple component (Badge,
   * FormattedDate, ActiveStatusBadge, etc.). Do NOT wrap output in Text or
   * other typography components — cells are already styled via
   * BodyTextInline.
   */
  render: (row: T) => React.ReactNode;
  /** Optional: custom width */
  width?: string;
}

/**
 * DataTable Props
 */
export interface DataTableProps<T> {
  /** Array of data rows */
  data: T[];
  /** Column definitions */
  columns: Column<T>[];
  /** Row click handler - receives the row data */
  onRowClick?: (row: T) => void;
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string | null;
  /** Empty state message (default: "No data found") */
  emptyMessage?: string;
  /** Unique key extractor from row data */
  getRowKey: (row: T) => string | number;
  /** Rows per page. When set, pagination is shown below the table. */
  pageSize?: number;
}

/**
 * DataTable displays data in a responsive layout optimized for all screen sizes.
 *
 * Features:
 * - Generic type support for any data structure
 * - Flexible column definitions with custom render functions
 * - Responsive layout: cards on mobile (all data visible), table on desktop
 * - Loading state with skeleton placeholders
 * - Error state with alert message
 * - Empty state with custom message
 * - Striped rows (desktop) / bordered cards (mobile)
 * - Hover highlighting on both layouts
 * - Clickable rows/cards with pointer cursor
 *
 * Breakpoint: Uses theme.breakpoints.sm (768px) to switch between layouts.
 * This ensures critical patient/user information is never hidden on small screens.
 *
 * Used on admin pages for users, patients, and other resources.
 */
export default function DataTable<T>({
  data,
  columns,
  onRowClick,
  loading = false,
  error = null,
  emptyMessage = "No data found",
  getRowKey,
  pageSize,
}: DataTableProps<T>) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const colorScheme = useComputedColorScheme("light");
  const isDark = colorScheme === "dark";
  const hoverColor = isDark ? "var(--mantine-color-primary-5)" : undefined;
  const stripedColor = isDark ? "var(--mantine-color-primary-6)" : undefined;

  const [page, setPage] = useState(1);
  const totalPages = pageSize ? Math.ceil(data.length / pageSize) : 1;

  // Clamp page to valid range when data shrinks (e.g. after filtering)
  const activePage = Math.min(page, Math.max(totalPages, 1));
  if (activePage !== page) {
    setPage(activePage);
  }

  // Slice data to current page when pagination is active
  const visibleData = pageSize
    ? data.slice((activePage - 1) * pageSize, activePage * pageSize)
    : data;

  // Error state
  if (error) {
    return (
      <StateMessage
        icon={<IconAlertCircle />}
        title="Error loading data"
        description={error}
        colour="alert"
      />
    );
  }

  // Loading state
  if (loading) {
    if (isMobile) {
      return (
        <Stack gap="md">
          {Array.from({ length: 3 }, (_, i) => (
            <DataCard
              key={i}
              row={{} as T}
              columns={columns}
              onClick={() => {}}
              loading
            />
          ))}
        </Stack>
      );
    }

    return (
      <Table striped stripedColor={stripedColor}>
        <Table.Thead>
          <Table.Tr>
            {columns.map((column, index) => (
              <Table.Th key={index} style={{ width: column.width }}>
                <BodyTextBold>{column.header}</BodyTextBold>
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {Array.from({ length: 4 }, (_, rowIndex) => (
            <Table.Tr key={rowIndex}>
              {columns.map((_, colIndex) => (
                <Table.Td key={colIndex}>
                  <Skeleton height={25} mt={4} mb={4} />
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <Center p="xl">
        <BodyText>{emptyMessage}</BodyText>
      </Center>
    );
  }

  // Mobile: Card layout with all information visible
  if (isMobile) {
    return (
      <Stack gap="md">
        {visibleData.map((row) => (
          <DataCard
            key={getRowKey(row)}
            row={row}
            columns={columns}
            onClick={onRowClick ?? (() => {})}
          />
        ))}
        {pageSize && totalPages > 1 && (
          <Group justify="center" mt="md">
            <Pagination
              total={totalPages}
              value={activePage}
              onChange={setPage}
            />
          </Group>
        )}
      </Stack>
    );
  }

  // Desktop: Table layout
  return (
    <Stack gap="md">
      <Table
        striped
        stripedColor={stripedColor}
        highlightOnHover
        highlightOnHoverColor={hoverColor}
      >
        <Table.Thead>
          <Table.Tr>
            {columns.map((column, index) => (
              <Table.Th key={index} style={{ width: column.width }}>
                <BodyTextBold>{column.header}</BodyTextBold>
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visibleData.map((row) => (
            <Table.Tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: "pointer" } : undefined}
            >
              {columns.map((column, index) => (
                <Table.Td
                  key={index}
                  className={classes.cell}
                  style={{ verticalAlign: "middle" }}
                >
                  <BodyTextInline>{column.render(row)}</BodyTextInline>
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {pageSize && totalPages > 1 && (
        <Group justify="center">
          <Pagination
            total={totalPages}
            value={activePage}
            onChange={setPage}
          />
        </Group>
      )}
    </Stack>
  );
}
