/**
 * Patient Clinical Notes Page
 *
 * Displays clinical notes and observations for a specific patient.
 * Currently uses fake data for demonstration purposes.
 */

import { NotesList } from "@/components/notes";
import PageHeader from "@/components/page-header";
import { fakeNotes } from "@/data/fakeNotes";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import { Stack } from "@mantine/core";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

export default function PatientNotes() {
  const { patient, setPatientNav } = usePatientLoader();
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    if (patient && id) {
      setPatientNav([
        { label: patient.name, href: `/patients/${id}` },
        { label: "Clinical notes", href: `/patients/${id}/notes` },
      ]);
    }
  }, [patient, id, setPatientNav]);

  return (
    <Stack gap="lg">
      <PageHeader title="Clinical notes" />
      <NotesList notes={fakeNotes} />
    </Stack>
  );
}
