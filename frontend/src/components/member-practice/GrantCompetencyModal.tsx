/**
 * Give somebody a competency, and authorise it at one org_unit.
 *
 * The form and the confirm in one: granting reaches every place the
 * person works, so the modal says so beside the choice rather than asking
 * again after it.
 */

import { useState } from "react";
import { Modal, Stack } from "@mantine/core";
import SelectField from "@/components/form/SelectField";
import { ButtonPair } from "@/components/button";
import { BodyText, Heading } from "@/components/typography";

/** One competency the person could be given. */
export interface GrantOption {
  /** The competency id. */
  id: string;
  /** What it is called. */
  name: string;
}

/** Props for {@link GrantCompetencyModal}. */
export interface GrantCompetencyModalProps {
  /** Whether the modal is open. */
  opened: boolean;
  /** Called on cancel, and after a grant succeeds. */
  onClose: () => void;
  /** The competencies they do not hold, to choose from. */
  options: GrantOption[];
  /** Their username, as confirm text names somebody. */
  username: string;
  /** The org_unit they will be authorised at. */
  orgUnitName: string;
  /** A competency to start with chosen, or none. */
  initial?: string | null;
  /** Grant the chosen competency. The modal stays open if this throws. */
  onGrant: (competency: string) => Promise<void>;
}

/**
 * Choose a competency to grant and authorise here.
 *
 * @param props - Component props
 * @returns The modal
 */
export default function GrantCompetencyModal({
  opened,
  onClose,
  options,
  username,
  orgUnitName,
  initial = null,
  onGrant,
}: GrantCompetencyModalProps) {
  const [chosen, setChosen] = useState<string | null>(initial);
  const [saving, setSaving] = useState(false);

  async function grant() {
    if (!chosen) return;
    setSaving(true);
    try {
      await onGrant(chosen);
      onClose();
    } catch {
      // The caller says what went wrong; the choice stays for a retry.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Heading>Grant competency</Heading>}
      size="lg"
      centered
      closeOnEscape={!saving}
    >
      <Stack gap="md">
        <SelectField
          label="Competency"
          placeholder="Choose a competency"
          data={options.map((option) => ({
            value: option.id,
            label: option.name,
          }))}
          value={chosen}
          onChange={setChosen}
          searchable
          nothingFoundMessage="No competency matches"
        />
        <BodyText>
          This gives {username} the competency everywhere they work, not only at{" "}
          {orgUnitName}, and authorises them to practise it here.
        </BodyText>
        <ButtonPair
          acceptLabel="Grant and authorise"
          onAccept={() => void grant()}
          onCancel={onClose}
          acceptDisabled={!chosen || saving}
          acceptLoading={saving}
        />
      </Stack>
    </Modal>
  );
}
