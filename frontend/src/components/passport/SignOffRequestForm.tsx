/**
 * SignOffRequestForm Component
 *
 * The holder's half of a sign-off: naming an assessor, saying when the
 * work was observed, and optionally adding a reflection.
 *
 * **The assessor is named by email address, not picked from a list.**
 * The consultant who observed the work is often at another trust, or
 * not on Quill at all, and that is the case this feature exists for —
 * a dropdown of existing users had no row for them, so the holder
 * could not ask. An address is what a holder knows; whether it belongs
 * to an account is Quill's problem, not theirs.
 *
 * **The holder chooses their own assessor**, and nothing filters who is
 * "allowed" to sign. Who is fit to assess whom is a clinical judgement
 * that varies by procedure, department and the people involved, and any
 * rule table encoding it would be wrong somewhere on the day it
 * shipped. The one rule the API enforces is that it cannot be the
 * holder themselves — the whole value of the record is a second named
 * person accepting accountability.
 *
 * **`observed_on` is a day with no time**, and cannot be in the future:
 * it records work that has already happened. It is deliberately distinct
 * from `signed_at`, which the server sets when the assessor signs, often
 * days or weeks later.
 *
 * @example
 * ```tsx
 * <SignOffRequestForm competency={competency} onSubmit={request} />
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
} from "@components/form";
import { Heading } from "@/components/typography";
import ButtonPair from "@/components/button/ButtonPair";
import type { CompetencyState, SignOffRequestInput } from "@lib/passport";

/** A level the competency offers, where it declares any. */
export interface LevelOption {
  id: string;
  name: string;
}

export interface SignOffRequestFormProps {
  /** The competency being requested */
  competency: CompetencyState;
  /** Levels this competency declares, if it has any */
  levels?: LevelOption[];
  /** Called with the completed request */
  onSubmit: (data: SignOffRequestInput) => void;
  /** Called when the holder backs out */
  onCancel?: () => void;
  /** Disables submission while a request is in flight */
  isSubmitting?: boolean;
}

/**
 * SignOffRequestForm
 *
 * Renders the request. Submission is refused until an assessor is named
 * and an observed date given.
 */
export default function SignOffRequestForm({
  competency,
  levels,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: SignOffRequestFormProps) {
  const [assessorEmail, setAssessorEmail] = useState("");
  const [observedOn, setObservedOn] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [reflection, setReflection] = useState("");

  const trimmedEmail = assessorEmail.trim();
  const emailLooksValid = EMAIL_PATTERN.value.test(trimmedEmail);

  // Only once something has been typed: an empty field is a form not
  // filled in yet, not a mistake, and colouring it red on arrival is
  // the most common way a form greets somebody with a complaint.
  const emailError =
    trimmedEmail !== "" && !emailLooksValid ? EMAIL_PATTERN.message : undefined;

  const canSubmit = emailLooksValid && observedOn !== null && !isSubmitting;

  function handleSubmit() {
    if (!canSubmit || observedOn === null) return;

    onSubmit({
      assessor_email: trimmedEmail.toLowerCase(),
      observed_on: observedOn,
      level_id: levelId,
      comments: comments.trim() || null,
      reflection: reflection.trim() || null,
    });
  }

  return (
    <BaseCard data-testid="sign-off-request-form">
      <Stack gap="md">
        <Heading>Request sign-off for {competency.name}</Heading>

        <EmailField
          label="Who should assess this?"
          description="Their email address. They do not need a Quill account — we will email them, and they can sign in or register to sign."
          placeholder="assessor@example.nhs.uk"
          value={assessorEmail}
          onChange={(event) => setAssessorEmail(event.currentTarget.value)}
          error={emailError}
          required
        />

        <DateField
          label="Observed on"
          description="The day the work happened, not the day you are asking."
          value={observedOn}
          onChange={setObservedOn}
          maxDate={new Date()}
          maxLevel="year"
          required
        />

        {levels && levels.length > 0 && (
          <SelectField
            label="Level"
            description="What you are asking to be signed off for."
            placeholder="Choose a level"
            data={levels.map((level) => ({
              value: level.id,
              label: level.name,
            }))}
            value={levelId}
            onChange={setLevelId}
          />
        )}

        <TextAreaField
          label="Anything the assessor should know"
          description="Optional."
          value={comments}
          onChange={(event) => setComments(event.currentTarget.value)}
          autosize
          minRows={2}
        />

        <TextAreaField
          label="Your reflection"
          description="Optional, and kept with the record. Write about the work, not about a patient."
          value={reflection}
          onChange={(event) => setReflection(event.currentTarget.value)}
          autosize
          minRows={3}
        />

        <ButtonPair
          acceptLabel="Request sign-off"
          acceptDisabled={!canSubmit}
          acceptLoading={isSubmitting}
          onAccept={handleSubmit}
          onCancel={onCancel}
        />
      </Stack>
    </BaseCard>
  );
}
