/**
 * SignOffChecklist Component
 *
 * The compliance sign-off for a safety case: each section of the
 * standard, who signs it, and when they did, or "Awaiting" while they
 * have not. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import Icon from "@/components/icons";
import { IconCheck, IconClock } from "@/components/icons/appIcons";
import FormattedDate from "@/components/data/Date";
import { BodyText, BodyTextBold } from "@/components/typography";
import type { SignOffItem } from "@lib/safety";

export interface SignOffChecklistProps {
  items: SignOffItem[];
}

export default function SignOffChecklist({ items }: SignOffChecklistProps) {
  return (
    <Stack gap="md">
      {items.map((item) => (
        <BaseCard key={item.section}>
          <Group gap="md" wrap="nowrap" align="flex-start">
            <Icon
              icon={item.signed_on ? <IconCheck /> : <IconClock />}
              size="md"
              colour={
                item.signed_on ? "var(--success-color)" : "var(--warning-color)"
              }
            />
            <Stack gap={4}>
              <BodyTextBold>{item.section}</BodyTextBold>
              <BodyText>{item.signatory}</BodyText>
              {item.signed_on ? (
                <BodyText c="dimmed">
                  Signed <FormattedDate date={item.signed_on} format="medium" />
                </BodyText>
              ) : (
                <BodyText c="dimmed">Awaiting signature</BodyText>
              )}
            </Stack>
          </Group>
        </BaseCard>
      ))}
    </Stack>
  );
}
