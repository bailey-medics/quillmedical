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
  /**
   * The holder's own email address, so the form can refuse it.
   *
   * The server refuses a self-request too, but only once the whole form
   * has been filled in and sent. Catching it here says so while the
   * address is still being typed. Passed in rather than read from auth
   * so the component stays presentational.
   */
  holderEmail?: string;
  /**
   * The holder's own username, refused for the same reason.
   *
   * Needed separately because the search leaves the caller out of its
   * results, so a holder typing their own username finds nobody and
   * would be told to keep typing rather than that they had named
   * themselves.
   */
  holderUsername?: string;
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
  holderEmail,
  holderUsername,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: SignOffRequestFormProps) {
  const [assessorEmail, setAssessorEmail] = useState("");
  const [observedOn, setObservedOn] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [reflection, setReflection] = useState("");

  const typed = assessorEmail.trim();
  const looksLikeEmail = EMAIL_PATTERN.value.test(typed);

  // Looked up as they type, so a holder is told what will happen rather
  // than guessing. Debounced because a request per keystroke would mean
  // twenty lookups to type one address.
  const [debouncedEmail] = useDebouncedValue(typed, 400);
  // The answer and the address it answers for, together. Two pieces of
  // state that must agree, so they are one: "still looking" is then
  // derived rather than tracked, and cannot drift out of step with the
  // result the way a separate loading flag can.
  const [lookup, setLookup] = useState<{
    email: string;
    match: AssessorMatch | null;
  } | null>(null);

  // Searched on whatever was typed, not only on an address. Somebody
  // already on Quill can be named however the holder knows them — by
  // name, by username or by address — and only somebody Quill has
  // never heard of must be given as an address.
  useEffect(() => {
    if (debouncedEmail.length < 3) {
      return;
    }

    let cancelled = false;

    searchAssessors(debouncedEmail)
      .then(({ matches }) => {
        if (cancelled) return;
        // One match and one only. Two people answering to "Okonkwo" is
        // not an answer, and picking the first would name whichever the
        // database happened to return — the mistake this whole step
        // exists to prevent.
        const term = debouncedEmail.toLowerCase();
        const exactEmail = matches.find((m) => m.email.toLowerCase() === term);
        const sole = matches.length === 1 ? matches[0] : null;
        setLookup({ email: debouncedEmail, match: exactEmail ?? sole });
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

  // The answer for what is in the box now, rather than a stale one for
  // something typed earlier.
  const settled = lookup?.email === debouncedEmail ? lookup : null;
  const found = settled?.match ?? null;

  // The rule: somebody on Quill may be named any way the holder knows
  // them; somebody who is not must be given as an address, because an
  // address is the only thing that can be emailed.
  // A passport records a second person's judgement, so naming yourself
  // is not a sign-off at all. Compared on the address because that is
  // what gets sent; a holder typing their own name finds nobody
  // already, since the search leaves the caller out.
  const typedLower = typed.toLowerCase();
  const isSelf = [holderEmail, holderUsername].some(
    (own) =>
      own !== undefined &&
      own.trim() !== "" &&
      typedLower === own.trim().toLowerCase(),
  );

  const namesSomebody = !isSelf && (found !== null || looksLikeEmail);

  const canSubmit = namesSomebody && observedOn !== null && !isSubmitting;

  // Asking is the last moment the holder can catch naming the wrong
  // person, so the form stops here and shows who it found before
  // anything is sent.
  const [confirming, setConfirming] = useState(false);

  function handleSubmit() {
    if (!canSubmit || observedOn === null) return;

    onSubmit({
      // The address of whoever was found, or what was typed when
      // nobody was. Sending the typed text for a person found by name
      // would post "Dr Amara Okonkwo" as an email address.
      assessor_email: (found?.email ?? typed).toLowerCase(),
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
          description="Name, username or email address"
          placeholder="assessor@example.nhs.uk"
          value={assessorEmail}
          onChange={(event) => setAssessorEmail(event.currentTarget.value)}
          error={isSelf ? "You cannot sign off yourself" : undefined}
          required
        />

        {/* What will happen, rather than leaving the holder to guess.
            Naming yourself is the one case that goes to the field's
            error channel instead, red and with an icon, because it is
            a real mistake rather than a form not finished: no amount
            of further typing makes that address the right one. A
            half-typed name is merely unfinished, so it is said plainly
            here and only once the lookup has answered. */}
        {settled !== null && !isSelf && (
          <BodyText>
            {found
              ? `${found.full_name ?? found.username} already uses Quill. ` +
                "They will be emailed and can sign in to sign this off."
              : namesSomebody
                ? "Nobody on Quill uses that address. They will be " +
                  "emailed an invitation, and can register to sign " +
                  "this off."
                : "No match yet. Keep typing, or use their email " +
                  "address if they do not use Quill."}
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
            {found ? (
              <>
                <BodyText>
                  {found.full_name ?? found.username} will be asked to sign off{" "}
                  {competency.name}.
                </BodyText>
                <BodyText>{found.email}</BodyText>
                {found.registrations.map((registration) => (
                  <BodyText key={`${registration.body}-${registration.number}`}>
                    {registration.body} {registration.number} — stated by them,
                    not checked by Quill.
                  </BodyText>
                ))}
              </>
            ) : (
              <>
                <BodyText>
                  {typed} will be asked to sign off {competency.name}.
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
