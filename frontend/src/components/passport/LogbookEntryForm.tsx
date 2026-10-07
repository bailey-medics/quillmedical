/**
 * LogbookEntryForm Component
 *
 * One procedure, as the holder recorded it.
 *
 * **This is a self-declared record and nobody countersigns it.** A
 * logbook proves activity, not competence – two hundred bronchoscopies
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
  EmailField,
  EMAIL_PATTERN,
  SelectField,
  TextAreaField,
  TextField,
} from "@components/form";
import { BodyText, Heading } from "@/components/typography";
import ButtonPair from "@/components/button/ButtonPair";
import type {
  CompetencyState,
  LogbookEntry,
  LogbookEntryInput,
  Supervision,
} from "@lib/passport";
import type { ScopeOption } from "@lib/passport/scopes";

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
  /**
   * What an entry for this competency may count towards, if it declares
   * scopes. The field is offered only then, and may be left empty: an
   * entry is the holder's own and can be corrected, where a sign-off
   * must name its scope.
   */
  scopes?: ScopeOption[];
  /** Called with the completed entry */
  onSubmit: (data: LogbookEntryInput) => void;
  /** Called when the holder backs out */
  onCancel?: () => void;
  /** Disables submission while a request is in flight */
  isSubmitting?: boolean;
  /**
   * An entry to correct. The form starts filled in from it, and says so
   * in its heading and button; without it the form adds a new entry.
   */
  initial?: LogbookEntry;
}

/**
 * LogbookEntryForm
 *
 * Renders the entry. Only the date is required – the rest is detail the
 * holder adds where it is worth adding.
 */
export default function LogbookEntryForm({
  competency,
  scopes,
  onSubmit,
  onCancel,
  isSubmitting = false,
  initial,
}: LogbookEntryFormProps) {
  const [scopeId, setScopeId] = useState<string | null>(
    initial?.scope?.id ?? null,
  );
  const [performedOn, setPerformedOn] = useState<string | null>(
    initial?.performed_on ?? null,
  );
  const [setting, setSetting] = useState(initial?.setting ?? "");
  const [supervision, setSupervision] = useState<Supervision | null>(
    initial?.supervision ?? null,
  );
  const [supervisor, setSupervisor] = useState(initial?.supervisor ?? "");
  const [indication, setIndication] = useState(initial?.indication ?? "");
  const [outcome, setOutcome] = useState(initial?.outcome ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [confirmerEmail, setConfirmerEmail] = useState("");

  // Optional, so an empty box is fine and a half-typed address is not:
  // the server would refuse it after the rest of the form was filled in.
  const confirmer = confirmerEmail.trim();
  const confirmerIsValid =
    confirmer === "" || EMAIL_PATTERN.value.test(confirmer);

  const canSubmit = performedOn !== null && confirmerIsValid && !isSubmitting;

  function handleSubmit() {
    if (!canSubmit || performedOn === null) return;

    onSubmit({
      performed_on: performedOn,
      scope_id: scopeId,
      setting: setting.trim() || null,
      supervision,
      supervisor: supervisor.trim() || null,
      indication: indication.trim() || null,
      outcome: outcome.trim() || null,
      notes: notes.trim() || null,
      confirmer_email: confirmer === "" ? null : confirmer.toLowerCase(),
    });
  }

  return (
    <BaseCard data-testid="logbook-entry-form">
      <Stack gap="md">
        <Heading>
          {initial
            ? `Edit this ${competency.name} entry`
            : `Add a ${competency.name} entry`}
        </Heading>

        <DateField
          label="Performed on"
          description="The day the procedure happened, not the day you are logging it."
          value={performedOn}
          onChange={setPerformedOn}
          maxDate={new Date()}
          maxLevel="year"
          required
        />

        {scopes && scopes.length > 0 && (
          <SelectField
            label="What it counts towards"
            description="A sign-off counts the entries for what it covers. Optional."
            placeholder="Choose one"
            clearable
            data={scopes.map((scope) => ({
              value: scope.id,
              label: scope.name,
            }))}
            value={scopeId}
            onChange={setScopeId}
          />
        )}

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

        {/* Optional, and most entries never use it: a logbook is the
            holder's own claim. Naming somebody emails them, and they
            confirm that the procedure happened as recorded, which is
            not an assessment. */}
        <EmailField
          label="Ask a supervisor to confirm this entry"
          description="Optional. They are emailed, and their name is recorded beside the entry once they confirm it."
          placeholder="supervisor@example.nhs.uk"
          value={confirmerEmail}
          onChange={(event) => setConfirmerEmail(event.currentTarget.value)}
          error={confirmerIsValid ? undefined : "Enter a full email address"}
        />

        {/* Said before saving, not after: the supervisor confirmed what
            the entry said then, so changing it removes their name. */}
        {initial?.confirmed_by && (
          <BodyText>
            {initial.confirmed_by.name} confirmed this entry. Saving changes
            removes their confirmation, and you can ask for it again above.
          </BodyText>
        )}

        <ButtonPair
          acceptLabel={initial ? "Save changes" : "Add entry"}
          acceptDisabled={!canSubmit}
          acceptLoading={isSubmitting}
          onAccept={handleSubmit}
          onCancel={onCancel}
        />
      </Stack>
    </BaseCard>
  );
}
