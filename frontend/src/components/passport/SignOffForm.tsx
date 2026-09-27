/**
 * SignOffForm Component
 *
 * What an assessor fills in to sign off a competency: the level reached,
 * what they actually did, any caveats, an optional narrative, and the
 * declaration they confirm before submitting.
 *
 * **The declaration is the signature.** There is no drawn scribble and
 * no uploaded image, because both look more official than a tick and
 * prove less — anyone can draw anyone's name, and an uploaded image is a
 * reusable credential that can be pasted onto anything. A confirmed box
 * behind an authenticated session is a valid simple electronic signature
 * under UK law, and it is what NES Turas, Kaizen and the RCP ePortfolio
 * already take for workplace-based assessment. What carries the weight
 * is the record around the tick: the named account, the timestamp, the
 * assessor's registrations frozen as they were, the content hash, and
 * the refusal to edit afterwards. See the plan's decision.
 *
 * Two rules follow, and the API enforces the first:
 *
 * - **`declaration_confirmed` starts false and must be ticked.** Never
 *   pre-ticked, never defaulted true. The route refuses without it and
 *   writes nothing.
 * - **The button names the act** — "Sign off competency", not "Save".
 *
 * **The assessor decides the level.** The holder's request is chosen to
 * start with, and the assessor may sign a different level on the scale,
 * higher or lower, but must then say why: the holder sees the reason
 * beside both levels. This replaced a read-only level on 27 September
 * 2026, which made an assessor decline rather than say "not unsupervised
 * yet, but indirect supervision, yes". The API refuses a changed level
 * with no reason too.
 *
 * @example
 * ```tsx
 * <SignOffForm signOff={signOff} onSubmit={submit} onCancel={close} />
 * ```
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@components/form";
import { levelsFor } from "@lib/passport/levels";
import { Heading } from "@/components/typography";
import ButtonPair from "@/components/button/ButtonPair";
import AssessorDeclaration from "./AssessorDeclaration";
import type { SignOff, SignOffInput, SignOffMeaning } from "@lib/passport";

/**
 * What the assessor actually did. Three clinically different acts, and a
 * record that does not say which one happened is weaker than it looks,
 * so this is required rather than defaulted.
 */
const MEANING_OPTIONS: { value: SignOffMeaning; label: string }[] = [
  { value: "directly observed", label: "Directly observed" },
  { value: "reviewed evidence", label: "Reviewed evidence" },
  { value: "countersigned", label: "Countersigned" },
];

export interface SignOffFormProps {
  /** The requested sign-off being signed */
  signOff: SignOff;
  /** Called with the completed input when the assessor submits */
  onSubmit: (data: SignOffInput) => void;
  /** Called when the assessor backs out without signing */
  onCancel?: () => void;
  /** Disables submission while a request is in flight */
  isSubmitting?: boolean;
}

/**
 * SignOffForm
 *
 * Renders the assessor's side of a sign-off. Submission is refused until
 * a basis is chosen and the declaration is confirmed.
 */
export default function SignOffForm({
  signOff,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: SignOffFormProps) {
  const [meaning, setMeaning] = useState<SignOffMeaning | null>(null);
  // What the holder asked for. A record from before `requested_level`
  // existed still holds the request in `level`, since nobody signed it.
  const requested = signOff.requested_level ?? signOff.level ?? null;
  const levels = levelsFor(signOff.competency.id);
  const [levelId, setLevelId] = useState<string | null>(requested?.id ?? null);
  const [comments, setComments] = useState("");
  const [assessment, setAssessment] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const changed =
    requested !== null && levelId !== null && levelId !== requested.id;
  const needsReason = changed && comments.trim() === "";

  // Required: the basis because three clinically different acts cannot
  // be left ambiguous, the declaration because it is what the assessor
  // is putting their name to, a level wherever there is a scale, and a
  // reason wherever the level differs from the one asked for.
  const canSubmit =
    meaning !== null &&
    confirmed &&
    (levels.length === 0 || levelId !== null) &&
    !needsReason &&
    !isSubmitting;

  function handleSubmit() {
    if (!canSubmit || meaning === null) return;

    onSubmit({
      meaning,
      declaration_confirmed: confirmed,
      level_id: levelId,
      comments: comments.trim() || null,
      assessment: assessment.trim() || null,
    });
  }

  return (
    <BaseCard data-testid="sign-off-form">
      <Stack gap="md">
        <Heading>Sign off {signOff.competency.name}</Heading>

        <SelectField
          label="What did you do?"
          description="Directly observing, reviewing evidence and countersigning are different acts, and the record says which."
          placeholder="Choose one"
          data={MEANING_OPTIONS}
          value={meaning}
          onChange={(value) => setMeaning(value as SignOffMeaning | null)}
          required
        />

        {levels.length > 0 ? (
          <SelectField
            label="Level"
            description={
              requested
                ? `Asked for: ${requested.name}. Choose another level if that is your judgement.`
                : "The level you are signing off."
            }
            placeholder="Choose a level"
            data={levels.map((level) => ({
              value: level.id,
              label: level.name,
            }))}
            value={levelId}
            onChange={setLevelId}
            required
          />
        ) : (
          // A level on the record with no scale in the catalogue: the
          // scale has changed since the request. Shown, not offered.
          signOff.level && (
            <TextField
              label="Level"
              value={signOff.level.name}
              readOnly
              description="Requested by the holder."
            />
          )
        )}

        <TextAreaField
          label={changed ? "Why a different level?" : "Caveats"}
          description={
            changed
              ? "Required when you sign off a different level from the one asked for. The holder sees this beside both levels."
              : "Anything qualifying this sign-off. Optional."
          }
          required={changed}
          value={comments}
          onChange={(event) => setComments(event.currentTarget.value)}
          autosize
          minRows={2}
        />

        <TextAreaField
          label="Assessment notes"
          description="Your own narrative, kept with the record. Optional."
          value={assessment}
          onChange={(event) => setAssessment(event.currentTarget.value)}
          autosize
          minRows={3}
        />

        {/* The checkbox sits inside the card, under the words it
            agrees to. No description on it: the declaration is right
            above, and repeating it showed the same paragraph twice. */}
        <AssessorDeclaration>
          <CheckboxField
            label="I confirm this declaration"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
            required
          />
        </AssessorDeclaration>

        <ButtonPair
          acceptLabel="Sign off competency"
          acceptDisabled={!canSubmit}
          acceptLoading={isSubmitting}
          onAccept={handleSubmit}
          onCancel={onCancel}
        />
      </Stack>
    </BaseCard>
  );
}
