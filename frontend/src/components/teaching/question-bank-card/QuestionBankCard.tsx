/**
 * QuestionBankCard Component
 *
 * Card displaying a question bank with title, description, item count,
 * and a "Start assessment" button.
 */

import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";

interface QuestionBankCardProps {
  /** Question bank title */
  title: string;
  /** Question bank description */
  description: string;
  /** Number of published items available */
  itemCount: number;
  /** Called when "Start assessment" is clicked */
  onStart: () => void;
  /** Whether starting is disabled (e.g. insufficient items) */
  disabled?: boolean;
}

export function QuestionBankCard({
  title,
  description,
  itemCount,
  onStart,
  disabled = false,
}: QuestionBankCardProps) {
  return (
    <Card withBorder p="lg" radius="md">
      <Stack gap="sm">
        <Title order={4}>{title}</Title>
        <Text size="sm" c="dimmed" lineClamp={3}>
          {description}
        </Text>
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {itemCount} items available
          </Text>
          <Button size="sm" onClick={onStart} disabled={disabled}>
            Start assessment
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
