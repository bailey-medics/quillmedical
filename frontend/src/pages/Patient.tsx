/**
 * Patient Detail Page Module
 *
 * Displays detailed information for a specific patient including demographics
 * in the top ribbon (via outlet context) and action cards for navigating to
 * clinical letters, messaging, notes, and appointments.
 */

import ActionCard from "@/components/action-card";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import { ErrorMessage, TextLink } from "@/components/typography";
import { Container, SimpleGrid } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import {
  IconCalendarWeek,
  IconMessage,
  IconBook,
  IconMail,
  IconFileText,
} from "@components/icons/appIcons";
import { useEffect } from "react";

export default function Patient() {
  const { id, patient, error, setPatientNav } = usePatientLoader();

  useEffect(() => {
    if (patient && id) {
      setPatientNav([{ label: patient.name, href: `/patients/${id}` }]);
    }
  }, [patient, id, setPatientNav]);

  if (error) {
    return (
      <Container size="lg" py="xl">
        <BaseCard>
          <ErrorMessage>{error}</ErrorMessage>
          <TextLink to="/">← Back to patient list</TextLink>
        </BaseCard>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <ActionCard
          icon={<IconMessage />}
          title="Messaging"
          subtitle="Send and receive secure messages with the care team"
          buttonLabel="Open messages"
          buttonUrl={`/patients/${id}/messages`}
        />
        <ActionCard
          icon={<IconCalendarWeek />}
          title="Appointments"
          subtitle="View upcoming and past appointment history"
          buttonLabel="View appointments"
          buttonUrl={`/patients/${id}/appointments`}
        />
        <ActionCard
          icon={<IconMail />}
          title="Clinical letters"
          subtitle="View referral letters, clinic letters, and discharge summaries"
          buttonLabel="View letters"
          buttonUrl={`/patients/${id}/letters`}
        />
        <ActionCard
          icon={<IconFileText />}
          title="Documents"
          subtitle="Scanned documents and files"
          buttonLabel="View documents"
          buttonUrl={`/patients/${id}/documents`}
        />
        <ActionCard
          icon={<IconBook />}
          title="Clinical notes"
          subtitle="View consultation notes, observations, and clinical records"
          buttonLabel="View notes"
          buttonUrl={`/patients/${id}/notes`}
        />
      </SimpleGrid>
    </Container>
  );
}
