/**
 * AssessmentIntro Component
 *
 * Intro page before assessment begins. Renders title + markdown body
 * from the question bank config + "Begin" / "Cancel" buttons.
 */

import { Stack } from "@mantine/core";
import { PageHeader } from "@/components/typography";
import MarkdownView from "@/components/typography/MarkdownView";
import BaseCard from "@/components/base-card/BaseCard";
import ButtonPair from "@/components/button/ButtonPair";

interface AssessmentIntroProps {
  /** Intro page title from config */
  title: string;
  /** Intro page body (markdown) from config */
  body: string;
  /** Called when "Begin" is clicked */
  onBegin: () => void;
  /** Called when "Cancel" is clicked */
  onCancel?: () => void;
  /** Whether the begin button is disabled */
  disabled?: boolean;
  /** Whether the assessment is being created */
  loading?: boolean;
}

export function AssessmentIntro({
  title,
  body,
  onBegin,
  onCancel,
  disabled = false,
  loading = false,
}: AssessmentIntroProps) {
  return (
    <Stack gap="lg">
      <PageHeader title={title} />
      <BaseCard>
        <MarkdownView source={body} />
      </BaseCard>
      <ButtonPair
        acceptLabel={loading ? "Loading exam\u2026" : "Begin"}
        onAccept={onBegin}
        acceptDisabled={disabled || loading}
        acceptLoading={loading}
        onCancel={onCancel}
        cancelLabel="Cancel"
      />
    </Stack>
  );
}
