/**
 * QuestionBankCard Component
 *
 * Card displaying a question bank with title, description,
 * and a "Start assessment" button.
 */

import { Button, Card, Stack } from "@mantine/core";
import { BodyTextBold, BodyTextClamp } from "@/components/typography";

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
    <Card withBorder p="lg" radius="md" h="100%">
      <Stack gap="sm" h="100%">
        <BodyTextBold>{title}</BodyTextBold>
        <BodyTextClamp lineClamp={3}>{description}</BodyTextClamp>
        <div style={{ marginTop: "auto" }} />
        <Button size="sm" onClick={onStart} disabled={disabled}>
          Start assessment
        </Button>
      </Stack>
    </Card>
  );
}
