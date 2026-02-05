/**
 * Messages List Component
 *
 * Displays a list of patient conversations with preview information,
 * unread counts, and status indicators.
 */

import type { Conversation } from "@/pages/Messages";
import { Avatar, Badge, Card, Group, Stack, Text } from "@mantine/core";

type Props = {
  conversations: Conversation[];
  onConversationClick: (conversation: Conversation) => void;
};

/**
 * Get badge color based on conversation status
 */
function getStatusColor(status: Conversation["status"]): string {
  switch (status) {
    case "new":
      return "blue";
    case "active":
      return "green";
    case "resolved":
      return "gray";
    case "closed":
      return "dark";
    default:
      return "gray";
  }
}

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
 * Messages List
 *
 * Renders a list of conversation cards with patient information,
 * last message preview, unread count, and status badge.
 */
export default function MessagesList({
  conversations,
  onConversationClick,
}: Props) {
  return (
    <Stack gap="sm">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          onClick={() => onConversationClick(conv)}
          style={{ cursor: "pointer" }}
        >
          <Card shadow="sm" padding="md" radius="md" withBorder>
            <Group wrap="nowrap" align="flex-start">
              <Avatar size={50} radius="xl" color="blue">
                {conv.patientName.charAt(0).toUpperCase()}
              </Avatar>

              <div style={{ flex: 1, minWidth: 0 }}>
                <Group justify="space-between" mb="xs">
                  <Group gap="xs">
                    <Text fw={700} size="sm">
                      {conv.patientName}
                    </Text>
                    <Badge
                      size="xs"
                      color={getStatusColor(conv.status)}
                      variant="light"
                    >
                      {conv.status}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {formatTime(conv.lastMessageTime)}
                  </Text>
                </Group>

                <Text size="sm" c="dimmed" lineClamp={2} mb="xs">
                  {conv.lastMessage}
                </Text>

                <Group justify="space-between">
                  {conv.assignedTo && (
                    <Text size="xs" c="dimmed">
                      Assigned to: {conv.assignedTo}
                    </Text>
                  )}
                  {conv.unreadCount > 0 && (
                    <Badge size="sm" color="red" variant="filled" circle>
                      {conv.unreadCount}
                    </Badge>
                  )}
                </Group>
              </div>
            </Group>
          </Card>
        </div>
      ))}
    </Stack>
  );
}
