/**
 * Retention Exception Card
 *
 * One account a superadmin marked "Empty this account" that the nightly
 * run did not empty, and why. Shown under "Exceptions" on the record
 * retention screen.
 *
 * No choice to make, so no buttons: a failure is tried again each night,
 * and an account left alone is in use again. The card goes by itself
 * once the account is emptied, or is closed again.
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import FormattedDate from "@/components/data/Date";
import { BodyText, BodyTextBold, Heading } from "@/components/typography";
import {
  whatHappened,
  type RetentionException,
} from "@/lib/retention/retentionReviews";

interface RetentionExceptionCardProps {
  /** The account, and why it was not emptied */
  exception: RetentionException;
}

export default function RetentionExceptionCard({
  exception,
}: RetentionExceptionCardProps) {
  return (
    <BaseCard>
      <Stack gap="md">
        <Stack gap={4}>
          <Heading>{exception.full_name || "No name recorded"}</Heading>
          <BodyText>{exception.email}</BodyText>
        </Stack>

        <Stack gap={4}>
          <Group gap="xs">
            <BodyTextBold>Account closed:</BodyTextBold>
            <FormattedDate date={exception.closed_at} />
          </Group>
          <Group gap="xs">
            <BodyTextBold>Due to be emptied:</BodyTextBold>
            <FormattedDate date={exception.due_on} />
          </Group>
          <Group gap="xs">
            <BodyTextBold>Last tried:</BodyTextBold>
            <FormattedDate date={exception.noted_at} />
          </Group>
        </Stack>

        <BodyText>{whatHappened(exception)}</BodyText>
      </Stack>
    </BaseCard>
  );
}
