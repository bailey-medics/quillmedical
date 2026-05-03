/**
 * Letters List Component
 *
 * Displays a list of clinical letter cards with title, status badge,
 * date, author, and summary. Provides loading state with skeletons.
 */

import { Group, Skeleton, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { LetterStatusBadge } from "@/components/badge";
import StateMessage from "@/components/message-cards/StateMessage";
import Heading from "@/components/typography/Heading";
import BodyText from "@/components/typography/BodyText";
import BodyTextInline from "@/components/typography/BodyTextInline";

export type LetterSummary = {
  /** Unique letter identifier */
  id: string;
  /** Letter title */
  title: string;
  /** Letter date (ISO string) */
  date: string;
  /** Author name */
  author: string;
  /** Author role / specialty */
  authorRole: string;
  /** Letter status */
  status: "final" | "draft" | "amended";
  /** Summary / preview text */
  summary: string;
};

type Props = {
  letters: LetterSummary[];
  onLetterClick: (letter: LetterSummary) => void;
  isLoading?: boolean;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function LetterList({
  letters,
  onLetterClick,
  isLoading,
}: Props) {
  if (isLoading) {
    return (
      <Stack gap="lg">
        {[1, 2, 3].map((i) => (
          <BaseCard key={i}>
            <Stack gap="sm">
              <Group justify="space-between">
                <Skeleton height={24} width="60%" />
                <Skeleton height={24} width={60} radius="xl" />
              </Group>
              <Skeleton height={16} width="50%" />
              <Skeleton height={16} width="100%" />
              <Skeleton height={16} width="80%" />
            </Stack>
          </BaseCard>
        ))}
      </Stack>
    );
  }

  if (letters.length === 0) {
    return <StateMessage type="no-letters" />;
  }

  return (
    <Stack gap="lg">
      {letters.map((letter) => (
        <BaseCard
          key={letter.id}
          style={{ cursor: "pointer" }}
          onClick={() => onLetterClick(letter)}
        >
          <Stack gap="sm">
            <Group justify="space-between">
              <Heading>{letter.title}</Heading>
              <LetterStatusBadge status={letter.status} />
            </Group>
            <Group gap="lg">
              <BodyText>{formatDate(letter.date)}</BodyText>
              <BodyText>
                {letter.author} — {letter.authorRole}
              </BodyText>
            </Group>
            <BodyTextInline>{letter.summary}</BodyTextInline>
          </Stack>
        </BaseCard>
      ))}
    </Stack>
  );
}
