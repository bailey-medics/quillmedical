/**
 * Letter View Component Module
 *
 * Detail view for displaying full clinical letter content. Shows letter
 * metadata (sender, date, subject) and complete body text. Provides
 * back navigation and optional action buttons.
 */

import { ActionIcon, Avatar, Box, Skeleton, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
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
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Skeleton circle width={40} height={40} />
          <div style={{ flex: 1 }}>
            <Skeleton height={18} width="60%" />
            <Skeleton height={12} width="30%" style={{ marginTop: 6 }} />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <Skeleton height={200} />
        </div>
      </div>
    );
  }

  if (!letter) return null;

  return (
    <div
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ActionIcon variant="light" onClick={onBack} aria-label="Back">
            <IconArrowLeft size={16} />
          </ActionIcon>
          <Avatar radius="xl">
            {letter.from ? letter.from.charAt(0) : "L"}
          </Avatar>
          <div>
            <Title order={4} style={{ margin: 0 }}>
              {letter.subject}
            </Title>
            <Text size="lg" color="dimmed">
              {letter.from}{" "}
              {letter.date ? `• ${new Date(letter.date).toLocaleString()}` : ""}
            </Text>
          </div>
        </div>
        <div>{actions}</div>
      </div>

      <Box style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 12 }}>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {letter.body ?? "(No content)"}
        </div>
      </Box>
    </div>
  );
}
