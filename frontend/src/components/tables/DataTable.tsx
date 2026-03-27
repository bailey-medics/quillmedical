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
 *   breakpoint="md"  // Optional: use "md" for wider tables
 * />
 * ```
 */

import {
  Table,
  Skeleton,
  Stack,
  Center,
  Alert,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAlertCircle } from "@tabler/icons-react";
import Icon from "@/components/icons";
import { BodyText, BodyTextBlack, BodyTextBold } from "@/components/typography";
import DataCard from "./DataCard";

/**
 * Column definition for DataTable
 */
export interface Column<T> {
  /** Column header text */
  header: string;
  /** Render function for cell content */
  render: (row: T) => React.ReactNode;
  /** Optional: custom width */
  width?: string;
  /** Optional: text alignment (default: left) */
  align?: "left" | "center" | "right";
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
  onRowClick: (row: T) => void;
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string | null;
  /** Empty state message (default: "No data found") */
  emptyMessage?: string;
  /** Unique key extractor from row data */
  getRowKey: (row: T) => string | number;
  /** Breakpoint for switching to mobile card layout (default: "sm" / 768px) */
  breakpoint?: "xs" | "sm" | "md" | "lg" | "xl";
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
 * Breakpoint: Uses theme.breakpoints.sm (768px) by default to switch between layouts.
 * This can be customized via the breakpoint prop (xs/sm/md/lg/xl) for wider tables.
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
  breakpoint = "sm",
}: DataTableProps<T>) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(
    `(max-width: ${theme.breakpoints[breakpoint]})`,
  );

  // Error state
  if (error) {
    return (
      <Alert
        icon={<Icon icon={<IconAlertCircle />} size="lg" />}
        title="Error loading data"
        color="red"
      >
        {error}
      </Alert>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Stack gap="xs">
        <Skeleton height={50} />
        <Skeleton height={50} />
        <Skeleton height={50} />
        <Skeleton height={50} />
      </Stack>
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
        {data.map((row) => (
          <DataCard
            key={getRowKey(row)}
            row={row}
            columns={columns}
            onClick={onRowClick}
          />
        ))}
      </Stack>
    );
  }

  // Desktop: Table layout
  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          {columns.map((column, index) => (
            <Table.Th
              key={index}
              style={{
                width: column.width,
                textAlign: column.align || "left",
              }}
            >
              <BodyTextBold>{column.header}</BodyTextBold>
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {data.map((row) => (
          <Table.Tr
            key={getRowKey(row)}
            onClick={() => onRowClick(row)}
            style={{ cursor: "pointer" }}
          >
            {columns.map((column, index) => (
              <Table.Td
                key={index}
                style={{
                  textAlign: column.align || "left",
                  verticalAlign: "middle",
                }}
              >
                <BodyTextBlack>{column.render(row)}</BodyTextBlack>
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
