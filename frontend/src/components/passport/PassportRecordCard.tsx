/**
 * PassportRecordCard Component
 *
 * One of the holder's own records in full: a logbook entry, a CPD
 * activity, a certificate or a reflection.
 *
 * Every record page in the passport draws this same card, so each one is
 * read the same way: the date it happened as the heading, then labelled
 * facts. A fact with no value is left out rather than shown as a blank,
 * because an optional field left empty is an ordinary record, not an
 * incomplete one.
 *
 * Prose, a reflection or a note, is split on blank lines into
 * paragraphs, so what was written in paragraphs reads in them.
 *
 * @example
 * ```tsx
 * <PassportRecordCard
 *   date="2026-03-12"
 *   facts={[{ label: "Setting", value: "Endoscopy unit" }]}
 * />
 * ```
 */

import type { ReactNode } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import FormattedDate from "@/components/data/Date";
import { BodyText, BodyTextBold, Heading } from "@/components/typography";

/** One labelled fact. */
export interface RecordFact {
  /** What the fact is, such as "Setting" */
  label: string;
  /** The fact, or null where the holder recorded nothing */
  value: ReactNode | null;
  /** Written prose, shown as paragraphs split on blank lines */
  prose?: boolean;
}

export interface PassportRecordCardProps {
  /** When the thing recorded happened, as an ISO date */
  date: string;
  /** The facts beneath it, in the order to show them */
  facts: RecordFact[];
}

function Paragraphs({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return (
    <Stack gap="xs">
      {paragraphs.map((paragraph, index) => (
        <BodyText key={index}>{paragraph}</BodyText>
      ))}
    </Stack>
  );
}

export default function PassportRecordCard({
  date,
  facts,
}: PassportRecordCardProps) {
  return (
    <BaseCard data-testid="passport-record-card">
      <Stack gap="md">
        <Heading>
          <FormattedDate date={date} format="medium" />
        </Heading>

        {facts.map((fact) => {
          if (fact.value === null || fact.value === "") return null;

          return (
            <Stack key={fact.label} gap={2}>
              <BodyTextBold>{fact.label}</BodyTextBold>
              {fact.prose && typeof fact.value === "string" ? (
                <Paragraphs text={fact.value} />
              ) : (
                <BodyText>{fact.value}</BodyText>
              )}
            </Stack>
          );
        })}
      </Stack>
    </BaseCard>
  );
}
