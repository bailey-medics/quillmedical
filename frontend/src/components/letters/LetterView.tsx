/**
 * Letter View Component Module
 *
 * Detail view for displaying full clinical letter content. Shows letter
 * metadata (sender, date, subject) and complete body text. Provides
 * back navigation and optional action buttons.
 */

import { Divider, Group, Skeleton, Stack } from "@mantine/core";
import { IconArrowLeft } from "@/components/icons/appIcons";
import IconButton from "@/components/button/IconButton";
import { Heading, BodyTextInline, MarkdownView } from "@/components/typography";
import type { ReactNode } from "react";

/**
 * Letter
 *
 * Represents a clinical letter for detail view.
 */
export type Letter = {
  /** Unique letter identifier */
  id: string;
  /** Letter subject/title */
  subject: string;
  /** Letter date (ISO string or display format) */
  date?: string;
  /** Sender name or department */
  from?: string;
  /** Full letter body content (markdown or plain text) */
  body?: string;
};

/**
 * LetterView Props
 */
type Props = {
  /** Letter to display (null if not loaded) */
  letter?: Letter | null;
  /** Whether letter is currently loading */
  isLoading?: boolean;
  /** Callback when back arrow is clicked */
  onBack?: () => void;
  /** Optional action buttons (e.g., download, print) */
  actions?: ReactNode;
};

/**
 * Letter View
 *
 * Renders full clinical letter detail with:
 * - Back navigation button
 * - Sender avatar and metadata
 * - Letter subject and date
 * - Complete letter body
 * - Optional action buttons (download, print, etc.)
 * - Loading skeleton state
 *
 * @param props - Component props
 * @returns Letter detail view component
 */
export default function LetterView({
  letter,
  isLoading = false,
  onBack,
  actions,
}: Props) {
  if (isLoading) {
    return (
      <Stack gap="md" p="md">
        <Group gap="md" align="center" wrap="nowrap">
          <Skeleton width={42} height={42} radius="md" />
          <Stack gap="xs" style={{ flex: 1 }}>
            <Skeleton height={20} width="60%" />
            <Skeleton height={14} width="35%" />
          </Stack>
        </Group>
        <Divider />
        <Stack gap="sm">
          <Skeleton height={14} width="90%" />
          <Skeleton height={14} width="100%" />
          <Skeleton height={14} width="75%" />
          <Skeleton height={14} width="85%" />
          <Skeleton height={14} width="40%" />
        </Stack>
      </Stack>
    );
  }

  if (!letter) return null;

  const formattedDate = letter.date
    ? new Date(letter.date).toLocaleDateString()
    : null;

  return (
    <Stack gap="md" p="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="md" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
          <IconButton
            icon={<IconArrowLeft />}
            variant="light"
            onClick={onBack}
            aria-label="Back"
            size="md"
          />
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Heading>{letter.subject}</Heading>
            <BodyTextInline>
              {letter.from}
              {formattedDate ? ` · ${formattedDate}` : ""}
            </BodyTextInline>
          </Stack>
        </Group>
        {actions && (
          <Group gap="xs" style={{ flexShrink: 0 }}>
            {actions}
          </Group>
        )}
      </Group>

      <Divider />

      <MarkdownView source={letter.body ?? "(No content)"} />
    </Stack>
  );
}
