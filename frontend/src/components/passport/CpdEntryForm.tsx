/**
 * CpdEntryForm Component
 *
 * One continuing professional development activity, as the holder
 * recorded it: a conference, a grand round, a teaching day, a course.
 *
 * **Self-declared, like the logbook.** Nobody countersigns a CPD entry,
 * so there is no declaration and no assessor here. A certificate may
 * evidence it, but the entry itself is the holder's own claim.
 *
 * **Points are optional and never totalled here.** A form records one
 * activity; what a period adds up to is a display concern belonging to
 * the table, which states the appraisal range it covers. Showing a
 * running total on an entry form would pre-empt that.
 *
 * One point is one hour, and points is the unit end to end — the
 * frontend, the API and the record model all name the field `points`.
 *
 * **`activity_on` decides the year the entry is filed under**, which is
 * why it cannot be in the future: UK appraisal runs annually and asks
 * what you did this year, so the date is what makes the record usable
 * rather than merely stored.
 *
 * @example
 * ```tsx
 * <CpdEntryForm onSubmit={addActivity} />
 * ```
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import {
  DateField,
  SelectField,
  TextAreaField,
  TextField,
} from "@components/form";
import { Heading } from "@/components/typography";
import ButtonPair from "@/components/button/ButtonPair";
import type { CpdActivityType, CpdEntryInput } from "@lib/passport";

/**
 * What the activity was. Open enough to cover what people actually
 * claim, closed enough to tally by type later.
 */
const ACTIVITY_TYPE_OPTIONS: { value: CpdActivityType; label: string }[] = [
  { value: "conference", label: "Conference" },
  { value: "grand round", label: "Grand round" },
  { value: "teaching day", label: "Teaching day" },
  { value: "course", label: "Course" },
  { value: "other", label: "Other" },
];

export interface CpdEntryFormProps {
  /** Called with the completed activity */
  onSubmit: (data: CpdEntryInput) => void;
  /** Called when the holder backs out */
  onCancel?: () => void;
  /** Disables submission while a request is in flight */
  isSubmitting?: boolean;
}

export default function CpdEntryForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: CpdEntryFormProps) {
  const [activityOn, setActivityOn] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState<CpdActivityType | null>(
    null,
  );
  const [points, setPoints] = useState("");
  const [notes, setNotes] = useState("");

  // A date, a title and a type: the three things that make an entry
  // readable a year later at appraisal. Points are genuinely optional —
  // not every activity is claimed.
  const canSubmit =
    activityOn !== null &&
    title.trim().length > 0 &&
    activityType !== null &&
    !isSubmitting;

  function handleSubmit() {
    if (!canSubmit || activityOn === null || activityType === null) return;

    const parsedPoints = Number.parseFloat(points);

    onSubmit({
      activity_on: activityOn,
      title: title.trim(),
      activity_type: activityType,
      points: Number.isFinite(parsedPoints) ? parsedPoints : null,
      notes: notes.trim() || null,
    });
  }

  return (
    <BaseCard data-testid="cpd-entry-form">
      <Stack gap="md">
        <Heading>Record a CPD activity</Heading>

        <DateField
          label="Date"
          description="The day it happened. This decides the appraisal year it is filed under."
          value={activityOn}
          onChange={setActivityOn}
          maxDate={new Date()}
          maxLevel="year"
          required
        />

        <TextField
          label="What was it?"
          description="How you would describe it to an appraiser."
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          required
        />

        <SelectField
          label="Type"
          placeholder="Choose one"
          data={ACTIVITY_TYPE_OPTIONS}
          value={activityType}
          onChange={(value) => setActivityType(value as CpdActivityType | null)}
          required
        />

        <TextField
          label="Points"
          description="One point is one hour. Optional — not every activity is claimed."
          type="number"
          min={0}
          step={0.5}
          value={points}
          onChange={(event) => setPoints(event.currentTarget.value)}
        />

        <TextAreaField
          label="Notes"
          description="Optional. Write about the activity, not about a patient."
          value={notes}
          onChange={(event) => setNotes(event.currentTarget.value)}
          autosize
          minRows={2}
        />

        <ButtonPair
          acceptLabel="Record activity"
          acceptDisabled={!canSubmit}
          acceptLoading={isSubmitting}
          onAccept={handleSubmit}
          onCancel={onCancel}
        />
      </Stack>
    </BaseCard>
  );
}
