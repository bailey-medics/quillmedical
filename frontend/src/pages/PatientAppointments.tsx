/**
 * Patient Appointments Page
 *
 * Displays appointment history and upcoming appointments for a specific
 * patient. Currently uses fake data for demonstration purposes.
 */

import { usePatientLoader } from "@/hooks/usePatientLoader";
import {
  Badge,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";

type Appointment = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  clinician: string;
  clinicianRole: string;
  status: "upcoming" | "completed" | "cancelled" | "no-show";
  notes?: string;
};

const fakeAppointments: Appointment[] = [
  {
    id: "appt-1",
    title: "Gastro clinic follow-up review",
    date: "2026-04-09",
    time: "10:00",
    location: "Riverside Health Centre, Room 4",
    clinician: "Dr Gareth Corbett",
    clinicianRole: "Consultant Gastroenterologist",
    status: "upcoming",
    notes:
      "3-week follow-up to review dietary modifications and food diary. Assess symptom response to omeprazole.",
  },
  {
    id: "appt-2",
    title: "Gastro clinic — initial assessment",
    date: "2026-03-19",
    time: "10:30",
    location: "Riverside Health Centre, Room 4",
    clinician: "Dr Gareth Corbett",
    clinicianRole: "Consultant Gastroenterologist",
    status: "completed",
    notes:
      "Initial assessment for functional dyspepsia. Commenced omeprazole 20mg OD. Dietary advice provided. Food diary requested.",
  },
  {
    id: "appt-3",
    title: "GP consultation — gastro referral",
    date: "2026-02-25",
    time: "09:15",
    location: "Meadowbrook Surgery, Room 2",
    clinician: "Dr Emily Williams",
    clinicianRole: "General Practitioner",
    status: "completed",
    notes:
      "Assessment of epigastric symptoms. Referral to gastroenterology arranged.",
  },
  {
    id: "appt-4",
    title: "Annual health review",
    date: "2026-01-10",
    time: "14:30",
    location: "Meadowbrook Surgery, Room 2",
    clinician: "Dr Emily Williams",
    clinicianRole: "General Practitioner",
    status: "completed",
    notes:
      "Routine annual review. Bloods normal. BP within target. No concerns.",
  },
  {
    id: "appt-5",
    title: "Practice nurse — BP and weight check",
    date: "2025-10-15",
    time: "11:00",
    location: "Meadowbrook Surgery, Treatment Room",
    clinician: "Nurse Sarah Mitchell",
    clinicianRole: "Practice Nurse",
    status: "completed",
    notes: "Routine monitoring. BP 126/80, weight 82.4kg. No action required.",
  },
];

function getStatusColour(status: string): string {
  switch (status) {
    case "upcoming":
      return "blue";
    case "completed":
      return "green";
    case "cancelled":
      return "red";
    case "no-show":
      return "orange";
    default:
      return "gray";
  }
}

export default function PatientAppointments() {
  const { patient } = usePatientLoader();

  const upcoming = fakeAppointments.filter((a) => a.status === "upcoming");
  const past = fakeAppointments.filter((a) => a.status !== "upcoming");

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Title order={2}>
          Appointments
          {patient?.givenName ? ` — ${patient.givenName}` : ""}
        </Title>

        {upcoming.length > 0 && (
          <>
            <Title order={3}>Upcoming</Title>
            {upcoming.map((appt) => (
              <Card
                key={appt.id}
                shadow="sm"
                padding="lg"
                radius="md"
                withBorder
                style={{ borderLeft: "4px solid var(--mantine-color-blue-5)" }}
              >
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={4}>{appt.title}</Title>
                    <Badge
                      color={getStatusColour(appt.status)}
                      variant="light"
                      size="lg"
                    >
                      {appt.status}
                    </Badge>
                  </Group>
                  <Group gap="lg">
                    <Text size="sm" fw={600}>
                      {new Date(appt.date).toLocaleDateString("en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}{" "}
                      at {appt.time}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {appt.location}
                    </Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {appt.clinician} — {appt.clinicianRole}
                  </Text>
                  {appt.notes && <Text size="md">{appt.notes}</Text>}
                </Stack>
              </Card>
            ))}
          </>
        )}

        {past.length > 0 && (
          <>
            <Title order={3}>Past appointments</Title>
            {past.map((appt) => (
              <Card
                key={appt.id}
                shadow="sm"
                padding="lg"
                radius="md"
                withBorder
              >
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={4}>{appt.title}</Title>
                    <Badge
                      color={getStatusColour(appt.status)}
                      variant="light"
                      size="lg"
                    >
                      {appt.status}
                    </Badge>
                  </Group>
                  <Group gap="lg">
                    <Text size="sm">
                      {new Date(appt.date).toLocaleDateString("en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}{" "}
                      at {appt.time}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {appt.location}
                    </Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {appt.clinician} — {appt.clinicianRole}
                  </Text>
                  {appt.notes && <Text size="md">{appt.notes}</Text>}
                </Stack>
              </Card>
            ))}
          </>
        )}
      </Stack>
    </Container>
  );
}
