/**
 * OfficerList Component
 *
 * The named people on a safety case: clinical safety officer, deputy,
 * product owner and top management, one card each. Short enough that
 * cards read better than a table. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { SimpleGrid, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { BodyText, BodyTextBold } from "@/components/typography";
import type { Officer } from "@lib/safety";

export interface OfficerListProps {
  officers: Officer[];
}

export default function OfficerList({ officers }: OfficerListProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
      {officers.map((officer) => (
        <BaseCard key={`${officer.role}-${officer.name}`}>
          <Stack gap="xs">
            <BodyTextBold>{officer.role}</BodyTextBold>
            <BodyText>{officer.name}</BodyText>
            <BodyText c="dimmed">{officer.email}</BodyText>
          </Stack>
        </BaseCard>
      ))}
    </SimpleGrid>
  );
}
