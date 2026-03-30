/**
 * StatCard Component
 *
 * Displays a statistic with a title and number value.
 * Shows a skeleton loader when in loading state.
 */

import { Skeleton, Stack, Text, Box } from "@mantine/core";
import BodyText from "@/components/typography/BodyText";
import QuillCard from "@/components/quill-card/QuillCard";

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
    <QuillCard>
      <Stack gap="xs">
        <BodyText>{title}</BodyText>
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
    </QuillCard>
  );
}

export default StatCard;
