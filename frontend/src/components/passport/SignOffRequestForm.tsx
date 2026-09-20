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

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import BaseCard from "@/components/base-card/BaseCard";
import {
  DateField,
  EmailField,
  EMAIL_PATTERN,
  SelectField,
  TextAreaField,
} from "@components/form";
import { BodyText, Heading } from "@/components/typography";
import ButtonPair from "@/components/button/ButtonPair";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal";
import { IconFileText } from "@/components/icons/appIcons";
import { searchAssessors } from "@lib/passport";
import type {
  AssessorMatch,
  CompetencyState,
  SignOffRequestInput,
} from "@lib/passport";

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

  // Looked up as they type, so a holder is told what will happen rather
  // than guessing. Debounced because a request per keystroke would mean
  // twenty lookups to type one address.
  const [debouncedEmail] = useDebouncedValue(trimmedEmail, 400);
  // The answer and the address it answers for, together. Two pieces of
  // state that must agree, so they are one: "still looking" is then
  // derived rather than tracked, and cannot drift out of step with the
  // result the way a separate loading flag can.
  const [lookup, setLookup] = useState<{
    email: string;
    match: AssessorMatch | null;
  } | null>(null);

  useEffect(() => {
    if (!EMAIL_PATTERN.value.test(debouncedEmail)) {
      return;
    }

    let cancelled = false;

    searchAssessors(debouncedEmail)
      .then(({ matches }) => {
        if (cancelled) return;
        // Matched on the address, so only an exact one is this person:
        // a search for "a.okonkwo@" must not claim to have found
        // somebody whose address merely contains it.
        const exact = matches.find(
          (m) => m.email.toLowerCase() === debouncedEmail.toLowerCase(),
        );
        setLookup({ email: debouncedEmail, match: exact ?? null });
      })
      .catch(() => {
        // Not fatal. The request can still be sent; the holder simply
        // is not told in advance which of the two will happen.
        if (!cancelled) setLookup({ email: debouncedEmail, match: null });
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedEmail]);

  const canSubmit = emailLooksValid && observedOn !== null && !isSubmitting;

  // Asking is the last moment the holder can catch naming the wrong
  // person, so the form stops here and shows who it found before
  // anything is sent.
  const [confirming, setConfirming] = useState(false);

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
          description="Their email address. They do not need a Quill account."
          placeholder="assessor@example.nhs.uk"
          value={assessorEmail}
          onChange={(event) => setAssessorEmail(event.currentTarget.value)}
          error={emailError}
          required
        />

        {/* What will happen to the address, rather than leaving the
            holder to guess. Only once the address is well formed and
            the lookup has answered: saying "we will email a new
            assessor" while somebody is still halfway through typing a
            colleague's address would be wrong more often than right. */}
        {emailLooksValid && lookup?.email === debouncedEmail && (
          <BodyText>
            {lookup.match
              ? `${lookup.match.full_name ?? lookup.match.username} already uses Quill. ` +
                "They will be emailed and can sign in to sign this off."
              : "Nobody on Quill uses that address. They will be emailed " +
                "an invitation, and can register to sign this off."}
          </BodyText>
        )}

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
          onAccept={() => setConfirming(true)}
          onCancel={onCancel}
        />

        {/* Step 3 of the flow. A known assessor is shown by name and
            registration number, so the holder can see they picked the
            right person: two consultants may share a name, and an
            address says only that somebody controls a mailbox. An
            unknown address shows only what was typed, because that is
            genuinely all Quill knows about them. */}
        <ConfirmModal
          opened={confirming}
          onClose={() => setConfirming(false)}
          onAccept={handleSubmit}
          title="Ask for this sign-off?"
          acceptLabel="Send request"
          destructive={false}
          icon={<IconFileText />}
        >
          <Stack gap="xs">
            {lookup?.match ? (
              <>
                <BodyText>
                  {lookup.match.full_name ?? lookup.match.username} will be
                  asked to sign off {competency.name}.
                </BodyText>
                <BodyText>{lookup.match.email}</BodyText>
                {lookup.match.registrations.map((registration) => (
                  <BodyText key={`${registration.body}-${registration.number}`}>
                    {registration.body} {registration.number} — stated by them,
                    not checked by Quill.
                  </BodyText>
                ))}
              </>
            ) : (
              <>
                <BodyText>
                  {trimmedEmail} will be asked to sign off {competency.name}.
                </BodyText>
                <BodyText>
                  Nobody on Quill uses that address, so they will be emailed an
                  invitation and can register to sign.
                </BodyText>
              </>
            )}
          </Stack>
        </ConfirmModal>
      </Stack>
    </BaseCard>
  );
}
