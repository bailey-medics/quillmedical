/**
 * Notes List Component
 *
 * Displays clinical note cards with title, category badge, date,
 * author/role, and content (with pre-wrap for multi-paragraph notes).
 * Provides loading state with skeletons.
 */

import { Badge, Group, Skeleton, Stack, Text, Title } from "@mantine/core";
import QuillCard from "@/components/quill-card/QuillCard";

export type ClinicalNote = {
  id: string;
  title: string;
  date: string;
  author: string;
  authorRole: string;
  category: "consultation" | "telephone" | "observation" | "procedure";
  content: string;
};

type Props = {
  notes: ClinicalNote[];
  onNoteClick?: (note: ClinicalNote) => void;
  isLoading?: boolean;
};

function getCategoryColour(category: ClinicalNote["category"]): string {
  switch (category) {
    case "consultation":
      return "blue";
    case "telephone":
      return "teal";
    case "observation":
      return "green";
    case "procedure":
      return "orange";
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

export default function NotesList({ notes, onNoteClick, isLoading }: Props) {
  if (isLoading) {
    return (
      <Stack gap="lg">
        {[1, 2, 3].map((i) => (
          <QuillCard key={i}>
            <Stack gap="sm">
              <Group justify="space-between">
                <Skeleton height={24} width="60%" />
                <Skeleton height={24} width={80} radius="xl" />
              </Group>
              <Skeleton height={16} width="50%" />
              <Skeleton height={16} width="100%" />
              <Skeleton height={16} width="100%" />
              <Skeleton height={16} width="80%" />
            </Stack>
          </QuillCard>
        ))}
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      {notes.map((note) => (
        <QuillCard
          key={note.id}
          style={onNoteClick ? { cursor: "pointer" } : undefined}
          onClick={onNoteClick ? () => onNoteClick(note) : undefined}
        >
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={4}>{note.title}</Title>
              <Badge
                color={getCategoryColour(note.category)}
                variant="light"
                size="lg"
              >
                {note.category}
              </Badge>
            </Group>
            <Group gap="lg">
              <Text size="sm" c="dimmed">
                {formatDate(note.date)}
              </Text>
              <Text size="sm" c="dimmed">
                {note.author} — {note.authorRole}
              </Text>
            </Group>
            <Text size="md" style={{ whiteSpace: "pre-wrap" }}>
              {note.content}
            </Text>
          </Stack>
        </QuillCard>
      ))}
    </Stack>
  );
}
