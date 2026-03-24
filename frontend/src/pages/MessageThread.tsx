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
import type { Patient } from "@/domains/patient";
import type { LayoutCtx } from "@/RootLayout";
import { api } from "@lib/api";
import { extractAvatarGradientIndex } from "@lib/fhir-patient";
import {
  fetchConversation,
  sendMessage,
  type ConversationDetailResponse,
  type MessageResponse,
} from "@lib/messaging";
import { Container, Loader, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";

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
type FhirName = { given?: string[]; family?: string };
type FhirIdentifier = { system?: string; value?: string };
type FhirPatient = {
  id: string;
  name?: FhirName[];
  birthDate?: string;
  gender?: string;
  identifier?: FhirIdentifier[];
  extension?: Array<{
    url?: string;
    valueInteger?: number;
    extension?: Array<{ url?: string; valueInteger?: number }>;
  }>;
};
type PatientDemographicsRes = { patient_id: string; data: FhirPatient };

export default function MessageThread() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { setPatient, setPatientNav } = useOutletContext<LayoutCtx>();
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

  // Set nav breadcrumbs once conversation is loaded
  useEffect(() => {
    if (!conversation) return;
    const label = conversation.subject || "Thread";
    setPatientNav([
      { label: "Messages", href: "/messages", icon: "message" },
      { label, href: `/messages/${conversationId}` },
    ]);
    return () => {
      setPatientNav([]);
    };
  }, [conversation, conversationId, setPatientNav]);

  // Load patient demographics for the ribbon once conversation is available
  useEffect(() => {
    if (!conversation?.patient_id) return;
    let cancelled = false;

    api
      .get<PatientDemographicsRes>(
        `/patients/${conversation.patient_id}/demographics`,
      )
      .then((res) => {
        if (cancelled) return;
        const f = res.data;
        const givenName = f.name?.[0]?.given?.[0];
        const familyName = f.name?.[0]?.family;
        const nameParts = [...(f.name?.[0]?.given ?? []), familyName].filter(
          Boolean,
        );

        let nationalNumber: string | undefined;
        let nationalNumberSystem: string | undefined;
        const natId = f.identifier?.find(
          (i) =>
            i.system === "https://fhir.nhs.uk/Id/nhs-number" ||
            i.system ===
              "http://ns.electronichealth.net.au/id/medicare-number" ||
            i.system?.includes("/national") ||
            i.system?.includes("/health-id"),
        );
        if (natId) {
          nationalNumber = natId.value;
          nationalNumberSystem = natId.system;
        }

        let age: number | undefined;
        if (f.birthDate) {
          const bd = new Date(f.birthDate);
          const today = new Date();
          age = today.getFullYear() - bd.getFullYear();
          const md = today.getMonth() - bd.getMonth();
          if (md < 0 || (md === 0 && today.getDate() < bd.getDate())) {
            age--;
          }
        }

        const mapped: Patient = {
          id: f.id,
          name: nameParts.join(" ") || f.id,
          givenName,
          familyName,
          dob: f.birthDate,
          age,
          sex: f.gender,
          nationalNumber,
          nationalNumberSystem,
          gradientIndex: extractAvatarGradientIndex(f),
        };
        setPatient(mapped);
      })
      .catch(() => {
        // Patient demographics unavailable — ribbon stays empty
      });

    return () => {
      cancelled = true;
      setPatient(null);
    };
  }, [conversation?.patient_id, setPatient]);

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
          <PageHeader title="Conversation not found" />
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
