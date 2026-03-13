/**
 * Letters List Component
 *
 * Displays a list of clinical letter cards with title, status badge,
 * date, author, and summary. Provides loading state with skeletons.
 */

import {
  Badge,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";

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

function getStatusColour(status: LetterSummary["status"]): string {
  switch (status) {
    case "final":
      return "green";
    case "draft":
      return "yellow";
    case "amended":
      return "blue";
    default:
      return "gray";
  }
}

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
          <Card key={i} shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Skeleton height={24} width="60%" />
                <Skeleton height={24} width={60} radius="xl" />
              </Group>
              <Skeleton height={16} width="50%" />
              <Skeleton height={16} width="100%" />
              <Skeleton height={16} width="80%" />
            </Stack>
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      {letters.map((letter) => (
        <Card
          key={letter.id}
          shadow="sm"
          padding="lg"
          radius="md"
          withBorder
          style={{ cursor: "pointer" }}
          onClick={() => onLetterClick(letter)}
        >
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={4}>{letter.title}</Title>
              <Badge
                color={getStatusColour(letter.status)}
                variant="light"
                size="lg"
              >
                {letter.status}
              </Badge>
            </Group>
            <Group gap="lg">
              <Text size="sm" c="dimmed">
                {formatDate(letter.date)}
              </Text>
              <Text size="sm" c="dimmed">
                {letter.author} — {letter.authorRole}
              </Text>
            </Group>
            <Text size="md">{letter.summary}</Text>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
