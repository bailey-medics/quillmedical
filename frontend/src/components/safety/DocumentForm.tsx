/**
 * DocumentForm Component
 *
 * Edit a safety document's markdown, placeholders and all. The sheet
 * renders what is saved here with the case's placeholders filled in, so
 * a `{{ key }}` stays a `{{ key }}` in the editor. Shaped like the
 * passport forms. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { ButtonPair } from "@/components/button";
import { TextAreaField } from "@components/form";

export interface DocumentFormProps {
  /** The markdown to start from */
  initial: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export default function DocumentForm({
  initial,
  onSave,
  onCancel,
}: DocumentFormProps) {
  const [content, setContent] = useState(initial);
  const canSubmit = content.trim().length > 0;

  return (
    <BaseCard data-testid="document-form">
      <Stack gap="md">
        <TextAreaField
          label="Document"
          description="Markdown. A {{ key }} placeholder is filled in from the case's placeholders when the document is shown."
          value={content}
          onChange={(event) => setContent(event.currentTarget.value)}
          autosize
          minRows={20}
          required
        />
        <ButtonPair
          acceptLabel="Save changes"
          acceptDisabled={!canSubmit}
          onAccept={() => canSubmit && onSave(content)}
          onCancel={onCancel}
        />
      </Stack>
    </BaseCard>
  );
}
