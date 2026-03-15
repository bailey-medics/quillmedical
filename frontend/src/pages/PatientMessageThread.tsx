/**
 * Patient Message Thread Page
 *
 * Displays a single messaging thread for a specific patient, accessed from
 * the patient messages list. Fetches data from the backend API.
 */

import { useAuth } from "@/auth/AuthContext";
import Messaging, { type Message } from "@/components/messaging/Messaging";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import {
  fetchConversation,
  sendMessage,
  type ConversationDetailResponse,
  type MessageResponse,
} from "@lib/messaging";
import { Container, Loader, Stack, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

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

export default function PatientMessageThread() {
  const { patient, setPatientNav } = usePatientLoader();
  const { state } = useAuth();
  const { conversationId } = useParams<{ conversationId: string }>();

  const currentUserId =
    state.status === "authenticated" ? String(state.user.id) : "unknown";

  const theme = useMantineTheme();
  const isSmall = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  const [conversation, setConversation] =
    useState<ConversationDetailResponse | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      })
      .catch(() => {
        // silently handle
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Set breadcrumb navigation
  useEffect(() => {
    if (patient && patient.id) {
      const label = conversation?.subject ?? "Thread";
      setPatientNav([
        { label: patient.name, href: `/patients/${patient.id}` },
        { label: "Messages", href: `/patients/${patient.id}/messages` },
        {
          label,
          href: `/patients/${patient.id}/messages/${conversationId}`,
        },
      ]);
    }
  }, [patient, conversationId, conversation, setPatientNav]);

  const handleSend = useCallback(
    (text: string) => {
      if (!conversationId) return;
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

  return (
    <Container
      size="lg"
      pt={isSmall ? 0 : "xs"}
      pb={0}
      px={isSmall ? 0 : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
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
