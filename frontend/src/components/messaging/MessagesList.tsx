/**
 * Messages List Component
 *
 * Displays a list of message threads with profile icons, unread counts,
 * and message previews. Automatically uses ProfilePic for single-participant
 * threads and StackedProfilePics for multi-participant threads.
 */

import type { StackedParticipant } from "@/components/profile-pic";
import { StackedProfilePics } from "@/components/profile-pic";
import ProfilePic from "@/components/profile-pic/ProfilePic";
import UnreadBadge from "@/components/badge/UnreadBadge";
import {
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

export type MessageThread = {
  /** Unique thread identifier */
  id: string;
  /** Display name shown as the card heading */
  displayName: string;
  /** Participants for profile icon display */
  profiles: StackedParticipant[];
  /** Last message preview */
  lastMessage: string;
  /** Last message timestamp (ISO 8601) */
  lastMessageTime: string;
  /** Number of unread messages */
  unreadCount: number;
};

type Props = {
  threads: MessageThread[];
  onThreadClick: (thread: MessageThread) => void;
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

export default function MessagesList({
  threads,
  onThreadClick,
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
              <Skeleton height={isMobile ? 32 : 48} circle />
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
      {threads.map((thread) => (
        <div
          key={thread.id}
          onClick={() => onThreadClick(thread)}
          style={{ cursor: "pointer" }}
        >
          <Card shadow="sm" padding="md" radius="md" withBorder>
            <Group wrap="nowrap" align="flex-start">
              {thread.profiles.length > 1 ? (
                <StackedProfilePics
                  participants={thread.profiles}
                  size={iconSize}
                />
              ) : (
                <ProfilePic
                  givenName={thread.profiles[0]?.givenName}
                  familyName={thread.profiles[0]?.familyName}
                  gradientIndex={thread.profiles[0]?.gradientIndex}
                  size={iconSize}
                />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <Group justify="space-between" mb="xs">
                  <Group gap="xs">
                    <Text fw={700} size="lg">
                      {thread.displayName}
                    </Text>
                    <UnreadBadge count={thread.unreadCount} />
                  </Group>
                  <Text size="lg" c="dimmed">
                    {formatTime(thread.lastMessageTime)}
                  </Text>
                </Group>

                <Text size="lg" c="dimmed" lineClamp={2} mb="xs">
                  {thread.lastMessage}
                </Text>
              </div>
            </Group>
          </Card>
        </div>
      ))}
    </Stack>
  );
}
