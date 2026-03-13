/**
 * Appointments List Component
 *
 * Displays upcoming and past appointment cards with title, status badge,
 * date/time, location, clinician, and optional notes. Upcoming appointments
 * have a blue left border. Provides loading state with skeletons.
 */

import {
  Badge,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";

export type Appointment = {
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

type Props = {
  appointments: Appointment[];
  onAppointmentClick?: (appointment: Appointment) => void;
  isLoading?: boolean;
};

function getStatusColour(status: Appointment["status"]): string {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function AppointmentCard({
  appointment,
  isUpcoming,
  onClick,
}: {
  appointment: Appointment;
  isUpcoming: boolean;
  onClick?: (appointment: Appointment) => void;
}) {
  return (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      style={{
        ...(isUpcoming && {
          borderLeft: "4px solid var(--mantine-color-blue-5)",
        }),
        ...(onClick && { cursor: "pointer" }),
      }}
      onClick={onClick ? () => onClick(appointment) : undefined}
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>{appointment.title}</Title>
          <Badge
            color={getStatusColour(appointment.status)}
            variant="light"
            size="lg"
          >
            {appointment.status}
          </Badge>
        </Group>
        <Group gap="lg">
          <Text size="sm" fw={isUpcoming ? 600 : undefined}>
            {formatDate(appointment.date)} at {appointment.time}
          </Text>
          <Text size="sm" c="dimmed">
            {appointment.location}
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          {appointment.clinician} — {appointment.clinicianRole}
        </Text>
        {appointment.notes && <Text size="md">{appointment.notes}</Text>}
      </Stack>
    </Card>
  );
}

export default function AppointmentsList({
  appointments,
  onAppointmentClick,
  isLoading,
}: Props) {
  if (isLoading) {
    return (
      <Stack gap="lg">
        {[1, 2, 3].map((i) => (
          <Card key={i} shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Skeleton height={24} width="60%" />
                <Skeleton height={24} width={80} radius="xl" />
              </Group>
              <Skeleton height={16} width="70%" />
              <Skeleton height={16} width="40%" />
              <Skeleton height={16} width="100%" />
            </Stack>
          </Card>
        ))}
      </Stack>
    );
  }

  const upcoming = appointments.filter((a) => a.status === "upcoming");
  const past = appointments.filter((a) => a.status !== "upcoming");

  return (
    <Stack gap="lg">
      {upcoming.length > 0 && (
        <>
          <Title order={3}>Upcoming</Title>
          {upcoming.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              isUpcoming={true}
              onClick={onAppointmentClick}
            />
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <Title order={3}>Past appointments</Title>
          {past.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              isUpcoming={false}
              onClick={onAppointmentClick}
            />
          ))}
        </>
      )}
    </Stack>
  );
}
