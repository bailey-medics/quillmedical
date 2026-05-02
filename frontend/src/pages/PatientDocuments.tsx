/**
 * Patient documents list page.
 *
 * Displays scanned documents and files for a specific patient.
 * Currently uses fake data for demonstration purposes.
 */

import DocumentsList from "@/components/documents/DocumentsList";
import { fakeDocuments } from "@/data/fakeDocuments";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import { Heading } from "@/components/typography";
import { Container, Stack } from "@mantine/core";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function PatientDocuments() {
  const { patient, setPatientNav } = usePatientLoader();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (patient && id) {
      setPatientNav([
        { label: patient.name, href: `/patients/${id}` },
        { label: "Documents", href: `/patients/${id}/documents` },
      ]);
    }
  }, [patient, id, setPatientNav]);

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Heading>Documents</Heading>

        <DocumentsList
          documents={fakeDocuments}
          onSelect={(doc) => {
            const fakeDoc = fakeDocuments.find((d) => d.url === doc.url);
            if (fakeDoc) {
              navigate(`/patients/${id}/documents/${fakeDoc.id}`);
            }
          }}
        />
      </Stack>
    </Container>
  );
}
