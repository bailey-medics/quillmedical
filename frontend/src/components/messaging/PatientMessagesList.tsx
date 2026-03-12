/**
 * Patient Messages List Component
 *
 * Displays a list of conversations for a specific patient.
 * Unlike UserMessagesList, this shows the names of other participants
 * (clinicians, staff) rather than the patient name, since the patient
 * context is already evident from the page.
 */

import type { Conversation, Participant } from "@/pages/Messages";
import {
  StackedProfilePics,
  type StackedParticipant,
} from "@/components/profile-pic";
import {
  Badge,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

type Props = {
  conversations: Conversation[];
  onConversationClick: (conversation: Conversation) => void;
  isLoading?: boolean;
};

/**
 * Format timestamp to relative time (e.g., "2 hours ago")
 */
function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  } catch {
    return timestamp;
  }
}

/**
 * Get the display name for a patient conversation card.
 * Shows all non-patient participants, falling back to assignedTo
 * for backward compatibility.
 */
function getDisplayName(conv: Conversation): string {
  if (conv.participants && conv.participants.length > 0) {
    return conv.participants.map((p) => p.displayName).join(", ");
  }
  return conv.assignedTo ?? "Unassigned";
}

/**
 * Deterministic gradient index from a name string (0-29).
 */
function nameToGradientIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 30;
}

/**
 * Convert a Participant to a StackedParticipant for the profile icons.
 */
function toStackedParticipant(p: Participant): StackedParticipant {
  const fullName = [p.givenName, p.familyName].filter(Boolean).join(" ");
  return {
    givenName: p.givenName,
    familyName: p.familyName,
    gradientIndex: nameToGradientIndex(fullName),
  };
}

/**
 * Build the participants array for the stacked icons.
 */
function buildParticipants(conv: Conversation): StackedParticipant[] {
  if (conv.participants && conv.participants.length > 0) {
    return conv.participants.map(toStackedParticipant);
  }
  if (conv.assignedTo) {
    const parts = conv.assignedTo.trim().split(/\s+/);
    const givenName = parts[0];
    const familyName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
    return [
      {
        givenName,
        familyName,
        gradientIndex: nameToGradientIndex(conv.assignedTo),
      },
    ];
  }
  return [];
}

/**
 * Patient Messages List
 *
 * Renders a list of conversation cards for a single patient.
 * Each card shows the other participant(s) in the conversation,
 * the last message preview, unread count, and status badge.
 */
export default function PatientMessagesList({
  conversations,
  onConversationClick,
  isLoading,
}: Props) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const iconSize = isMobile ? "sm" : "md";

  if (isLoading) {
    return (
      <Stack gap="sm">
        {[1, 2, 3].map((i) => (
          <Card key={i} shadow="sm" padding="md" radius="md" withBorder>
            <Group wrap="nowrap" align="flex-start">
              <Skeleton height={50} circle />
              <div style={{ flex: 1 }}>
                <Skeleton height={20} width="60%" mb="xs" />
                <Skeleton height={16} width="100%" mb="xs" />
                <Skeleton height={14} width="40%" />
              </div>
            </Group>
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      {conversations.map((conv) => {
        const displayName = getDisplayName(conv);
        const participants = buildParticipants(conv);

        return (
          <div
            key={conv.id}
            onClick={() => onConversationClick(conv)}
            style={{ cursor: "pointer" }}
          >
            <Card shadow="sm" padding="md" radius="md" withBorder>
              <Group wrap="nowrap" align="flex-start">
                <StackedProfilePics
                  participants={participants}
                  size={iconSize}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                      <Text fw={700} size="lg">
                        {displayName}
                      </Text>
                      {conv.unreadCount > 0 && (
                        <Badge size="lg" color="blue.4" variant="filled" circle>
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </Group>
                    <Text size="lg" c="dimmed">
                      {formatTime(conv.lastMessageTime)}
                    </Text>
                  </Group>

                  <Text size="lg" c="dimmed" lineClamp={2} mb="xs">
                    {conv.lastMessage}
                  </Text>
                </div>
              </Group>
            </Card>
          </div>
        );
      })}
    </Stack>
  );
}
