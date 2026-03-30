/**
 * AssessmentClosing Component
 *
 * Closing page after the last answer. Renders title + markdown body
 * from config + "View results" button.
 */

import { Button, Stack } from "@mantine/core";
import { BodyTextBlack, PageHeader } from "@/components/typography";
import QuillCard from "@/components/quill-card/QuillCard";

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
      <PageHeader title={title} />
      <QuillCard>
        <BodyTextBlack>{body}</BodyTextBlack>
      </QuillCard>
      <Button size="lg" onClick={onViewResults} disabled={disabled}>
        View results
      </Button>
    </Stack>
  );
}
