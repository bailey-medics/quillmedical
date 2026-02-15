/**
 * StatCard Component
 *
 * Displays a statistic with a title and number value.
 * Shows a skeleton loader when in loading state.
 */

import { Card, Skeleton, Stack, Text } from "@mantine/core";

export interface StatCardProps {
  /** Title/label for the statistic */
  title: string;
  /** Numeric value to display */
  value: number;
  /** Loading state - shows skeleton when true */
  loading?: boolean;
}

/**
 * StatCard Component
 *
 * @example
 * ```tsx
 * <StatCard title="Total Users" value={42} />
 * <StatCard title="Total Patients" value={128} loading />
 * ```
 */
export function StatCard({ title, value, loading = false }: StatCardProps) {
  return (
    <Card withBorder>
      <Stack gap="xs">
        <Text size="sm" c="dimmed">
          {title}
        </Text>
        {loading ? (
          <Skeleton height={32} width={60} />
        ) : (
          <Text size="xl" fw={700}>
            {value}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export default StatCard;
