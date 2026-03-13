/**
 * Patient Detail Page Module
 *
 * Displays detailed information for a specific patient including demographics
 * in the top ribbon (via outlet context) and action cards for navigating to
 * clinical letters, messaging, notes, and appointments.
 */

import ActionCard from "@/components/action-card";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import { Card, Container, SimpleGrid, Text } from "@mantine/core";
import {
  IconCalendarWeek,
  IconMessage,
  IconBook,
  IconMail,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

export default function Patient() {
  const { id, error } = usePatientLoader();
  const navigate = useNavigate();

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text c="red">{error}</Text>
          <Text
            component="button"
            onClick={() => navigate("/")}
            style={{
              cursor: "pointer",
              marginTop: "1rem",
              color: "blue",
              textDecoration: "underline",
            }}
          >
            ← Back to patient list
          </Text>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <ActionCard
          icon={<IconMail />}
          title="Clinical letters"
          subtitle="View referral letters, clinic letters, and discharge summaries"
          buttonLabel="View letters"
          buttonUrl={`/patients/${id}/letters`}
        />
        <ActionCard
          icon={<IconMessage />}
          title="Messaging"
          subtitle="Send and receive secure messages with the care team"
          buttonLabel="Open messages"
          buttonUrl={`/patients/${id}/messages`}
        />
        <ActionCard
          icon={<IconBook />}
          title="Clinical notes"
          subtitle="View consultation notes, observations, and clinical records"
          buttonLabel="View notes"
          buttonUrl={`/patients/${id}/notes`}
        />
        <ActionCard
          icon={<IconCalendarWeek />}
          title="Appointments"
          subtitle="View upcoming and past appointment history"
          buttonLabel="View appointments"
          buttonUrl={`/patients/${id}/appointments`}
        />
      </SimpleGrid>
    </Container>
  );
}
