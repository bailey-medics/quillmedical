/**
 * Patient Messages List Page
 *
 * Displays a list of message conversations for a specific patient,
 * accessed from the patient detail page. Clicking a conversation
 * navigates to the full message thread.
 */

import { MessagesList, type MessageThread } from "@/components/messaging";
import NewMessageModal, {
  type NewConversationData,
} from "@/components/messaging/NewMessageModal";
import AddButton from "@/components/button/AddButton";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import {
  createConversation,
  fetchPatientConversations,
  type ConversationResponse,
} from "@lib/messaging";
import { Card, Container, Group, Loader, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function PatientMessages() {
  const { id, patient, setPatientNav } = usePatientLoader();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationResponse[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
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
          navigate(`/patients/${id}/messages/${created.id}`);
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
    [navigate, id],
  );

  useEffect(() => {
    if (patient && id) {
      setPatientNav([
        { label: patient.name, href: `/patients/${id}` },
        { label: "Messages", href: `/patients/${id}/messages` },
      ]);
    }
  }, [patient, id, setPatientNav]);

  // Fetch conversations for this patient
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setIsLoading(true);

    fetchPatientConversations(id)
      .then((res) => {
        if (cancelled) return;
        setConversations(res.conversations);
      })
      .catch(() => {
        // silently fallback to empty
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (isLoading) {
    return (
      <Container size="lg" py="xl">
        <Loader />
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="flex-end">
          <AddButton label="New message" onClick={() => setModalOpen(true)} />
        </Group>

        <NewMessageModal
          opened={modalOpen}
          onClose={() => setModalOpen(false)}
          onSubmit={handleNewConversation}
          isSubmitting={isSubmitting}
          patientId={id}
          patientName={patient?.name}
        />

        {conversations.length === 0 ? (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text c="dimmed" ta="center">
              No conversations yet
            </Text>
          </Card>
        ) : (
          <MessagesList
            threads={conversations.map((conv) => ({
              id: String(conv.id),
              displayName:
                conv.subject ??
                conv.participants.map((p) => p.display_name).join(", "),
              profiles: conv.participants.map((p) => ({
                givenName: p.username,
                familyName: "",
                gradientIndex: 0,
              })),
              lastMessage: conv.last_message_preview ?? "",
              lastMessageTime: conv.last_message_time ?? conv.updated_at,
              unreadCount: conv.unread_count,
            }))}
            onThreadClick={(thread: MessageThread) =>
              navigate(`/patients/${id}/messages/${thread.id}`)
            }
          />
        )}
      </Stack>
    </Container>
  );
}
