/**
 * AssessmentClosing Component
 *
 * Closing page after the last answer. Renders title + markdown body
 * from config + "View results" button.
 */

import { Button, Card, Stack } from "@mantine/core";
import { HeaderText } from "@/components/typography";
import MarkdownView from "@/components/markdown/MarkdownView";

interface AssessmentClosingProps {
  /** Closing page title from config */
  title: string;
  /** Closing page body (markdown) from config */
  body: string;
  /** Called when "View results" is clicked */
  onViewResults: () => void;
  /** Whether the button is disabled (e.g. completing) */
  disabled?: boolean;
}

export function AssessmentClosing({
  title,
  body,
  onViewResults,
  disabled = false,
}: AssessmentClosingProps) {
  return (
    <Stack gap="lg">
      <HeaderText>{title}</HeaderText>
      <Card withBorder p="lg">
        <MarkdownView source={body} />
      </Card>
      <Button size="lg" onClick={onViewResults} disabled={disabled}>
        View results
      </Button>
    </Stack>
  );
}
