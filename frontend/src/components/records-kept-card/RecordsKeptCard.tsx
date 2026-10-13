/**
 * Records kept card
 *
 * How long one organisation's training records are kept after
 * somebody's account is closed, with a pencil that opens the page where
 * it is changed. Shown to an operator of Quill on the organisation's
 * admin page, for any organisation, whether or not it teaches.
 *
 * Laid out as the enabled features card beside it is: a heading, the
 * pencil, and what is set now.
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import IconButton from "@/components/button/IconButton";
import { IconPencil } from "@components/icons/appIcons";
import {
  BodyText,
  BodyTextBold,
  BodyTextInline,
  Heading,
} from "@/components/typography";
import { periodInWords } from "@/lib/retention/recordsKept";

export interface RecordsKeptCardProps {
  /** The months records are kept, or null when none is set */
  months: number | null;
  /** Opens the page where the period is changed */
  onEdit: () => void;
}

export default function RecordsKeptCard({
  months,
  onEdit,
}: RecordsKeptCardProps) {
  return (
    <BaseCard>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Heading>Record retention</Heading>
          <IconButton
            icon={<IconPencil />}
            onClick={onEdit}
            aria-label="Edit record retention"
          />
        </Group>

        <Group gap="xs">
          <BodyTextBold>Kept after an account is closed:</BodyTextBold>
          <BodyTextInline>{periodInWords(months)}</BodyTextInline>
        </Group>

        <BodyText>
          {months === null
            ? "With no period set, this organisation's training records are never listed for deletion."
            : "After that, a closed account's training records here are listed for a decision. Nothing is deleted without one."}
        </BodyText>
      </Stack>
    </BaseCard>
  );
}
