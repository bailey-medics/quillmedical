/**
 * LogbookEntryForm Component
 *
 * One procedure, as the holder recorded it.
 *
 * **This is a self-declared record and nobody countersigns it.** A
 * logbook proves activity, not competence — two hundred bronchoscopies
 * are still two hundred bronchoscopies, and it is the sign-off that
 * turns evidence into a conclusion. The form must never imply otherwise,
 * so there is no declaration here, no assessor, and no target to work
 * towards.
 *
 * **`performed_on` is a day with no time**, and cannot be in the future.
 * Nobody recalls whether a procedure was at 09:30 or 11:00 when logging
 * five of them on a Friday evening, and the file the server writes is
 * named for the moment it was written rather than for this date.
 *
 * **Failures are recorded like anything else.** `outcome` is free text
 * rather than a success flag: an abandoned attempt is part of the
 * record, and a logbook showing only successes is worth less to everyone
 * reading it.
 *
 * @example
 * ```tsx
 * <LogbookEntryForm competency={competency} onSubmit={addEntry} />
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
import type {
  CompetencyState,
  LogbookEntryInput,
  Supervision,
} from "@lib/passport";

/**
 * Whether the holder was supervised, from their own point of view.
 * Recorded, never judged: an entry logged as supervised is not a lesser
 * entry, it is a different fact.
 */
const SUPERVISION_OPTIONS: { value: Supervision; label: string }[] = [
  { value: "supervised", label: "Supervised" },
  { value: "independent", label: "Independent" },
];

export interface LogbookEntryFormProps {
  /** The competency this entry counts towards */
  competency: CompetencyState;
  /** Called with the completed entry */
  onSubmit: (data: LogbookEntryInput) => void;
  /** Called when the holder backs out */
  onCancel?: () => void;
  /** Disables submission while a request is in flight */
  isSubmitting?: boolean;
}

/**
 * LogbookEntryForm
 *
 * Renders the entry. Only the date is required — the rest is detail the
 * holder adds where it is worth adding.
 */
export default function LogbookEntryForm({
  competency,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: LogbookEntryFormProps) {
  const [performedOn, setPerformedOn] = useState<string | null>(null);
  const [setting, setSetting] = useState("");
  const [supervision, setSupervision] = useState<Supervision | null>(null);
  const [supervisor, setSupervisor] = useState("");
  const [indication, setIndication] = useState("");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");

  const canSubmit = performedOn !== null && !isSubmitting;

  function handleSubmit() {
    if (!canSubmit || performedOn === null) return;

    onSubmit({
      performed_on: performedOn,
      setting: setting.trim() || null,
      supervision,
      supervisor: supervisor.trim() || null,
      indication: indication.trim() || null,
      outcome: outcome.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <BaseCard data-testid="logbook-entry-form">
      <Stack gap="md">
        <Heading>Add a {competency.name} entry</Heading>

        <DateField
          label="Performed on"
          description="The day the procedure happened, not the day you are logging it."
          value={performedOn}
          onChange={setPerformedOn}
          maxDate={new Date()}
          maxLevel="year"
          required
        />

        <TextField
          label="Setting"
          description="Where it happened. Optional."
          value={setting}
          onChange={(event) => setSetting(event.currentTarget.value)}
        />

        <SelectField
          label="Supervision"
          description="Recorded as a fact, not judged. Optional."
          placeholder="Choose one"
          data={SUPERVISION_OPTIONS}
          value={supervision}
          onChange={(value) => setSupervision(value as Supervision | null)}
        />

        <TextField
          label="Supervisor"
          description="Who was supervising, where somebody was. Optional."
          value={supervisor}
          onChange={(event) => setSupervisor(event.currentTarget.value)}
        />

        <TextField
          label="Indication"
          description="Why it was done. Optional, and never a patient identifier."
          value={indication}
          onChange={(event) => setIndication(event.currentTarget.value)}
        />

        <TextField
          label="Outcome"
          description="What happened, including where it did not go to plan."
          value={outcome}
          onChange={(event) => setOutcome(event.currentTarget.value)}
        />

        <TextAreaField
          label="Notes"
          description="Optional. Write about the procedure, not about a patient."
          value={notes}
          onChange={(event) => setNotes(event.currentTarget.value)}
          autosize
          minRows={2}
        />

        <ButtonPair
          acceptLabel="Add entry"
          acceptDisabled={!canSubmit}
          acceptLoading={isSubmitting}
          onAccept={handleSubmit}
          onCancel={onCancel}
        />
      </Stack>
    </BaseCard>
  );
}
