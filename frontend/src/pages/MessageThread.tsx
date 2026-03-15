/**
 * Message Thread Page
 *
 * Displays a single conversation thread with full message history and
 * a message input for sending new messages. Uses the conversation ID
 * from the route params to load the thread from the backend API.
 */

import { useAuth } from "@/auth/AuthContext";
import Messaging, { type Message } from "@/components/messaging/Messaging";
import PageHeader from "@/components/page-header";
import type { LayoutCtx } from "@/RootLayout";
import {
  fetchConversation,
  sendMessage,
  type ConversationDetailResponse,
  type MessageResponse,
} from "@lib/messaging";
import { Button, Container, Loader, Stack, Text } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";

/** Map a backend MessageResponse to the UI Message shape. */
function toUiMessage(m: MessageResponse): Message {
  const parts = m.sender_display_name.split(" ");
  return {
    id: String(m.id),
    senderId: String(m.sender_id),
    senderName: m.sender_display_name,
    givenName: parts[0] ?? "",
    familyName: parts.slice(1).join(" "),
    gradientIndex: 0,
    text: m.body,
    timestamp: m.created_at,
  };
}

/**
 * Message Thread Page
 *
 * Displays a full conversation thread for a given conversation ID taken
 * from the route params. Fetches data from the backend API.
 *
 * @example
 * <Route path="/messages/:conversationId" element={<MessageThread />} />
 */
export default function MessageThread() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { setPatient } = useOutletContext<LayoutCtx>();
  const { state } = useAuth();

  const currentUserId =
    state.status === "authenticated" ? String(state.user.id) : "unknown";

  const [conversation, setConversation] =
    useState<ConversationDetailResponse | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch conversation detail
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setIsLoading(true);

    fetchConversation(Number(conversationId))
      .then((data) => {
        if (cancelled) return;
        setConversation(data);
        setMessages(data.messages.map(toUiMessage));
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || "Failed to load conversation");
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Clear patient ribbon on unmount
  useEffect(() => {
    setPatient(null);
    return () => {
      setPatient(null);
    };
  }, [setPatient]);

  const handleSend = useCallback(
    (text: string) => {
      if (!conversationId) return;
      // Optimistic UI update
      const optimistic: Message = {
        id: `pending-${Date.now()}`,
        senderId: currentUserId,
        givenName:
          state.status === "authenticated"
            ? (state.user.name?.split(" ")[0] ?? "You")
            : "You",
        familyName:
          state.status === "authenticated"
            ? (state.user.name?.split(" ").slice(1).join(" ") ?? "")
            : "",
        text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      sendMessage(Number(conversationId), { body: text }).then((msg) => {
        // Replace optimistic message with real one
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? toUiMessage(msg) : m)),
        );
      });
    },
    [conversationId, currentUserId, state],
  );

  if (isLoading) {
    return (
      <Container size="lg" py="xl">
        <Loader />
      </Container>
    );
  }

  if (error || !conversation) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => navigate("/messages")}
          >
            Back to messages
          </Button>
          <PageHeader
            title="Conversation not found"
            description={
              error ?? "This conversation does not exist or has been removed."
            }
            size="md"
          />
        </Stack>
      </Container>
    );
  }

  return (
    <Container
      size="lg"
      pt="xs"
      pb={0}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate("/messages")}
          style={{ alignSelf: "flex-start" }}
        >
          Back to messages
        </Button>

        {conversation.subject && (
          <Text fw={600} size="lg">
            {conversation.subject}
          </Text>
        )}

        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <Messaging
            messages={messages}
            currentUserId={currentUserId}
            onSend={handleSend}
          />
        </div>
      </Stack>
    </Container>
  );
}
