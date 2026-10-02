/**
 * OfficerList Component
 *
 * The named people on a safety case: clinical safety officer, deputy,
 * product owner and top management, one card each. Short enough that
 * cards read better than a table. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { SimpleGrid } from "@mantine/core";
import { BaseCard, CardActionRow } from "@/components/base-card";
import IconButton from "@/components/button/IconButton";
import { IconPencil } from "@/components/icons/appIcons";
import { BodyText, BodyTextBold } from "@/components/typography";
import type { Officer } from "@lib/safety";

export interface OfficerListProps {
  officers: Officer[];
  /**
   * Called with the officer whose edit icon was pressed. Without it no
   * icon is drawn, so the list reads the same anywhere it is only read.
   */
  onEdit?: (officer: Officer) => void;
}

export default function OfficerList({ officers, onEdit }: OfficerListProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
      {officers.map((officer) => (
        <BaseCard key={officer.role}>
          <CardActionRow
            action={
              onEdit && (
                <IconButton
                  icon={<IconPencil />}
                  variant="subtle"
                  color="primary"
                  aria-label={`Edit ${officer.role.toLowerCase()}`}
                  onClick={() => onEdit(officer)}
                />
              )
            }
          >
            <BodyTextBold>{officer.role}</BodyTextBold>
            <BodyText>{officer.name}</BodyText>
            <BodyText c="dimmed">{officer.email}</BodyText>
          </CardActionRow>
        </BaseCard>
      ))}
    </SimpleGrid>
  );
}
