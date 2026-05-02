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
import { StateMessage } from "@/components/message-cards";
import {
  createConversation,
  fetchConversations,
  type ConversationResponse,
} from "@lib/messaging";
import { api } from "@lib/api";
import { FHIR_POLLING_TIME } from "@lib/constants";
import { extractAvatarGradientIndex } from "@lib/fhir-patient";
import { Container, Group, Stack } from "@mantine/core";
import { ErrorMessage, EmptyState } from "@/components/typography";
import BaseCard from "@/components/base-card/BaseCard";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

type FhirName = {
  given?: string[];
  family?: string;
};

type FhirPatient = {
  id: string;
  name?: FhirName[];
  [key: string]: unknown;
};

type PatientLookup = Record<
  string,
  { givenName: string; familyName: string; gradientIndex: number }
>;

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
  /** Conversation subject */
  subject: string;
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
  const [fhirAvailable, setFhirAvailable] = useState(false);
  const [isFhirReady, setIsFhirReady] = useState(false);
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

  // Poll health endpoint until FHIR is ready
  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      try {
        const response = await api.get<{
          services: { fhir: { available: boolean } };
        }>("/health");
        if (cancelled) return;
        if (response.services.fhir.available) {
          setIsFhirReady(true);
          setFhirAvailable(true);
        } else {
          setIsLoading(false);
          setFhirAvailable(false);
        }
      } catch {
        if (!cancelled) {
          setIsLoading(false);
          setFhirAvailable(false);
        }
      }
    };

    checkHealth();
    const interval = setInterval(() => {
      if (!isFhirReady) checkHealth();
    }, FHIR_POLLING_TIME);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isFhirReady]);

  // Fetch conversations and patient names once FHIR is ready
  useEffect(() => {
    if (!isFhirReady) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching loading state
    setIsLoading(true);

    Promise.all([
      fetchConversations(),
      api.get<{ patients: FhirPatient[] }>("/patients"),
    ])
      .then(async ([convRes, patRes]) => {
        if (cancelled) return;

        // Build a lookup of patient ID → name parts
        const lookup: PatientLookup = {};
        for (const p of patRes.patients) {
          const primary = p.name?.[0];
          lookup[p.id] = {
            givenName: primary?.given?.[0] ?? "",
            familyName: primary?.family ?? "",
            gradientIndex: extractAvatarGradientIndex(p) ?? 0,
          };
        }

        // Fetch any patients not in the org-scoped list
        const missingIds = [
          ...new Set(
            convRes.conversations
              .map((c) => c.patient_id)
              .filter((id) => !lookup[id]),
          ),
        ];
        if (missingIds.length > 0) {
          const results = await Promise.allSettled(
            missingIds.map((id) => api.get<FhirPatient>(`/patients/${id}`)),
          );
          for (const result of results) {
            if (result.status === "fulfilled") {
              const p = result.value;
              const primary = p.name?.[0];
              lookup[p.id] = {
                givenName: primary?.given?.[0] ?? "",
                familyName: primary?.family ?? "",
                gradientIndex: extractAvatarGradientIndex(p) ?? 0,
              };
            }
          }
        }

        setConversations(
          convRes.conversations.map((c: ConversationResponse): Conversation => {
            const patient = lookup[c.patient_id];
            const givenName = patient?.givenName ?? "";
            const familyName = patient?.familyName ?? "";
            const displayName =
              `${givenName} ${familyName}`.trim() || "Unknown patient";
            return {
              id: String(c.id),
              patientId: c.patient_id,
              patientName: displayName,
              subject: c.subject ?? "",
              patientGivenName: givenName,
              patientFamilyName: familyName,
              patientGradientIndex: patient?.gradientIndex ?? 0,
              lastMessage: c.last_message_preview ?? "",
              lastMessageTime: c.last_message_time ?? c.updated_at,
              unreadCount: c.unread_count,
              status: c.status as Conversation["status"],
              participants: c.participants.map((p) => ({
                displayName: p.display_name,
                givenName: p.username,
                familyName: "",
              })),
            };
          }),
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
  }, [isFhirReady]);

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <PageHeader title="Messages" />
          <AddButton label="New message" onClick={() => setModalOpen(true)} />
        </Group>

        <NewMessageModal
          opened={modalOpen}
          onClose={() => setModalOpen(false)}
          onSubmit={handleNewConversation}
          isSubmitting={isSubmitting}
        />

        {error && (
          <BaseCard>
            <ErrorMessage>{error}</ErrorMessage>
          </BaseCard>
        )}

        {isLoading ? (
          <MessagesList threads={[]} isLoading onThreadClick={() => {}} />
        ) : !fhirAvailable ? (
          <StateMessage type="database-initialising" />
        ) : conversations.length === 0 ? (
          <BaseCard>
            <EmptyState>No conversations yet</EmptyState>
          </BaseCard>
        ) : (
          <MessagesList
            threads={conversations.map((conv) => ({
              id: conv.id,
              displayName: conv.subject || conv.patientName,
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
