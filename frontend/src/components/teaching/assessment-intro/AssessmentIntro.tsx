/**
 * AssessmentIntro Component
 *
 * Intro page before assessment begins. Renders title + markdown body
 * from the question bank config + "Begin" button.
 */

import { Stack } from "@mantine/core";
import { PageHeader } from "@/components/typography";
import MarkdownView from "@/components/typography/MarkdownView";
import BaseCard from "@/components/base-card/BaseCard";
import ActionCardButton from "@/components/button/ActionCardButton";

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
      <PageHeader title={title} />
      <BaseCard>
        <MarkdownView source={body} />
      </BaseCard>
      <ActionCardButton
        label={loading ? "Loading exam…" : "Begin"}
        onClick={onBegin}
        disabled={disabled || loading}
      />
    </Stack>
  );
}
