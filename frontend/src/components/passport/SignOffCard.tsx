/**
 * SignOffCard Component
 *
 * One sign-off in full: what was assessed, who signed it, when, on what
 * evidence, and with what caveats.
 *
 * A sign-off is the one thing in a passport that is not the holder's own
 * claim. Certificates, logbook entries, reflections and CPD are things
 * the holder entered with nobody countersigning; this is a named person
 * accepting accountability for a judgement. The card is deliberately
 * heavier than anything rendering self-declared evidence, so the
 * difference is visible without anyone having to think about it.
 *
 * Three clocks are kept apart and never presented as one another:
 * `observed_on` is when the work was watched, `signed_at` is when the
 * assessor signed, and the commit timestamp is not shown here at all.
 * Consultants often sign days or weeks after observing, so the gap is
 * ordinary — the card shows both and draws no conclusion from the
 * distance between them.
 *
 * @example
 * ```tsx
 * <SignOffCard signOff={signOff} />
 * ```
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import SignOffStatusBadge from "@/components/badge/SignOffStatusBadge";
import FormattedDate from "@/components/data/Date";
import Icon from "@/components/icons";
import { IconFileText } from "@/components/icons/appIcons";
import {
  BodyText,
  BodyTextBold,
  BodyTextInline,
  Heading,
} from "@/components/typography";
import RegistrationBadge from "./RegistrationBadge";
import type { SignOff } from "@lib/passport";

export interface SignOffCardProps {
  /** The sign-off to render */
  signOff: SignOff;
}

/** A labelled fact, used for the several date and text fields below. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap={2}>
      <BodyTextBold>{label}</BodyTextBold>
      <BodyText>{children}</BodyText>
    </Stack>
  );
}

/**
 * SignOffCard
 *
 * Renders the sign-off, its assessor snapshot and its evidence.
 */
export default function SignOffCard({ signOff }: SignOffCardProps) {
  const {
    competency,
    status,
    kind,
    level,
    observed_on,
    signed_at,
    expires_on,
    signed_off_by,
    meaning,
    comments,
    evidence,
    attachments,
    content_hash,
  } = signOff;

  return (
    <BaseCard data-testid="sign-off-card">
      <Stack gap="md">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={2}>
            <Heading>{competency.name}</Heading>
            {level && <BodyTextInline>{level.name}</BodyTextInline>}
          </Stack>
          <SignOffStatusBadge status={status} />
        </Group>

        <Group gap="xl" wrap="wrap" align="flex-start">
          <Field label="Observed on">
            <FormattedDate date={observed_on} format="medium" />
          </Field>

          {signed_at && (
            <Field label="Signed">
              <FormattedDate date={signed_at.slice(0, 10)} format="medium" />
            </Field>
          )}

          {expires_on && (
            <Field label="Review due">
              <FormattedDate date={expires_on} format="medium" />
            </Field>
          )}
        </Group>

        {/* What the assessor actually did. Three clinically different
            acts, and a record that does not say which is weaker than it
            looks. */}
        {meaning && <Field label="Basis">{meaning}</Field>}

        {kind !== "initial" && <Field label="Kind">{kind}</Field>}

        {signed_off_by && (
          <Stack gap="xs">
            <BodyTextBold>Signed off by</BodyTextBold>
            <BodyText>
              {signed_off_by.name} — {signed_off_by.role}
            </BodyText>
            {signed_off_by.care_location && (
              <BodyText c="dimmed">{signed_off_by.care_location}</BodyText>
            )}
            {signed_off_by.registrations.map((registration) => (
              <RegistrationBadge
                key={`${registration.body}-${registration.number}`}
                registration={registration}
              />
            ))}
          </Stack>
        )}

        {comments && <Field label="Comments">{comments}</Field>}

        {/* What was in front of the assessor when they decided — a record
            of the evidence, never a threshold that was met. */}
        {evidence && (
          <Field label="Evidence at signing">
            {evidence.logbook_entries} logbook{" "}
            {evidence.logbook_entries === 1 ? "entry" : "entries"}
            {evidence.certificates.length > 0 &&
              `, ${evidence.certificates.length} certificate${
                evidence.certificates.length === 1 ? "" : "s"
              }`}
          </Field>
        )}

        {attachments.length > 0 && (
          <Stack gap="xs">
            <BodyTextBold>Attachments</BodyTextBold>
            {attachments.map((attachment) => (
              <Group key={attachment.hash} gap="xs" wrap="nowrap">
                <Icon icon={<IconFileText />} size="sm" />
                <BodyTextInline>{attachment.filename}</BodyTextInline>
              </Group>
            ))}
          </Stack>
        )}

        {content_hash && (
          <Stack gap={2}>
            <BodyTextBold>Content hash</BodyTextBold>
            <BodyText c="dimmed">{content_hash}</BodyText>
          </Stack>
        )}
      </Stack>
    </BaseCard>
  );
}
