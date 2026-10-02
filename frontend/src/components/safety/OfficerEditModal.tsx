/**
 * OfficerEditModal Component
 *
 * Edit one officer on a safety case: their name and email. The role is
 * shown and not editable, because the roles are the posts a case has,
 * as a position is, and renaming one here would be renaming the post.
 * Shaped like `GrantCompetencyModal`. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { useState } from "react";
import { Modal, Stack } from "@mantine/core";
import { ButtonPair } from "@/components/button";
import { EmailField, TextField } from "@components/form";
import { BodyText, Heading } from "@/components/typography";
import type { Officer } from "@lib/safety";

export interface OfficerEditModalProps {
  /** The officer being edited, or null when closed */
  officer: Officer | null;
  onClose: () => void;
  /** Called with the edited officer; the role is carried through unchanged */
  onSave: (officer: Officer) => void;
}

/** A loose shape check: something before an @, a dot after it. */
function looksLikeEmail(value: string): boolean {
  const at = value.indexOf("@");
  return at > 0 && value.indexOf(".", at) > at + 1 && !/\s/.test(value);
}

/**
 * The fields, keyed by the officer in the modal below so they start from
 * each officer afresh without an effect writing state.
 */
function OfficerFields({
  officer,
  onClose,
  onSave,
}: {
  officer: Officer;
  onClose: () => void;
  onSave: (officer: Officer) => void;
}) {
  const [name, setName] = useState(officer.name);
  const [email, setEmail] = useState(officer.email);

  const canSubmit = name.trim().length > 0 && looksLikeEmail(email.trim());

  function save() {
    if (!canSubmit) return;
    onSave({ role: officer.role, name: name.trim(), email: email.trim() });
    onClose();
  }

  return (
    <Stack gap="md">
      <BodyText c="dimmed">{officer.role}</BodyText>
      <TextField
        label="Name"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        required
      />
      <EmailField
        label="Email"
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
        required
      />
      <ButtonPair
        acceptLabel="Save changes"
        acceptDisabled={!canSubmit}
        onAccept={save}
        onCancel={onClose}
      />
    </Stack>
  );
}

export default function OfficerEditModal({
  officer,
  onClose,
  onSave,
}: OfficerEditModalProps) {
  return (
    <Modal
      opened={officer !== null}
      onClose={onClose}
      title={<Heading>Edit officer</Heading>}
      size="lg"
      centered
    >
      {officer && (
        <OfficerFields
          key={officer.role}
          officer={officer}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Modal>
  );
}
