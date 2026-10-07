/**
 * LogbookConfirmationForm Component
 *
 * A supervisor's half of confirming one logbook entry: what the holder
 * recorded, a box to tick, and the button that puts the supervisor's
 * name on it.
 *
 * **Confirming is not assessing.** It says the procedure happened as
 * recorded here, which is what a signature beside a line in a paper
 * logbook says. Whether the holder is competent is a sign-off, a
 * different act with a declaration of its own, so this form carries no
 * level, no declaration of competence and no caveats.
 *
 * **A tickbox, not a switch.** Nothing happens until the button is
 * pressed, and a switch would look as though it had already taken
 * effect.
 *
 * **"Not mine to confirm" closes the ask** and leaves the entry as the
 * holder wrote it. Without it, an entry sent to the wrong person would
 * wait in their inbox for ever.
 *
 * @example
 * ```tsx
 * <LogbookConfirmationForm
 *   confirmation={confirmation}
 *   onConfirm={confirm}
 *   onDecline={decline}
 * />
 * ```
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import ButtonPair from "@/components/button/ButtonPair";
import { CheckboxField } from "@components/form";
import PassportRecordCard from "@/components/passport/PassportRecordCard";
import { BodyText, Heading } from "@/components/typography";
import type { LogbookConfirmation } from "@lib/passport";

export interface LogbookConfirmationFormProps {
  /** The entry, and who is asking for it to be confirmed */
  confirmation: LogbookConfirmation;
  /** Called when the supervisor confirms the entry */
  onConfirm: () => void;
  /** Called when the supervisor says it is not theirs to confirm */
  onDecline: () => void;
  /** Disables both answers while one is in flight */
  isSubmitting?: boolean;
}

/**
 * LogbookConfirmationForm
 *
 * Renders the entry and the two answers. Confirming is refused until
 * the box is ticked.
 */
export default function LogbookConfirmationForm({
  confirmation,
  onConfirm,
  onDecline,
  isSubmitting = false,
}: LogbookConfirmationFormProps) {
  const [ticked, setTicked] = useState(false);
  const { holder_name, competency, entry } = confirmation;

  return (
    <Stack gap="lg" data-testid="logbook-confirmation-form">
      <BaseCard>
        <Stack gap="xs">
          <Heading>{competency.name}</Heading>
          <BodyText>
            {holder_name} has asked you to confirm this entry in their logbook.
            Confirming says it happened as recorded here. It is not an
            assessment of their competence.
          </BodyText>
        </Stack>
      </BaseCard>

      <PassportRecordCard
        date={entry.performed_on}
        facts={[
          { label: "Counts towards", value: entry.scope?.name ?? null },
          { label: "Setting", value: entry.setting },
          {
            label: "Supervision",
            value:
              entry.supervision === "supervised"
                ? "Supervised"
                : entry.supervision === "independent"
                  ? "Independent"
                  : null,
          },
          { label: "Supervisor", value: entry.supervisor },
          { label: "Indication", value: entry.indication },
          { label: "Outcome", value: entry.outcome },
          { label: "Notes", value: entry.notes, prose: true },
        ]}
      />

      <BaseCard>
        <Stack gap="md">
          <CheckboxField
            label="This happened as recorded here"
            description="Your name and registration are recorded beside the entry."
            checked={ticked}
            onChange={(event) => setTicked(event.currentTarget.checked)}
          />

          <ButtonPair
            acceptLabel="Confirm entry"
            cancelLabel="Not mine to confirm"
            acceptDisabled={!ticked || isSubmitting}
            acceptLoading={isSubmitting}
            onAccept={onConfirm}
            onCancel={onDecline}
          />
        </Stack>
      </BaseCard>
    </Stack>
  );
}
