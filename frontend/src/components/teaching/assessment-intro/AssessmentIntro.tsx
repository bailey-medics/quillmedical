/**
 * AssessmentIntro Component
 *
 * Intro page before assessment begins. Renders title + markdown body
 * from the question bank config + "Begin" button.
 */

import { Button, Card, Stack, Title } from "@mantine/core";
import MarkdownView from "@/components/markdown/MarkdownView";

interface AssessmentIntroProps {
  /** Intro page title from config */
  title: string;
  /** Intro page body (markdown) from config */
  body: string;
  /** Called when "Begin" is clicked */
  onBegin: () => void;
  /** Whether the begin button is disabled */
  disabled?: boolean;
  /** Whether the assessment is being created */
  loading?: boolean;
}

export function AssessmentIntro({
  title,
  body,
  onBegin,
  disabled = false,
  loading = false,
}: AssessmentIntroProps) {
  return (
    <Stack gap="lg">
      <Title order={2}>{title}</Title>
      <Card withBorder p="lg">
        <MarkdownView source={body} />
      </Card>
      <Button size="lg" onClick={onBegin} disabled={disabled} loading={loading}>
        Begin
      </Button>
    </Stack>
  );
}
