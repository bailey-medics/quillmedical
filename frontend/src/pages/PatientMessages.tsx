/**
 * Patient Messages List Page
 *
 * Displays a list of message conversations for a specific patient,
 * accessed from the patient detail page. Clicking a conversation
 * navigates to the full message thread.
 */

import type { Conversation } from "@/pages/Messages";
import { PatientMessagesList } from "@/components/messaging";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import { Card, Container, Stack, Text } from "@mantine/core";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Build fake conversations for a patient.
 */
function buildFakeConversations(
  patientName: string,
  patientId: string,
  patientGivenName: string,
  patientFamilyName: string,
  patientGradientIndex: number,
): Conversation[] {
  return [
    {
      id: "gastro-clinic",
      patientId: patientId,
      patientName: patientName,
      patientGivenName,
      patientFamilyName,
      patientGradientIndex,
      lastMessage:
        "Thank you, payment received. I've reviewed your case notes and endoscopy findings...",
      lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(),
      unreadCount: 1,
      status: "active",
      participants: [
        {
          displayName: "Dr Gareth Corbett",
          givenName: "Gareth",
          familyName: "Corbett",
        },
        {
          displayName: "Gemma Corbett",
          givenName: "Gemma",
          familyName: "Corbett",
        },
      ],
    },
    {
      id: "gp-referral",
      patientId: patientId,
      patientName: patientName,
      patientGivenName,
      patientFamilyName,
      patientGradientIndex,
      lastMessage:
        "Your referral to the gastroenterology clinic has been processed. You should hear from them within the next few days. All the best.",
      lastMessageTime: new Date(
        Date.now() - 1000 * 60 * 60 * 24 * 14,
      ).toISOString(),
      unreadCount: 0,
      status: "resolved",
      participants: [
        { displayName: "Dr Patel", givenName: "Raj", familyName: "Patel" },
      ],
    },
    {
      id: "prescription-query",
      patientId: patientId,
      patientName: patientName,
      patientGivenName,
      patientFamilyName,
      patientGradientIndex,
      lastMessage:
        "Your repeat prescription has been sent to your nominated pharmacy. You're all sorted! Let us know if you need anything else.",
      lastMessageTime: new Date(
        Date.now() - 1000 * 60 * 60 * 24 * 30,
      ).toISOString(),
      unreadCount: 0,
      status: "closed",
      participants: [
        {
          displayName: "Lisa Taylor",
          givenName: "Lisa",
          familyName: "Taylor",
        },
      ],
    },
  ];
}

export default function PatientMessages() {
  const { id, patient, setPatientNav } = usePatientLoader();
  const navigate = useNavigate();

  useEffect(() => {
    if (patient && id) {
      setPatientNav([
        { label: patient.name, href: `/patients/${id}` },
        { label: "Messages", href: `/patients/${id}/messages` },
      ]);
    }
  }, [patient, id, setPatientNav]);

  const patientName = patient?.name ?? "Patient";
  const conversations = buildFakeConversations(
    patientName,
    id ?? "",
    patient?.givenName ?? "Patient",
    patient?.familyName ?? "",
    patient?.gradientIndex ?? 0,
  );

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        {conversations.length === 0 ? (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text c="dimmed" ta="center">
              No conversations yet
            </Text>
          </Card>
        ) : (
          <PatientMessagesList
            conversations={conversations}
            onConversationClick={(conv: Conversation) =>
              navigate(`/patients/${id}/messages/${conv.id}`)
            }
          />
        )}
      </Stack>
    </Container>
  );
}
