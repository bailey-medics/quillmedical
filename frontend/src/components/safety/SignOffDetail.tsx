/**
 * SignOffDetail Component
 *
 * One section of a safety case's compliance sign-off: who signs it and
 * whether they have, what their signature attests, and the documents
 * they reviewed to give it. A line still awaiting a signature shows a
 * "Record signature" button that is for show only, as Phase 15 of the
 * plan says. Part of the safety mock-up; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import IconTextButton from "@/components/button/IconTextButton";
import FormattedDate from "@/components/data/Date";
import Icon from "@/components/icons";
import { IconCheck, IconClock } from "@/components/icons/appIcons";
import {
  BodyText,
  BodyTextBold,
  Heading,
  TextLink,
} from "@/components/typography";
import type { SafetyDocument, SignOffItem } from "@lib/safety";

export interface SignOffDetailProps {
  item: SignOffItem;
  /** The documents the section reviews, resolved from their ids */
  documents: SafetyDocument[];
  /** Where a document's page is */
  documentHref: (document: SafetyDocument) => string;
}

export default function SignOffDetail({
  item,
  documents,
  documentHref,
}: SignOffDetailProps) {
  return (
    <Stack gap="lg">
      <BaseCard>
        <Group gap="md" wrap="nowrap" align="flex-start">
          <Icon
            icon={item.signed_on ? <IconCheck /> : <IconClock />}
            size="md"
            colour={
              item.signed_on ? "var(--success-color)" : "var(--warning-color)"
            }
          />
          <Stack gap="xs" style={{ flex: 1 }}>
            <Heading>
              {item.signed_on ? "Signed" : "Awaiting signature"}
            </Heading>
            <BodyText>{item.signatory}</BodyText>
            {item.signed_on ? (
              <BodyText c="dimmed">
                Signed <FormattedDate date={item.signed_on} format="long" />
              </BodyText>
            ) : (
              <Group justify="flex-end">
                {/* For show only, by request: see Phase 15 of the plan. */}
                <IconTextButton icon="pencil" label="Record signature" />
              </Group>
            )}
          </Stack>
        </Group>
      </BaseCard>

      <BaseCard>
        <Stack gap="sm">
          <Heading>What this signature attests</Heading>
          <BodyText>{item.attests}</BodyText>
        </Stack>
      </BaseCard>

      <BaseCard>
        <Stack gap="sm">
          <Heading>Documents reviewed</Heading>
          {documents.map((document) => (
            <Stack key={document.id} gap={2}>
              <BodyTextBold>
                <TextLink to={documentHref(document)}>{document.name}</TextLink>
              </BodyTextBold>
              <BodyText c="dimmed">
                Version {document.version},{" "}
                {document.status === "approved" ? "approved" : "draft"}
              </BodyText>
            </Stack>
          ))}
        </Stack>
      </BaseCard>
    </Stack>
  );
}
