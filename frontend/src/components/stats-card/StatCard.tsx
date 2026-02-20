/**
 * StatCard Component
 *
 * Displays a statistic with a title and number value.
 * Shows a skeleton loader when in loading state.
 */

import { Card, Skeleton, Stack, Text, Box } from "@mantine/core";

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
        <Text size="lg" c="dimmed">
          {title}
        </Text>
        <Box style={{ height: 38 }}>
          {loading ? (
            <Skeleton height={38} width={60} />
          ) : (
            <Text size="xl" fw={700} lh={1}>
              {value}
            </Text>
          )}
        </Box>
      </Stack>
    </Card>
  );
}

export default StatCard;
