/**
 * Appointments List Component
 *
 * Displays upcoming and past appointment cards with title, status badge,
 * date/time, location, clinician, and optional notes. Upcoming appointments
 * have a blue left border. Provides loading state with skeletons.
 */

import { Group, Skeleton, Stack } from "@mantine/core";
import AppointmentStatus from "@components/badge/AppointmentStatus";
import BaseCard from "@/components/base-card/BaseCard";
import StateMessage from "@/components/message-cards/StateMessage";
import BodyText from "@components/typography/BodyText";
import BodyTextBold from "@components/typography/BodyTextBold";
import Heading from "@components/typography/Heading";

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
  onClick,
}: {
  appointment: Appointment;
  onClick?: (appointment: Appointment) => void;
}) {
  return (
    <BaseCard
      style={{
        ...(onClick && { cursor: "pointer" }),
      }}
      onClick={onClick ? () => onClick(appointment) : undefined}
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <Heading>{appointment.title}</Heading>
          <AppointmentStatus status={appointment.status} />
        </Group>
        <BodyTextBold>
          {formatDate(appointment.date)} at {appointment.time}
        </BodyTextBold>
        <BodyText>{appointment.location}</BodyText>
        <BodyText>
          {appointment.clinician} — {appointment.clinicianRole}
        </BodyText>
        {appointment.notes && <BodyText>{appointment.notes}</BodyText>}
      </Stack>
    </BaseCard>
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
          <BaseCard key={i}>
            <Stack gap="sm">
              <Group justify="space-between">
                <Skeleton height={24} width="60%" />
                <Skeleton height={24} width={80} radius="xl" />
              </Group>
              <Skeleton height={16} width="70%" />
              <Skeleton height={16} width="40%" />
              <Skeleton height={16} width="100%" />
            </Stack>
          </BaseCard>
        ))}
      </Stack>
    );
  }

  const upcoming = appointments.filter((a) => a.status === "upcoming");
  const past = appointments.filter((a) => a.status !== "upcoming");

  if (appointments.length === 0) {
    return <StateMessage type="no-appointments" />;
  }

  return (
    <Stack gap="lg">
      {upcoming.length > 0 && (
        <>
          <Heading>Upcoming</Heading>
          {upcoming.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              onClick={onAppointmentClick}
            />
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <Heading>Past appointments</Heading>
          {past.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              onClick={onAppointmentClick}
            />
          ))}
        </>
      )}
    </Stack>
  );
}
