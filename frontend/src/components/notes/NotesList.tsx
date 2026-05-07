/**
 * Notes List Component
 *
 * Displays clinical note cards with title, category badge, date,
 * author/role, and content (with pre-wrap for multi-paragraph notes).
 * Provides loading state with skeletons.
 */

import { Group, Skeleton, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconPencil } from "@/components/icons/appIcons";
import { NoteCategoryBadge } from "@/components/badge";
import type { NoteCategoryType } from "@/components/badge/NoteCategoryBadge";
import FormattedDate from "@/components/data/Date";
import { BodyTextBold, BodyTextInline, Heading } from "@/components/typography";

export type ClinicalNote = {
  id: string;
  title: string;
  date: string;
  author: string;
  authorRole: string;
  category: NoteCategoryType;
  content: string;
};

type Props = {
  notes: ClinicalNote[];
  onNoteClick?: (note: ClinicalNote) => void;
  isLoading?: boolean;
};

export default function NotesList({ notes, onNoteClick, isLoading }: Props) {
  if (isLoading) {
    return (
      <Stack gap="lg">
        {[1, 2, 3].map((i) => (
          <BaseCard key={i}>
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
          </BaseCard>
        ))}
      </Stack>
    );
  }

  if (notes.length === 0) {
    return (
      <StateMessage
        icon={<IconPencil />}
        title="No notes to show"
        description="There are no clinical notes for this patient yet."
        colour="warning"
      />
    );
  }

  return (
    <Stack gap="lg">
      {notes.map((note) => (
        <BaseCard
          key={note.id}
          style={onNoteClick ? { cursor: "pointer" } : undefined}
          onClick={onNoteClick ? () => onNoteClick(note) : undefined}
        >
          <Stack gap="sm">
            <Group justify="space-between">
              <Heading>{note.title}</Heading>
              <NoteCategoryBadge category={note.category} />
            </Group>
            <Group gap="lg">
              <BodyTextBold>
                <FormattedDate date={note.date} format="long" />
              </BodyTextBold>
              <BodyTextBold>
                {note.author} — {note.authorRole}
              </BodyTextBold>
            </Group>
            <BodyTextInline>{note.content}</BodyTextInline>
          </Stack>
        </BaseCard>
      ))}
    </Stack>
  );
}
