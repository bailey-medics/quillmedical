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
import { Heading } from "@/components/typography";
import ButtonPair from "@/components/button/ButtonPair";
import AssessorDeclaration, {
  ASSESSOR_DECLARATION_TEXT,
} from "./AssessorDeclaration";
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
  // The level is the holder's request, shown read-only rather than
  // chosen here: the assessor accepts or declines what was asked for.
  const levelId = signOff.level?.id ?? null;
  const [comments, setComments] = useState("");
  const [assessment, setAssessment] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  // Both are required: the basis because three clinically different acts
  // cannot be left ambiguous, and the declaration because it is what the
  // assessor is putting their name to.
  const canSubmit = meaning !== null && confirmed && !isSubmitting;

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

        {signOff.level && (
          <TextField
            label="Level"
            value={signOff.level.name}
            readOnly
            description="Requested by the holder."
          />
        )}

        <TextAreaField
          label="Caveats"
          description="Anything qualifying this sign-off. Optional."
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

        <AssessorDeclaration />

        <CheckboxField
          label="I confirm this declaration"
          description={ASSESSOR_DECLARATION_TEXT}
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
          required
        />

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
