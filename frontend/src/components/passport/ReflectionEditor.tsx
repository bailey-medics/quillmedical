/**
 * ReflectionEditor Component
 *
 * A reflection on a case, a complaint or a significant event: the
 * frontmatter fields, then the writing itself.
 *
 * **The anonymisation tick is required, not a reminder.** Reflections
 * are one of only two org_units patient data could enter a passport, and
 * they are the likelier one because they are written about real cases.
 * The logbook carries a passive note in a field description; here it is
 * a checkbox that must be ticked, worded more firmly, and the API
 * refuses the write without it.
 *
 * **The prose is the substance**, which is why the structure sits in
 * frontmatter rather than in a separate file the way a sign-off's does.
 *
 * @example
 * ```tsx
 * <ReflectionEditor onSubmit={addReflection} />
 * ```
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import {
  CheckboxField,
  DateField,
  TextAreaField,
  TextField,
} from "@components/form";
import { Heading } from "@/components/typography";
import ButtonPair from "@/components/button/ButtonPair";
import type { Reflection, ReflectionInput } from "@lib/passport";

/**
 * The anonymisation declaration, exported so a test can assert the
 * wording and a future page can record exactly what was confirmed.
 *
 * Deliberately firmer than the logbook's note: it names what must not
 * appear rather than gesturing at it, because a reflection is written
 * about a real person and the temptation to identify them is real.
 */
export const ANONYMISATION_DECLARATION =
  "I confirm this reflection contains nothing that could identify a " +
  "patient - no name, no date of birth, no NHS number, no hospital " +
  "number, and no detail so unusual that it would single somebody out.";

export interface ReflectionEditorProps {
  /** Called with the completed reflection */
  onSubmit: (data: ReflectionInput) => void;
  /** Called when the holder backs out */
  onCancel?: () => void;
  /** Disables submission while a request is in flight */
  isSubmitting?: boolean;
  /**
   * A reflection already written, to rewrite. The editor starts filled
   * in from it. The anonymisation tick does not: it is a declaration
   * about the words being saved, so it is made again for the new ones.
   */
  initial?: Reflection;
}

export default function ReflectionEditor({
  onSubmit,
  onCancel,
  isSubmitting = false,
  initial,
}: ReflectionEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [writtenOn, setWrittenOn] = useState<string | null>(
    initial?.written_on ?? null,
  );
  const [body, setBody] = useState(initial?.body ?? "");
  const [anonymised, setAnonymised] = useState(false);

  // The tick is required, exactly as the API requires it. Nothing is
  // written without it.
  const canSubmit =
    title.trim().length > 0 &&
    writtenOn !== null &&
    body.trim().length > 0 &&
    anonymised &&
    !isSubmitting;

  function handleSubmit() {
    if (!canSubmit || writtenOn === null) return;

    onSubmit({
      title: title.trim(),
      written_on: writtenOn,
      body: body.trim(),
      anonymised_confirmed: anonymised,
    });
  }

  return (
    <BaseCard data-testid="reflection-editor">
      <Stack gap="md">
        <Heading>
          {initial ? "Edit this reflection" : "Write a reflection"}
        </Heading>

        <TextField
          label="Title"
          description="How you would find this again."
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          required
        />

        <DateField
          label="Written on"
          value={writtenOn}
          onChange={setWrittenOn}
          maxDate={new Date()}
          maxLevel="year"
          required
        />

        <TextAreaField
          label="Your reflection"
          description="What happened, what you took from it, and what you would do differently."
          value={body}
          onChange={(event) => setBody(event.currentTarget.value)}
          autosize
          minRows={8}
          required
        />

        <CheckboxField
          label="I confirm this reflection is anonymised"
          description={ANONYMISATION_DECLARATION}
          checked={anonymised}
          onChange={(event) => setAnonymised(event.currentTarget.checked)}
          required
        />

        <ButtonPair
          acceptLabel={initial ? "Save changes" : "Save reflection"}
          acceptDisabled={!canSubmit}
          acceptLoading={isSubmitting}
          onAccept={handleSubmit}
          onCancel={onCancel}
        />
      </Stack>
    </BaseCard>
  );
}
