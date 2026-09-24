/**
 * InviteAssessorForm Component
 *
 * Brings somebody from outside onto the platform to assess.
 *
 * **Most consultants who sign a registrar's passport will never
 * otherwise use Quill.** They cannot be asked to become staff of a trust
 * they do not work for, so the holder invites them by email and they
 * register through the existing invite-token flow.
 *
 * **The registration is what the holder was told, not something Quill
 * has checked.** It is collected so the invitation can say who is being
 * asked, confirmed by the assessor on acceptance, and verified
 * separately by an administrator later. The form says so rather than
 * implying the number will be checked.
 *
 * **An invitation brings a person, not a competency.** `competency_id`
 * is optional and writes a more specific email; it is deliberately not
 * stored, because one assessor goes on to sign off many competencies
 * over months and a stored one would describe only the first.
 *
 * @example
 * ```tsx
 * <InviteAssessorForm onSubmit={invite} />
 * ```
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { EmailField, SelectField, TextField } from "@components/form";
import { Heading } from "@/components/typography";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconInfoCircle } from "@/components/icons/appIcons";
import ButtonPair from "@/components/button/ButtonPair";
import CompetencyPicker from "./CompetencyPicker";
import { registrationAuthorities } from "@lib/passport";
import type { AssessorInviteInput } from "@lib/passport";

export interface InviteAssessorFormProps {
  /** Called with the completed invitation */
  onSubmit: (data: AssessorInviteInput) => void;
  /** Called when the holder backs out */
  onCancel?: () => void;
  /** Disables submission while a request is in flight */
  isSubmitting?: boolean;
  /** Competency ids a site curates as commonly used, for the picker */
  commonlyUsedHere?: string[];
}

export default function InviteAssessorForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
  commonlyUsedHere,
}: InviteAssessorFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [authority, setAuthority] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [competencyId, setCompetencyId] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    authority !== null &&
    number.trim().length > 0 &&
    !isSubmitting;

  function handleSubmit() {
    if (!canSubmit || authority === null) return;

    onSubmit({
      name: name.trim(),
      email: email.trim(),
      registration_authority: authority,
      registration_number: number.trim(),
      competency_id: competencyId,
    });
  }

  return (
    <BaseCard data-testid="invite-assessor-form">
      <Stack gap="md">
        <Heading>Invite an assessor</Heading>

        <StateMessage
          icon={<IconInfoCircle />}
          title="Quill does not check the register"
          description="Give the registration you were told. The assessor confirms it when they accept, and an administrator can verify it against the register by hand."
          colour="info"
        />

        <TextField
          label="Their name"
          description="As it should appear on the sign-off."
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
        />

        <EmailField
          label="Their email"
          description="Where the invitation is sent. It cannot be forwarded on from here."
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          required
        />

        <SelectField
          label="Registration body"
          placeholder="Choose one"
          data={registrationAuthorities()}
          value={authority}
          onChange={setAuthority}
          required
        />

        <TextField
          label="Registration number"
          value={number}
          onChange={(event) => setNumber(event.currentTarget.value)}
          required
        />

        {/* Optional, and deliberately not stored: it makes the email
            specific, but one assessor signs off many competencies. */}
        <CompetencyPicker
          value={competencyId}
          onChange={setCompetencyId}
          commonlyUsedHere={commonlyUsedHere}
          label="What are you asking them to assess?"
          description="Optional. Used to write a clearer email, and not kept afterwards."
        />

        <ButtonPair
          acceptLabel="Send invitation"
          acceptDisabled={!canSubmit}
          acceptLoading={isSubmitting}
          onAccept={handleSubmit}
          onCancel={onCancel}
        />
      </Stack>
    </BaseCard>
  );
}
