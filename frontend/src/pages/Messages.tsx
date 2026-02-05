/**
 * Messages Page Module
 *
 * Main messaging dashboard for clinicians/admins showing all patient conversations.
 * Displays a list of message threads with filtering and sorting capabilities,
 * defaulting to most recent messages first.
 */

import MessagesList from "@/components/messaging/MessagesList";
// import { api } from "@/lib/api"; // TODO: Replace mock data with API call
import {
  Card,
  Container,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom"; // TODO: Navigate to conversation detail

/**
 * Conversation
 *
 * Represents a message thread with a patient.
 */
export type Conversation = {
  /** Unique conversation identifier */
  id: string;
  /** Patient FHIR ID */
  patientId: string;
  /** Patient name */
  patientName: string;
  /** Last message preview */
  lastMessage: string;
  /** Last message timestamp (ISO 8601) */
  lastMessageTime: string;
  /** Number of unread messages */
  unreadCount: number;
  /** Conversation status */
  status: "new" | "active" | "resolved" | "closed";
  /** Assigned clinician name */
  assignedTo?: string;
};

type SortOption = "recent" | "unread" | "patient-name";
type StatusFilter = "all" | "new" | "active" | "resolved" | "closed";

/**
 * Messages Page
 *
 * Displays all patient conversations for clinicians/admins with filtering
 * and sorting capabilities. Shows conversation preview, unread counts, and
 * patient information.
 *
 * Features:
 * - Sort by: Most recent (default), Unread count, Patient name
 * - Filter by: Status (all, new, active, resolved, closed)
 * - Search by patient name
 * - Click to navigate to conversation detail
 *
 * @example
 * // Routing configuration
 * <Route path="/messages" element={<Messages />} />
 */
export default function Messages() {
  // const navigate = useNavigate(); // TODO: Use when navigation to detail is implemented
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch conversations
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    // TODO: Replace with actual API endpoint when backend implements conversations
    // For now, using placeholder data
    setTimeout(() => {
      if (cancelled) return;

      const mockConversations: Conversation[] = [
        {
          id: "conv-1",
          patientId: "patient-1",
          patientName: "John Smith",
          lastMessage: "Thank you for your help with my prescription",
          lastMessageTime: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
          unreadCount: 2,
          status: "active",
          assignedTo: "Dr. Williams",
        },
        {
          id: "conv-2",
          patientId: "patient-2",
          patientName: "Mary Johnson",
          lastMessage: "I need to schedule a follow-up appointment",
          lastMessageTime: new Date(
            Date.now() - 1000 * 60 * 60 * 2,
          ).toISOString(), // 2 hours ago
          unreadCount: 0,
          status: "new",
        },
        {
          id: "conv-3",
          patientId: "patient-3",
          patientName: "Robert Brown",
          lastMessage: "My test results came back, what should I do next?",
          lastMessageTime: new Date(
            Date.now() - 1000 * 60 * 60 * 5,
          ).toISOString(), // 5 hours ago
          unreadCount: 1,
          status: "active",
          assignedTo: "Dr. Smith",
        },
        {
          id: "conv-4",
          patientId: "patient-4",
          patientName: "Sarah Davis",
          lastMessage: "Issue resolved, thank you",
          lastMessageTime: new Date(
            Date.now() - 1000 * 60 * 60 * 24,
          ).toISOString(), // 1 day ago
          unreadCount: 0,
          status: "resolved",
        },
      ];

      setConversations(mockConversations);
      setError(null);
      setIsLoading(false);
    }, 500);

    return () => {
      cancelled = true;
    };

    // TODO: Uncomment when API is ready
    // api
    //   .get<{ conversations: Conversation[] }>("/conversations")
    //   .then((res) => {
    //     if (cancelled) return;
    //     setConversations(res.conversations || []);
    //     setError(null);
    //   })
    //   .catch((err: Error) => {
    //     if (cancelled) return;
    //     setError(err.message || "Failed to load conversations");
    //   })
    //   .finally(() => {
    //     if (cancelled) return;
    //     setIsLoading(false);
    //   });

    // return () => {
    //   cancelled = true;
    // };
  }, []);

  // Filter conversations
  const filteredConversations = conversations.filter((conv) => {
    // Status filter
    if (statusFilter !== "all" && conv.status !== statusFilter) {
      return false;
    }

    // Search filter
    if (
      searchQuery &&
      !conv.patientName.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    return true;
  });

  // Sort conversations
  const sortedConversations = [...filteredConversations].sort((a, b) => {
    switch (sortBy) {
      case "recent":
        return (
          new Date(b.lastMessageTime).getTime() -
          new Date(a.lastMessageTime).getTime()
        );
      case "unread":
        return b.unreadCount - a.unreadCount;
      case "patient-name":
        return a.patientName.localeCompare(b.patientName);
      default:
        return 0;
    }
  });

  const handleConversationClick = (conversation: Conversation) => {
    // TODO: Navigate to conversation detail page
    // navigate(`/messages/${conversation.id}`);
    console.log("Navigate to conversation:", conversation.id);
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2} mb="xs">
            Messages
          </Title>
          <Text c="dimmed" size="sm">
            View and manage all patient conversations
          </Text>
        </div>

        {/* Filters and Search */}
        <Card shadow="sm" padding="md" radius="md" withBorder>
          <Group gap="md" grow>
            <TextInput
              placeholder="Search by patient name..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <Select
              label="Sort by"
              value={sortBy}
              onChange={(value) => setSortBy(value as SortOption)}
              data={[
                { value: "recent", label: "Most Recent" },
                { value: "unread", label: "Unread Count" },
                { value: "patient-name", label: "Patient Name" },
              ]}
            />
            <Select
              label="Status"
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as StatusFilter)}
              data={[
                { value: "all", label: "All" },
                { value: "new", label: "New" },
                { value: "active", label: "Active" },
                { value: "resolved", label: "Resolved" },
                { value: "closed", label: "Closed" },
              ]}
            />
          </Group>
        </Card>

        {/* Conversations List */}
        {error && (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text c="red">{error}</Text>
          </Card>
        )}

        {isLoading ? (
          <Text>Loading conversations...</Text>
        ) : sortedConversations.length === 0 ? (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text c="dimmed" ta="center">
              {searchQuery || statusFilter !== "all"
                ? "No conversations match your filters"
                : "No conversations yet"}
            </Text>
          </Card>
        ) : (
          <MessagesList
            conversations={sortedConversations}
            onConversationClick={handleConversationClick}
          />
        )}
      </Stack>
    </Container>
  );
}
