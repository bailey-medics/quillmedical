/**
 * Patient Appointments Page
 *
 * Displays appointment history and upcoming appointments for a specific
 * patient. Currently uses fake data for demonstration purposes.
 */

import { AppointmentsList } from "@/components/appointments";
import PageHeader from "@/components/page-header";
import { fakeAppointments } from "@/data/fakeAppointments";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import { Stack } from "@mantine/core";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

export default function PatientAppointments() {
  const { patient, setPatientNav } = usePatientLoader();
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    if (patient && id) {
      setPatientNav([
        { label: patient.name, href: `/patients/${id}` },
        { label: "Appointments", href: `/patients/${id}/appointments` },
      ]);
    }
  }, [patient, id, setPatientNav]);

  return (
    <Stack gap="lg">
      <PageHeader title="Appointments" />
      <AppointmentsList appointments={fakeAppointments} />
    </Stack>
  );
}
