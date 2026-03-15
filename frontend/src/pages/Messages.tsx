/**
 * Messages Page Module
 *
 * Main messaging dashboard for clinicians/admins showing all patient conversations.
 * Displays a list of message threads, defaulting to most recent messages first.
 */

import { MessagesList, type MessageThread } from "@/components/messaging";
import NewMessageModal, {
  type NewConversationData,
} from "@/components/messaging/NewMessageModal";
import AddButton from "@/components/button/AddButton";
import PageHeader from "@/components/page-header";
import {
  createConversation,
  fetchConversations,
  type ConversationResponse,
} from "@lib/messaging";
import { Card, Container, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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
  /** Patient given (first) name for profile pic initials */
  patientGivenName: string;
  /** Patient family (last) name for profile pic initials */
  patientFamilyName: string;
  /** Patient gradient index for profile pic colour */
  patientGradientIndex: number;
  /** Last message preview */
  lastMessage: string;
  /** Last message timestamp (ISO 8601) */
  lastMessageTime: string;
  /** Number of unread messages */
  unreadCount: number;
  /** Conversation status */
  status: "new" | "active" | "resolved" | "closed";
  /** All non-patient participants in this conversation (at least one required) */
  participants: Participant[];
};

export type Participant = {
  /** Name shown in the conversation header (e.g. "Dr Corbett") */
  displayName: string;
  /** Given (first) name for initials and tooltip */
  givenName: string;
  /** Family (last) name for initials and tooltip */
  familyName?: string;
};

/**
 * Messages Page
 *
 * Displays all patient conversations where the current user
 * has contributed or been tagged.
 */
export default function Messages() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNewConversation = useCallback(
    (data: NewConversationData) => {
      setIsSubmitting(true);
      createConversation({
        patient_id: data.patient_id,
        subject: data.subject,
        participant_ids: data.participant_ids,
        initial_message: data.initial_message,
        include_patient_as_participant: data.include_patient_as_participant,
      })
        .then((created) => {
          setModalOpen(false);
          navigate(`/messages/${created.id}`);
        })
        .catch((err: unknown) => {
          notifications.show({
            title: "Failed to create conversation",
            message:
              err instanceof Error
                ? err.message
                : "Something went wrong. Please try again.",
            color: "red",
          });
        })
        .finally(() => setIsSubmitting(false));
    },
    [navigate],
  );

  // Fetch conversations
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchConversations()
      .then((res) => {
        if (cancelled) return;
        setConversations(
          res.conversations.map(
            (c: ConversationResponse): Conversation => ({
              id: String(c.id),
              patientId: c.patient_id,
              patientName: c.patient_id, // TODO: resolve from FHIR
              patientGivenName: c.patient_id,
              patientFamilyName: "",
              patientGradientIndex: 0,
              lastMessage: c.last_message_preview ?? "",
              lastMessageTime: c.last_message_time ?? c.updated_at,
              unreadCount: c.unread_count,
              status: c.status as Conversation["status"],
              participants: c.participants.map((p) => ({
                displayName: p.display_name,
                givenName: p.username,
                familyName: "",
              })),
            }),
          ),
        );
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || "Failed to load conversations");
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <PageHeader title="Messages" size="lg" mb={0} />
          <AddButton label="New message" onClick={() => setModalOpen(true)} />
        </Group>

        <NewMessageModal
          opened={modalOpen}
          onClose={() => setModalOpen(false)}
          onSubmit={handleNewConversation}
          isSubmitting={isSubmitting}
        />

        {error && (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text c="red">{error}</Text>
          </Card>
        )}

        {isLoading ? (
          <Text>Loading conversations...</Text>
        ) : conversations.length === 0 ? (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text c="dimmed" ta="center">
              No conversations yet
            </Text>
          </Card>
        ) : (
          <MessagesList
            threads={conversations.map((conv) => ({
              id: conv.id,
              displayName: conv.patientName,
              profiles: [
                {
                  givenName: conv.patientGivenName,
                  familyName: conv.patientFamilyName,
                  gradientIndex: conv.patientGradientIndex,
                },
              ],
              lastMessage: conv.lastMessage,
              lastMessageTime: conv.lastMessageTime,
              unreadCount: conv.unreadCount,
            }))}
            onThreadClick={(thread: MessageThread) =>
              navigate(`/messages/${thread.id}`)
            }
          />
        )}
      </Stack>
    </Container>
  );
}
