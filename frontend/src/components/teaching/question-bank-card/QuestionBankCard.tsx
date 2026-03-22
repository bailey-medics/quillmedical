/**
 * QuestionBankCard Component
 *
 * Card displaying a question bank with title, description,
 * and a "Start assessment" button.
 */

import { Button, Card, Stack, Text, Title } from "@mantine/core";

interface QuestionBankCardProps {
  /** Question bank title */
  title: string;
  /** Question bank description */
  description: string;
  /** Called when "Start assessment" is clicked */
  onStart: () => void;
  /** Whether starting is disabled (e.g. insufficient items) */
  disabled?: boolean;
}

export function QuestionBankCard({
  title,
  description,
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
        <Button size="sm" onClick={onStart} disabled={disabled}>
          Start assessment
        </Button>
      </Stack>
    </Card>
  );
}
